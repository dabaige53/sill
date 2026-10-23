begin;
create table sill_private.backup_targets(
 owner_id uuid not null references sill_private.workspaces(owner_id) on delete cascade,
 id uuid not null, config jsonb not null, sealed jsonb not null,
 created_at timestamptz not null default clock_timestamp(), primary key(owner_id,id)
);
create table sill_private.backups(
 owner_id uuid not null, id uuid not null, target_id uuid not null, caller_id text not null,
 idem text not null check(idem ~ '^[a-zA-Z0-9_-]{8,128}$'), remote_id text,
 content text not null check(octet_length(content)<=33554432), digest text not null,
 status text not null default 'pending' check(status in ('pending','ready')),
 created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,id), unique(owner_id,caller_id,idem),
 foreign key(owner_id,target_id) references sill_private.backup_targets(owner_id,id)
);
create table sill_private.backup_restores(
 owner_id uuid not null references sill_private.workspaces(owner_id) on delete cascade,
 caller_id text not null, idem text not null, digest text not null, result jsonb not null,
 created_at timestamptz not null default clock_timestamp(),primary key(owner_id,caller_id,idem)
);
alter table sill_private.backup_targets enable row level security;
alter table sill_private.backups enable row level security;
alter table sill_private.backup_restores enable row level security;
create policy backup_target_owner on sill_private.backup_targets using(owner_id=(select sill_private.request_uid())) with check(owner_id=(select sill_private.request_uid()));
create policy backup_owner on sill_private.backups using(owner_id=(select sill_private.request_uid())) with check(owner_id=(select sill_private.request_uid()));
create policy backup_restore_owner on sill_private.backup_restores using(owner_id=(select sill_private.request_uid())) with check(owner_id=(select sill_private.request_uid()));
revoke all on sill_private.backup_targets,sill_private.backups,sill_private.backup_restores from public,anon,authenticated;
grant select,insert,update on sill_private.backup_targets,sill_private.backups,sill_private.backup_restores to sill_rpc_executor;
-- Only this narrow RPC enters the private schema. Existing user-JWT authorization and RLS apply.
create function sill_private.backup_operation(op text,p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare uid uuid:=sill_private.request_uid();actor text:=sill_private.caller(); b sill_private.backups;t sill_private.backup_targets;w sill_private.workspaces; r sill_private.backup_restores; result jsonb; v jsonb;c jsonb;s jsonb;rid text;seq bigint;request_hash text;
begin
 perform sill_private.authorize('content:read','*');
 if op in ('save_target','reserve','ready','restore') then perform sill_private.authorize('content:write','*');end if;
 if op='restore' then perform sill_private.authorize('content:delete','*');end if;
 if op='save_target' then
  if actor<>'user:'||uid::text then raise exception 'forbidden';end if;
  if p->'config'->>'provider' not in ('webdav','r2') or jsonb_typeof(p->'sealed') is distinct from 'object' then raise exception 'invalid_request';end if;
  insert into sill_private.backup_targets(owner_id,id,config,sealed) values(uid,(p->>'id')::uuid,p->'config',p->'sealed') on conflict(owner_id,id) do update set sealed=excluded.sealed where sill_private.backup_targets.config=excluded.config;
  if not found then raise exception 'revision_conflict';end if;
  return jsonb_build_object('id',p->'id','config',p->'config');
 elsif op='list' then
  return jsonb_build_object('targets',coalesce((select jsonb_agg(jsonb_build_object('id',id,'config',config,'createdAt',created_at) order by created_at desc) from sill_private.backup_targets where owner_id=uid),'[]'::jsonb),'backups',coalesce((select jsonb_agg(x.v order by created_at desc) from (select created_at,jsonb_build_object('id',id,'targetId',target_id,'createdAt',created_at,'status',status,'digest',digest) v from sill_private.backups where owner_id=uid order by created_at desc limit 200) x),'[]'::jsonb));
 elsif op='target' then
  select * into t from sill_private.backup_targets where owner_id=uid and id=(p->>'id')::uuid;
  if not found then raise exception 'not_found';end if;return to_jsonb(t);
 elsif op='by_key' then
  select * into b from sill_private.backups where owner_id=uid and caller_id=actor and idem=p->>'key';return case when found then to_jsonb(b) else 'null'::jsonb end;
 elsif op='read' or op='ready' then
  select * into b from sill_private.backups where owner_id=uid and id=(p->>'id')::uuid;
  if not found then raise exception 'not_found';end if;
  if op='ready' then
   if p->>'digest' is distinct from b.digest then raise exception 'revision_conflict';end if;
   update sill_private.backups set status='ready' where owner_id=uid and id=b.id returning * into b;
  end if;return to_jsonb(b);
 elsif op='reserve' then
  select * into w from sill_private.workspaces where owner_id=uid for update;
  select * into b from sill_private.backups where owner_id=uid and caller_id=actor and idem=p->>'key';
  if found then
   if b.target_id<>(p->>'targetId')::uuid then raise exception 'idempotency_conflict';end if;return to_jsonb(b);
  end if;
  select * into t from sill_private.backup_targets where owner_id=uid and id=(p->>'targetId')::uuid;
  if not found then raise exception 'not_found';end if;
  -- Build from the database under the workspace lock; callers cannot inject a synthetic snapshot.
  v:=jsonb_build_object('format','sill-workspace','version',1,'owner',uid,'createdAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'workspace',sill_private.get_workspace());
  insert into sill_private.backups(owner_id,id,target_id,caller_id,idem,remote_id,content,digest)
  values(uid,(p->>'id')::uuid,t.id,actor,p->>'key',p->>'remoteId',v::text,encode(sha256(convert_to(v::text,'UTF8')),'hex')) returning * into b;
  return to_jsonb(b);
 elsif op='restore_status' then
  perform sill_private.authorize('content:write','*');perform sill_private.authorize('content:delete','*');
  select * into r from sill_private.backup_restores where owner_id=uid and caller_id=actor and idem=p->>'idempotencyKey';
  if not found then return 'null'::jsonb;end if;
  request_hash:=encode(sha256(convert_to((p-'state')::text,'UTF8')),'hex');
  if r.digest<>request_hash then raise exception 'idempotency_conflict';end if;return r.result;
 elsif op='restore' then
  if p->'confirmed' is distinct from 'true'::jsonb or p->>'idempotencyKey' !~ '^[a-zA-Z0-9_-]{8,128}$' or p->>'expectedRevision' !~ '^[0-9]+$' then raise exception 'invalid_request';end if;
  select * into w from sill_private.workspaces where owner_id=uid for update;
  request_hash:=encode(sha256(convert_to((p-'state')::text,'UTF8')),'hex');
  select * into r from sill_private.backup_restores where owner_id=uid and caller_id=actor and idem=p->>'idempotencyKey';
  if found then if r.digest<>request_hash then raise exception 'idempotency_conflict';end if;return r.result;end if;
  if w.change_version<>(p->>'expectedRevision')::bigint then raise exception 'revision_conflict';end if;
  select * into b from sill_private.backups where owner_id=uid and id=(p->>'backupId')::uuid;
  if not found then raise exception 'not_found';end if;
  if b.digest is distinct from p->>'digest' or b.status<>'ready' then raise exception 'revision_conflict';end if;
  -- Restore only the immutable snapshot captured for this owner. No unrestricted state-write RPC.
  s:=b.content::jsonb->'workspace'->'state';
  perform sill_private.validate_workspace_preferences(s->'preferences');
  update sill_private.workspaces set change_version=change_version+1,preferences=s->'preferences',reading_seconds=(s->>'seconds')::numeric where owner_id=uid returning change_version into seq;
  update sill_private.contents set card='{}',item='{}',state='{}',deleted=true,revision=revision+1,change_version=seq,updated_at=clock_timestamp() where owner_id=uid and not deleted and id not in (select value->>'id' from jsonb_array_elements(s->'cards'));
  for c in select * from jsonb_array_elements(s->'cards') loop
   rid:=c->>'id';v:=coalesce(s->'items'->rid,'{}'::jsonb);perform sill_private.validate_workspace_state(v);
   c:=c-'id'-'state'-'revision'-'created_at'-'updated_at'-'deleted'-'owner_id'-'change_version';
   insert into sill_private.contents(owner_id,id,card,state,content_type,change_version) values(uid,rid,c,v,c->>'type',seq)
   on conflict(owner_id,id) do update set card=excluded.card,state=excluded.state,item='{}',content_type=excluded.content_type,deleted=false,revision=sill_private.contents.revision+1,change_version=seq,updated_at=clock_timestamp();
  end loop;
  result:=jsonb_build_object('restored',true,'revision',seq,'backupId',b.id);
  insert into sill_private.backup_restores(owner_id,caller_id,idem,digest,result) values(uid,actor,p->>'idempotencyKey',request_hash,result);
  return result;
 else raise exception 'invalid_request';end if;
end $$;
create function sill_private.api_backup_operation(op text,p jsonb) returns jsonb language sql security definer set search_path='' set row_security=on as $$select sill_private.backup_operation(op,p)$$;
create function public.sill_backup_operation(op text,p jsonb) returns jsonb language sql security invoker set search_path='' as $$select sill_private.api_backup_operation(op,p)$$;
revoke all on function sill_private.backup_operation(text,jsonb),sill_private.api_backup_operation(text,jsonb),public.sill_backup_operation(text,jsonb) from public,anon,authenticated;
grant execute on function sill_private.backup_operation(text,jsonb) to sill_rpc_executor;
grant sill_rpc_executor to current_user with inherit false,set true;
grant create on schema sill_private to sill_rpc_executor;
alter function sill_private.api_backup_operation(text,jsonb) owner to sill_rpc_executor;
revoke create on schema sill_private from sill_rpc_executor;
set local role sill_rpc_executor;
grant execute on function sill_private.api_backup_operation(text,jsonb) to authenticated;
reset role;
revoke set option for sill_rpc_executor from current_user;
grant execute on function public.sill_backup_operation(text,jsonb) to authenticated;
commit;

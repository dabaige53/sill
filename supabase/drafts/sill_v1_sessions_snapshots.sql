-- REVIEW ONLY after boundary. Separate session/capability lookup from materialized lists.
begin;
create table sill_private.list_snapshots (
 owner_id uuid not null references sill_private.workspaces(owner_id) on delete cascade,
 id uuid not null default gen_random_uuid(), caller_id text not null,
 items jsonb not null check(jsonb_typeof(items)='array' and octet_length(items::text)<=2097152),
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null,
 primary key(owner_id,id), check(expires_at>created_at and expires_at<=created_at+interval '15 minutes')
);
alter table sill_private.list_snapshots enable row level security;
create policy owner_rows on sill_private.list_snapshots for all using(owner_id=auth.uid()) with check(owner_id=auth.uid());
alter table sill_private.sync_snapshots add column snapshot_id uuid;
alter table sill_private.sync_snapshots add foreign key(owner_id,snapshot_id) references sill_private.list_snapshots(owner_id,id) on delete cascade;
-- Prior prototype cursors are incompatible and contain duplicated projections.
-- This review migration explicitly invalidates/purges only ephemeral cursors, not content/receipts.
delete from sill_private.sync_snapshots;
create index snapshots_expiry on sill_private.list_snapshots(owner_id,expires_at);
create index cursor_expiry on sill_private.sync_snapshots(owner_id,expires_at);
revoke all on sill_private.list_snapshots from public,anon,authenticated;
grant select,insert,delete on sill_private.list_snapshots to sill_rpc_executor;
grant delete on sill_private.sync_snapshots to sill_rpc_executor;

create function sill_private.session_info() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); g sill_private.caller_grants;
begin
 select * into g from sill_private.caller_grants where owner_id=uid and caller_id=sill_private.caller();
 if not found or cardinality(g.scopes)=0 or cardinality(g.resources)=0 then raise exception 'forbidden'; end if;
 -- Reuse the exact claim, expiry, audience and per-client checks; no borrowed owner grants.
 perform sill_private.authorize(g.scopes[1],g.resources[1]);
 if not exists(select 1 from sill_private.workspaces where owner_id=uid) then raise exception 'not_found'; end if;
 delete from sill_private.sync_snapshots where owner_id=uid and expires_at<=clock_timestamp();
 delete from sill_private.list_snapshots where owner_id=uid and expires_at<=clock_timestamp();
 return jsonb_build_object('userId',uid,'scopes',g.scopes,'workspaceRead',('content:read'=any(g.scopes) and '*'=any(g.resources)),'workspaceWrite',('content:write'=any(g.scopes) and '*'=any(g.resources)));
end $$;
create function sill_private.api_session_info() returns jsonb
language sql security definer set search_path='' set row_security=on as $$select sill_private.session_info()$$;
create function public.sill_session_info() returns jsonb
language sql security invoker set search_path='' as $$select sill_private.api_session_info()$$;
revoke all on function sill_private.session_info(),sill_private.api_session_info(),public.sill_session_info() from public,anon,authenticated;
grant execute on function sill_private.session_info() to sill_rpc_executor;
grant sill_rpc_executor to current_user with inherit false,set true;
grant create on schema sill_private to sill_rpc_executor;
alter function sill_private.api_session_info() owner to sill_rpc_executor;
revoke create on schema sill_private from sill_rpc_executor;
set local role sill_rpc_executor;
grant execute on function sill_private.api_session_info() to authenticated;
reset role;
revoke set option for sill_rpc_executor from current_user;
grant execute on function public.sill_session_info() to authenticated;

-- Existing list_contents is owned by the installer and remains SECURITY INVOKER.
create or replace function sill_private.list_contents(cursor_token text default null,since_token text default null,requested_limit integer default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid();actor text:=sill_private.caller();s sill_private.sync_snapshots;prev sill_private.sync_snapshots;
 items jsonb;page jsonb;watermark bigint;since_version bigint:=0;page_size integer:=coalesce(requested_limit,50);
 next_token text;sync_token text;offset_value integer:=0;query_hash text;sid uuid;expiry timestamptz;row_count bigint;byte_count bigint;
begin
 perform sill_private.authorize('content:read','*');
 if cursor_token is not null and since_token is not null or page_size not between 1 and 100 then raise exception 'invalid_request';end if;
 select change_version into watermark from sill_private.workspaces where owner_id=uid for update;
 if not found then raise exception 'not_found';end if;
 delete from sill_private.sync_snapshots where owner_id=uid and expires_at<=clock_timestamp();
 delete from sill_private.list_snapshots where owner_id=uid and expires_at<=clock_timestamp();
 if cursor_token is not null then
  select * into s from sill_private.sync_snapshots where owner_id=uid and caller_id=actor and kind='page'
   and token_hash=encode(sha256(convert_to(cursor_token,'UTF8')),'hex');
  if not found then raise exception 'cursor_expired';end if;
  if requested_limit is not null and requested_limit<>s.page_size then raise exception 'invalid_request';end if;
  select x.items,x.expires_at into items,expiry from sill_private.list_snapshots x where x.owner_id=uid and x.id=s.snapshot_id and x.caller_id=actor;
  if not found then raise exception 'cursor_expired';end if;
  sid:=s.snapshot_id;watermark:=s.watermark;page_size:=s.page_size;offset_value:=s.page_offset;query_hash:=s.query_digest;
 else
  if since_token is not null then
   select * into prev from sill_private.sync_snapshots where owner_id=uid and caller_id=actor and kind='sync'
    and token_hash=encode(sha256(convert_to(since_token,'UTF8')),'hex');
   if not found then raise exception 'cursor_expired';end if;
   since_version:=prev.watermark;
  end if;
  select count(*),coalesce(sum(octet_length(sill_private.content_json(c)::text)),0) into row_count,byte_count
   from sill_private.contents c where c.owner_id=uid and c.change_version>since_version and (since_token is not null or not c.deleted);
  if row_count>1000 or byte_count+row_count*2>2097152 then raise exception 'rate_limited';end if;
  select coalesce(jsonb_agg(sill_private.content_json(c) order by c.id),'[]') into items from sill_private.contents c
   where c.owner_id=uid and c.change_version>since_version and (since_token is not null or not c.deleted);
  query_hash:=encode(sha256(convert_to(jsonb_build_object('since',since_version,'limit',page_size)::text,'UTF8')),'hex');
  if row_count>page_size then
   -- Per-owner upper bound: 8 shared snapshots, each <=2MiB, with 15-minute fixed lifetime.
   delete from sill_private.list_snapshots where owner_id=uid and id in
    (select x.id from sill_private.list_snapshots x where x.owner_id=uid order by x.created_at desc,x.id offset 7);
   expiry:=clock_timestamp()+interval '15 minutes';
   insert into sill_private.list_snapshots(owner_id,caller_id,items,expires_at) values(uid,actor,items,expiry) returning id into sid;
  end if;
 end if;
 select coalesce(jsonb_agg(value order by ordinality),'[]') into page from jsonb_array_elements(items) with ordinality
  where ordinality>offset_value and ordinality<=offset_value+page_size;
 -- Cursors contain only references/watermarks. Bound all callers of one owner to 128 rows.
 delete from sill_private.sync_snapshots where owner_id=uid and token_hash in
  (select x.token_hash from sill_private.sync_snapshots x where x.owner_id=uid order by x.created_at desc,x.token_hash offset 127);
 if jsonb_array_length(items)>offset_value+page_size then
  next_token:=gen_random_uuid()::text;
  insert into sill_private.sync_snapshots(owner_id,caller_id,token_hash,query_digest,watermark,items,snapshot_id,page_offset,page_size,expires_at)
   values(uid,actor,encode(sha256(convert_to(next_token,'UTF8')),'hex'),query_hash,watermark,'[]',sid,offset_value+page_size,page_size,expiry);
 else
  sync_token:=gen_random_uuid()::text;
  insert into sill_private.sync_snapshots(owner_id,caller_id,token_hash,query_digest,watermark,items,kind,expires_at)
   values(uid,actor,encode(sha256(convert_to(sync_token,'UTF8')),'hex'),query_hash,watermark,'[]','sync',clock_timestamp()+interval '1 day');
 end if;
 return jsonb_build_object('items',page,'next_cursor',next_token,'sync_cursor',sync_token);
end $$;
commit;

-- LOCAL REVIEW PROTOTYPE. Apply after sill_v1_storage.sql in a disposable DB only.
-- No public wrappers, production grants, delivery worker, or live credentials.
begin;
create table sill_private.caller_grants (
 owner_id uuid not null references sill_private.workspaces(owner_id) on delete cascade,
 caller_id text not null,
 scopes text[] not null,
 resources text[] not null default '{}',
 primary key(owner_id,caller_id)
);
create table sill_private.destinations (
 owner_id uuid not null references sill_private.workspaces(owner_id) on delete cascade,
 ref text not null,
 assigned_caller text not null,
 actions text[] not null default '{}',
 enabled boolean not null default false,
 primary key(owner_id,ref)
);
alter table sill_private.contents add column content_type text not null default 'note';
alter table sill_private.events add column submitted_by text not null default '';
alter table sill_private.events add column request_body jsonb not null default '{}';
alter table sill_private.sync_snapshots add column page_offset integer not null default 0;
alter table sill_private.sync_snapshots add column page_size integer not null default 50;
alter table sill_private.sync_snapshots add column kind text not null default 'page' check(kind in ('page','sync'));
alter table sill_private.caller_grants enable row level security;
alter table sill_private.destinations enable row level security;

create function sill_private.caller() returns text language sql stable security invoker set search_path='' as $$
 select case when auth.jwt()->>'client_id' is null then 'user:'||auth.uid()::text
 else 'oauth:'||(auth.jwt()->>'client_id') end
$$;
create function sill_private.authorize(required_scope text, resource text default '*') returns void
language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
  raise exception 'unauthenticated';
 end if;
 if not exists(select 1 from sill_private.caller_grants g where g.owner_id=auth.uid()
   and g.caller_id=sill_private.caller() and required_scope=any(g.scopes)
   and (resource=any(g.resources) or '*'=any(g.resources))) then raise exception 'forbidden'; end if;
end $$;

-- Defense in depth; schema remains outside the Data API. No direct table grants.
create policy own_workspace on sill_private.workspaces using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy own_content on sill_private.contents using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy own_event on sill_private.events using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy own_receipt on sill_private.receipts using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy own_snapshot on sill_private.sync_snapshots using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy own_grants on sill_private.caller_grants for select using(owner_id=(select auth.uid()) and caller_id=sill_private.caller());
create policy own_destinations on sill_private.destinations for select using(owner_id=(select auth.uid()));

create function sill_private.content_json(c sill_private.contents) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',c.id,'type',c.content_type,'title',case when c.deleted then '已删除' else c.card->>'title' end,
 'body',case when c.deleted then '[]'::jsonb else coalesce(c.card->'body','[]') end,
 'state',c.state,'revision',c.revision,'created_at',to_char(c.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'updated_at',to_char(c.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'deleted',c.deleted)
 ||case when not c.deleted and c.card ? 'url' then jsonb_build_object('url',c.card->'url') else '{}'::jsonb end
$$;
create function sill_private.event_json(e sill_private.events) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('event_id',e.event_id,'card_id',e.card_id,'card_version',e.card_version,'action',e.action,
 'destination_ref',e.destination_ref,'delivery',e.delivery,'outcome',e.outcome,'result_revision',e.result_revision,'summary',e.summary,
 'created_at',to_char(e.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'updated_at',to_char(e.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
$$;

create function sill_private.validate_changes(ch jsonb, creating boolean default false) returns void
language plpgsql immutable security invoker set search_path='' as $$
declare k text; v jsonb;
begin
 if jsonb_typeof(ch) is distinct from 'object' or ch='{}' then raise exception 'invalid_request'; end if;
 if creating and not (ch ? 'title' and ch ? 'type') then raise exception 'invalid_request'; end if;
 for k,v in select * from jsonb_each(ch) loop
  if k not in ('title','type','body','url','state') or v='null' then raise exception 'invalid_request'; end if;
  if k='title' and (jsonb_typeof(v)<>'string' or length(ch->>'title') not between 1 and 1000) then raise exception 'invalid_request'; end if;
  if k='type' and (jsonb_typeof(v)<>'string' or ch->>'type' not in ('article','mail','note','task','event','reminder','media','insight','digest','suggestion','photo','file')) then raise exception 'invalid_request'; end if;
  if k='url' and (jsonb_typeof(v)<>'string' or ch->>'url' !~ '^https?://[^ /]+') then raise exception 'invalid_request'; end if;
  if k='body' then
   if jsonb_typeof(v)<>'array' then raise exception 'invalid_request'; end if;
   if jsonb_array_length(v)>100 or exists(select 1 from jsonb_array_elements(v) b where jsonb_typeof(b)<>'string' or length(b#>>'{}')>50000) then raise exception 'invalid_request'; end if;
  end if;
  if k='state' then
   if jsonb_typeof(v)<>'object' then raise exception 'invalid_request'; end if;
   if exists(select 1 from jsonb_each(v) s where s.key not in ('read','done','archived') or jsonb_typeof(s.value)<>'boolean') then raise exception 'invalid_request'; end if;
  end if;
 end loop;
end $$;

create function sill_private.write_v1(op text, resource_id text, payload jsonb, idem text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 uid uuid:=auth.uid(); actor text:=sill_private.caller(); scope text; digest text; receipt sill_private.receipts;
 c sill_private.contents; e sill_private.events; d sill_private.destinations;
 ch jsonb; meta jsonb; next_card jsonb; next_state jsonb; result jsonb; status integer:=200; changed boolean:=false;
 seq bigint; expected bigint; event_target text;
begin
 if op not in ('create','update','delete','submit_event') then raise exception 'invalid_request'; end if;
 scope:=case op when 'delete' then 'content:delete' when 'submit_event' then 'event:submit' else 'content:write' end;
 perform sill_private.authorize(scope,case when op='create' then '*' when op='submit_event' then payload->>'card_id' else resource_id end);
 if jsonb_typeof(payload) is distinct from 'object' or idem is null or idem !~ '^[a-zA-Z0-9_-]{8,128}$' then raise exception 'invalid_request'; end if;
 if op in ('update','delete') and (resource_id is null or resource_id !~ '^[a-zA-Z0-9_-]{1,100}$') then raise exception 'invalid_request'; end if;
 if op in ('create','submit_event') and resource_id is not null then raise exception 'invalid_request'; end if;
 if payload ? 'metadata' then perform sill_private.authorize('event:result',resource_id); end if;
 -- Authorization before receipt replay; serialize all writes for this owner.
 perform 1 from sill_private.workspaces where owner_id=uid for update;
 if not found then raise exception 'not_found'; end if;
 digest:=encode(sha256(convert_to(jsonb_build_object('op',op,'resource',resource_id,'payload',payload)::text,'UTF8')),'hex');
 select * into receipt from sill_private.receipts where owner_id=uid and caller_id=actor and operation_resource=op||':'||coalesce(resource_id,'') and idempotency_key=idem;
 if found then
  if receipt.request_digest<>digest then raise exception 'idempotency_conflict'; end if;
  if receipt.expires_at<=clock_timestamp() then raise exception 'idempotency_expired'; end if;
  return jsonb_build_object('status_code',receipt.status_code,'body',receipt.response);
 end if;
 if op='create' then
  perform sill_private.validate_changes(payload,true);
  update sill_private.workspaces set change_version=change_version+1 where owner_id=uid returning change_version into seq;
  insert into sill_private.contents(owner_id,id,card,state,content_type,change_version)
  values(uid,gen_random_uuid()::text,jsonb_build_object('body','[]'::jsonb)||(payload-'state'),coalesce(payload->'state','{}'),payload->>'type',seq) returning * into c;
  result:=sill_private.content_json(c);status:=201;
 elsif op='submit_event' then
  if exists(select 1 from jsonb_object_keys(payload) k where k not in ('event_id','card_id','card_version','action','destination_ref'))
   or not payload ?& array['event_id','card_id','card_version','action','destination_ref']
   or jsonb_typeof(payload->'event_id')<>'string' or payload->>'event_id' !~ '^[a-zA-Z0-9_-]{1,100}$'
   or jsonb_typeof(payload->'card_id')<>'string' or payload->>'card_id' !~ '^[a-zA-Z0-9_-]{1,100}$'
   or jsonb_typeof(payload->'card_version')<>'number' or payload->>'card_version' !~ '^[0-9]+$'
   or (payload->>'card_version')::numeric not between 1 and 9007199254740991
   or jsonb_typeof(payload->'action')<>'string' or payload->>'action' not in ('summarize','complete')
   or jsonb_typeof(payload->'destination_ref')<>'string' or payload->>'destination_ref' !~ '^[a-zA-Z0-9_-]{1,100}$' then raise exception 'invalid_request'; end if;
  select * into d from sill_private.destinations where owner_id=uid and ref=payload->>'destination_ref' and enabled and payload->>'action'=any(actions);
  if not found then raise exception 'forbidden'; end if;
  select * into e from sill_private.events where owner_id=uid and event_id=payload->>'event_id';
  if found then
   if e.request_body<>payload or e.submitted_by<>actor then raise exception 'idempotency_conflict'; end if;
  else
   select * into c from sill_private.contents where owner_id=uid and id=payload->>'card_id' and not deleted;
   if not found then raise exception 'not_found'; end if;
   if c.revision<>(payload->>'card_version')::bigint then raise exception 'revision_conflict'; end if;
   insert into sill_private.events(owner_id,event_id,card_id,card_version,action,destination_ref,assigned_caller,submitted_by,request_body)
   values(uid,payload->>'event_id',c.id,c.revision,payload->>'action',d.ref,d.assigned_caller,actor,payload) returning * into e;
  end if;
  result:=sill_private.event_json(e);status:=202;
 else
  if not payload ? 'expectedRevision' or jsonb_typeof(payload->'expectedRevision')<>'number'
    or payload->>'expectedRevision' !~ '^[0-9]+$' or (payload->>'expectedRevision')::numeric not between 0 and 9007199254740991
    or exists(select 1 from jsonb_object_keys(payload) k where k not in ('expectedRevision','changes','metadata')) then raise exception 'invalid_request'; end if;
  if op='delete' and (payload ? 'changes' or payload ? 'metadata') then raise exception 'invalid_request'; end if;
  expected:=(payload->>'expectedRevision')::bigint;
  select * into c from sill_private.contents where owner_id=uid and id=resource_id and not deleted for update;
  if not found then raise exception 'not_found'; end if;
  if c.revision<>expected then raise exception 'revision_conflict'; end if;
  if op='delete' then
   changed:=true;next_card:='{}';next_state:='{}';
  else
   if not (payload ? 'changes' or payload ? 'metadata') then raise exception 'invalid_request'; end if;
   ch:=coalesce(payload->'changes','{}');
   if payload ? 'changes' then perform sill_private.validate_changes(ch); end if;
   next_card:=c.card||(ch-'state');next_state:=c.state||coalesce(ch->'state','{}');
   changed:=next_card<>c.card or next_state<>c.state;
   if payload ? 'metadata' then
    meta:=payload->'metadata';
    if jsonb_typeof(meta) is distinct from 'object' or not meta ?& array['event_id','outcome','summary']
      or exists(select 1 from jsonb_object_keys(meta) k where k not in ('event_id','outcome','summary'))
      or jsonb_typeof(meta->'event_id')<>'string' or meta->>'event_id' !~ '^[a-zA-Z0-9_-]{1,100}$'
      or jsonb_typeof(meta->'outcome')<>'string' or meta->>'outcome' not in ('succeeded','failed','unknown')
      or jsonb_typeof(meta->'summary')<>'string' or length(meta->>'summary')>2000 then raise exception 'invalid_request'; end if;
    select * into e from sill_private.events where owner_id=uid and event_id=meta->>'event_id' for update;
    if not found or e.card_id<>c.id then raise exception 'not_found'; end if;
    if e.assigned_caller<>actor then raise exception 'forbidden'; end if;
    -- Conservatively require original intent version; reconciliation is a separate future workflow.
    if e.card_version<>c.revision then raise exception 'revision_conflict'; end if;
    if e.outcome<>'pending' then raise exception 'event_terminal_conflict'; end if;
    if meta->>'outcome'<>'succeeded' and ch->'state'->'done'='true'::jsonb then raise exception 'invalid_request'; end if;
   end if;
  end if;
  if changed then
   update sill_private.workspaces set change_version=change_version+1 where owner_id=uid returning change_version into seq;
   update sill_private.contents set card=next_card,state=next_state,item=case when op='delete' then '{}'::jsonb else item end,
    content_type=coalesce(next_card->>'type',content_type),deleted=(op='delete'),revision=revision+1,change_version=seq,updated_at=clock_timestamp()
    where owner_id=uid and id=resource_id returning * into c;
  end if;
  if meta is not null then
   update sill_private.events set outcome=meta->>'outcome',summary=meta->>'summary',result_revision=c.revision,updated_at=clock_timestamp()
    where owner_id=uid and event_id=e.event_id;
  end if;
  result:=sill_private.content_json(c);
 end if;
 insert into sill_private.receipts(owner_id,caller_id,operation_resource,idempotency_key,request_digest,status_code,response,expires_at)
 values(uid,actor,op||':'||coalesce(resource_id,''),idem,digest,status,result,clock_timestamp()+interval '7 days');
 return jsonb_build_object('status_code',status,'body',result);
end $$;

create function sill_private.get_content(resource_id text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c sill_private.contents;
begin
 perform sill_private.authorize('content:read',resource_id);
 select * into c from sill_private.contents where owner_id=auth.uid() and id=resource_id and not deleted;
 if not found then raise exception 'not_found'; end if;
 return sill_private.content_json(c);
end $$;
create function sill_private.get_event(event_id text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare e sill_private.events;
begin
 select * into e from sill_private.events where owner_id=auth.uid() and events.event_id=get_event.event_id;
 if not found then raise exception 'not_found'; end if;
 perform sill_private.authorize('event:read',e.card_id);
 if e.submitted_by<>sill_private.caller() and e.assigned_caller<>sill_private.caller() then raise exception 'forbidden'; end if;
 return sill_private.event_json(e);
end $$;

create function sill_private.list_contents(cursor_token text default null, since_token text default null, requested_limit integer default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); actor text:=sill_private.caller(); s sill_private.sync_snapshots; prev sill_private.sync_snapshots;
 items jsonb; page jsonb; watermark bigint; since_version bigint:=0; page_size integer:=coalesce(requested_limit,50);
 next_token text; sync_token text; offset_value integer:=0; query_hash text;
begin
 -- Prototype list requires an explicit whole-workspace read grant, never silently broadens scoped callers.
 perform sill_private.authorize('content:read','*');
 if cursor_token is not null and since_token is not null or page_size not between 1 and 100 then raise exception 'invalid_request'; end if;
 if cursor_token is not null then
  select * into s from sill_private.sync_snapshots where owner_id=uid and caller_id=actor and kind='page'
   and token_hash=encode(sha256(convert_to(cursor_token,'UTF8')),'hex') and expires_at>clock_timestamp();
  if not found then raise exception 'cursor_expired'; end if;
  if requested_limit is not null and requested_limit<>s.page_size then raise exception 'invalid_request'; end if;
  items:=s.items;watermark:=s.watermark;page_size:=s.page_size;offset_value:=s.page_offset;query_hash:=s.query_digest;
 else
  if since_token is not null then
   select * into prev from sill_private.sync_snapshots where owner_id=uid and caller_id=actor and kind='sync'
    and token_hash=encode(sha256(convert_to(since_token,'UTF8')),'hex') and expires_at>clock_timestamp();
   if not found then raise exception 'cursor_expired'; end if;
   since_version:=prev.watermark;
  end if;
  select change_version into watermark from sill_private.workspaces where owner_id=uid for update;
  if not found then raise exception 'not_found'; end if;
  select coalesce(jsonb_agg(sill_private.content_json(c) order by c.id),'[]') into items from sill_private.contents c
   where c.owner_id=uid and c.change_version>since_version and (since_token is not null or not c.deleted);
  query_hash:=encode(sha256(convert_to(jsonb_build_object('since',since_version,'limit',page_size)::text,'UTF8')),'hex');
 end if;
 select coalesce(jsonb_agg(value order by ordinality),'[]') into page from jsonb_array_elements(items) with ordinality
  where ordinality>offset_value and ordinality<=offset_value+page_size;
 if jsonb_array_length(items)>offset_value+page_size then
  next_token:=gen_random_uuid()::text;
  insert into sill_private.sync_snapshots(owner_id,caller_id,token_hash,query_digest,watermark,items,page_offset,page_size,expires_at)
   values(uid,actor,encode(sha256(convert_to(next_token,'UTF8')),'hex'),query_hash,watermark,items,offset_value+page_size,page_size,
     coalesce(s.expires_at,clock_timestamp()+interval '1 day'));
 else
  sync_token:=gen_random_uuid()::text;
  insert into sill_private.sync_snapshots(owner_id,caller_id,token_hash,query_digest,watermark,items,kind,expires_at)
   values(uid,actor,encode(sha256(convert_to(sync_token,'UTF8')),'hex'),query_hash,watermark,'[]','sync',clock_timestamp()+interval '1 day');
 end if;
 return jsonb_build_object('items',page,'next_cursor',next_token,'sync_cursor',sync_token);
end $$;
revoke all on all functions in schema sill_private from public,anon,authenticated;
revoke all on all tables in schema sill_private from public,anon,authenticated;
commit;

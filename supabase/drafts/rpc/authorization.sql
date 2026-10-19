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

-- Only PostgREST's verified, transaction-local JWT claims are accepted. These helpers
-- do not verify signatures and accept no identity arguments or legacy per-claim GUCs.
-- No generic SQL/set_config RPC or authenticated database login may be exposed.
create function sill_private.request_claims() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare raw text:=pg_catalog.current_setting('request.jwt.claims',true); claims jsonb;
begin
 if raw is null or raw='' then return '{}'::jsonb;end if;
 if octet_length(raw)>32768 then raise exception 'unauthenticated';end if;
 begin claims:=raw::jsonb;exception when invalid_text_representation then raise exception 'unauthenticated';end;
 if jsonb_typeof(claims)<>'object' then raise exception 'unauthenticated';end if;
 return claims;
end $$;
create function sill_private.request_uid() returns uuid
language plpgsql stable security invoker set search_path='' as $$
declare claims jsonb:=sill_private.request_claims();
begin
 if jsonb_typeof(claims->'sub') is distinct from 'string'
   or (claims->>'sub') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null;end if;
 return (claims->>'sub')::uuid;
end $$;

create function sill_private.caller() returns text language sql stable security invoker set search_path='' as $$
 select case when sill_private.request_claims()->>'client_id' is null then 'user:'||sill_private.request_uid()::text
 else 'oauth:'||(sill_private.request_claims()->>'client_id') end
$$;
create function sill_private.authorize(required_scope text, resource text default '*') returns void
language plpgsql stable security invoker set search_path='' as $$
begin
 if sill_private.request_uid() is null or coalesce((sill_private.request_claims()->>'is_anonymous')::boolean,false) then
  raise exception 'unauthenticated';
 end if;
 if not exists(select 1 from sill_private.caller_grants g where g.owner_id=sill_private.request_uid()
   and g.caller_id=sill_private.caller() and required_scope=any(g.scopes)
   and (resource=any(g.resources) or '*'=any(g.resources))) then raise exception 'forbidden'; end if;
end $$;

-- Defense in depth; schema remains outside the Data API. No direct table grants.
create policy own_workspace on sill_private.workspaces using(owner_id=(select sill_private.request_uid())) with check(owner_id=(select sill_private.request_uid()));
create policy own_content on sill_private.contents using(owner_id=(select sill_private.request_uid())) with check(owner_id=(select sill_private.request_uid()));
create policy own_event on sill_private.events using(owner_id=(select sill_private.request_uid())) with check(owner_id=(select sill_private.request_uid()));
create policy own_receipt on sill_private.receipts using(owner_id=(select sill_private.request_uid())) with check(owner_id=(select sill_private.request_uid()));
create policy own_snapshot on sill_private.sync_snapshots using(owner_id=(select sill_private.request_uid())) with check(owner_id=(select sill_private.request_uid()));
create policy own_grants on sill_private.caller_grants for select using(owner_id=(select sill_private.request_uid()) and caller_id=sill_private.caller());
create policy own_destinations on sill_private.destinations for select using(owner_id=(select sill_private.request_uid()));

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


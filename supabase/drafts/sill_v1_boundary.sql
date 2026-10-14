-- REVIEW ONLY. Apply after the two preparation drafts in an isolated database.
-- A separate NOLOGIN/NOBYPASSRLS role executes only the checked entry functions.
-- It owns no tables. authenticated receives NO direct table privileges.
begin;
create role sill_rpc_executor nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
alter table sill_private.caller_grants add column audience text;
-- Existing grants deliberately stop working until their intended audience is reviewed.
create or replace function sill_private.authorize(required_scope text, resource text default '*') returns void
language plpgsql stable security invoker set search_path='' as $$
declare claims jsonb:=auth.jwt();
begin
 if auth.uid() is null or claims->>'role' is distinct from 'authenticated'
    or coalesce((claims->>'is_anonymous')::boolean,false)
    or jsonb_typeof(claims->'exp') is distinct from 'number'
    or (claims->>'exp')::numeric<=extract(epoch from statement_timestamp())
    or (claims ? 'nbf' and (claims->>'nbf')::numeric>extract(epoch from statement_timestamp())) then
  raise exception 'unauthenticated';
 end if;
 if claims ? 'client_id' and (jsonb_typeof(claims->'client_id')<>'string' or length(claims->>'client_id')=0) then
  raise exception 'unauthenticated';
 end if;
 if not exists(select 1 from sill_private.caller_grants g
   where g.owner_id=auth.uid() and g.caller_id=sill_private.caller()
   and required_scope=any(g.scopes) and (resource=any(g.resources) or '*'=any(g.resources))
   and g.audience is not null
   and (claims->>'aud'=g.audience or claims->'aud' @> jsonb_build_array(g.audience))
   and ((not (claims ? 'client_id') and g.audience='authenticated')
        or (claims ? 'client_id' and g.audience<>'authenticated'))) then
  raise exception 'forbidden';
 end if;
end $$;

-- Invoker routines still enforce owner RLS plus caller/resource/scope checks.
-- No identity, SQL text, table name or grant parameters are accepted by these gateways.
create function sill_private.api_write(op text, resource_id text, payload jsonb, idem text) returns jsonb
language sql security definer set search_path='' set row_security=on as $$
 select sill_private.write_v1(op,resource_id,payload,idem)
$$;
create function sill_private.api_get_content(resource_id text) returns jsonb
language sql security definer set search_path='' set row_security=on as $$
 select sill_private.get_content(resource_id)
$$;
create function sill_private.api_get_event(event_id text) returns jsonb
language sql security definer set search_path='' set row_security=on as $$
 select sill_private.get_event(event_id)
$$;
create function sill_private.api_list_contents(cursor_token text default null, since_token text default null, requested_limit integer default null) returns jsonb
language sql security definer set search_path='' set row_security=on as $$
 select sill_private.list_contents(cursor_token,since_token,requested_limit)
$$;

-- PostgREST exposes only these fixed, typed business functions in public.
create function public.sill_write_v1(op text, resource_id text, payload jsonb, idem text) returns jsonb
language sql security invoker set search_path='' as $$ select sill_private.api_write(op,resource_id,payload,idem) $$;
create function public.sill_get_content(resource_id text) returns jsonb
language sql security invoker set search_path='' as $$ select sill_private.api_get_content(resource_id) $$;
create function public.sill_get_event(event_id text) returns jsonb
language sql security invoker set search_path='' as $$ select sill_private.api_get_event(event_id) $$;
create function public.sill_list_contents(cursor_token text default null, since_token text default null, requested_limit integer default null) returns jsonb
language sql security invoker set search_path='' as $$ select sill_private.api_list_contents(cursor_token,since_token,requested_limit) $$;

revoke all on all tables in schema sill_private from public,anon,authenticated;
revoke all on all functions in schema sill_private from public,anon,authenticated;
revoke all on function public.sill_write_v1(text,text,jsonb,text), public.sill_get_content(text),
 public.sill_get_event(text), public.sill_list_contents(text,text,integer) from public,anon,authenticated;
grant usage on schema auth,sill_private to sill_rpc_executor;
grant execute on function auth.uid(),auth.jwt() to sill_rpc_executor;
grant select,update on sill_private.workspaces to sill_rpc_executor;
grant select,insert,update on sill_private.contents,sill_private.events to sill_rpc_executor;
grant select,insert on sill_private.receipts,sill_private.sync_snapshots to sill_rpc_executor;
grant select on sill_private.caller_grants,sill_private.destinations to sill_rpc_executor;
grant execute on function sill_private.caller(),sill_private.authorize(text,text),
 sill_private.content_json(sill_private.contents),sill_private.event_json(sill_private.events),
 sill_private.validate_changes(jsonb,boolean),sill_private.write_v1(text,text,jsonb,text),
 sill_private.get_content(text),sill_private.get_event(text),sill_private.list_contents(text,text,integer) to sill_rpc_executor;
-- Temporary CREATE permits ownership transfer; never grant role membership to API users.
grant create on schema sill_private to sill_rpc_executor;
alter function sill_private.api_write(text,text,jsonb,text) owner to sill_rpc_executor;
alter function sill_private.api_get_content(text) owner to sill_rpc_executor;
alter function sill_private.api_get_event(text) owner to sill_rpc_executor;
alter function sill_private.api_list_contents(text,text,integer) owner to sill_rpc_executor;
revoke create on schema sill_private from sill_rpc_executor;
grant usage on schema sill_private to authenticated;
grant execute on function sill_private.api_write(text,text,jsonb,text),sill_private.api_get_content(text),
 sill_private.api_get_event(text),sill_private.api_list_contents(text,text,integer) to authenticated;
grant execute on function public.sill_write_v1(text,text,jsonb,text),public.sill_get_content(text),
 public.sill_get_event(text),public.sill_list_contents(text,text,integer) to authenticated;
commit;

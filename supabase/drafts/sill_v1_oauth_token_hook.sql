-- REVIEW ONLY. After oauth_consent. Does not register a Supabase Auth hook.
-- supabase_auth_admin exists in Supabase; isolated fixtures create a NOLOGIN stand-in.
begin;
create role sill_oauth_issuer nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant sill_oauth_issuer to current_user with inherit false, set true;
create table sill_private.oauth_token_sessions(
 owner_id uuid not null, client_id uuid not null, session_id uuid not null,
 consent_version bigint not null, created_at timestamptz not null default statement_timestamp(),
 primary key(owner_id,client_id,session_id),
 foreign key(owner_id,client_id) references sill_private.oauth_clients(owner_id,client_id)
);
alter table sill_private.oauth_token_sessions enable row level security;
-- Only Auth can call the exact hook; issuer has no login and owns no tables.
create policy issuer_sessions on sill_private.oauth_token_sessions to sill_oauth_issuer using(true) with check(true);
create policy issuer_clients on sill_private.oauth_clients for select to sill_oauth_issuer using(true);
create policy issuer_client_lock on sill_private.oauth_clients for update to sill_oauth_issuer using(true) with check(true);
create policy issuer_grants on sill_private.caller_grants for select to sill_oauth_issuer using(true);
create function sill_private.oauth_access_token_hook(event jsonb) returns jsonb
language plpgsql security definer set search_path='' set row_security=on as $$
declare claims jsonb:=event->'claims'; uid uuid; cid uuid; sid uuid;
 c sill_private.oauth_clients; g sill_private.caller_grants; v bigint;
begin
 -- Ordinary login and unrelated clients retain exactly their existing claims/audience.
 if not (claims ? 'client_id') then return jsonb_build_object('claims',claims);end if;
 if coalesce(claims->>'client_id','')!~'^[0-9a-fA-F-]{36}$' then return jsonb_build_object('claims',claims);end if;
 cid:=(claims->>'client_id')::uuid;uid:=(event->>'user_id')::uuid;
 if uid is null or claims->>'sub' is distinct from uid::text then raise exception 'invalid_hook_identity';end if;
 select * into c from sill_private.oauth_clients where owner_id=uid and client_id=cid for update;
 if not found then return jsonb_build_object('claims',claims);end if;
 claims:=claims-'sill_consent_version';
 if not c.enabled or c.policy->>'audience' is distinct from (c.policy->>'appOrigin')||'/mcp' or c.policy->>'appOrigin' not like 'https://%' then
  return jsonb_build_object('claims',claims);
 end if;
 claims:=jsonb_set(claims,'{aud}',to_jsonb(c.policy->>'audience'));
 sid:=(claims->>'session_id')::uuid;
 if sid is null then return jsonb_build_object('claims',claims);end if;
 select * into g from sill_private.caller_grants where owner_id=uid and caller_id='oauth:'||cid::text and audience=c.policy->>'audience';
 if g.consent_version is null then return jsonb_build_object('claims',claims);end if;
 -- Immutable session binding: refresh never acquires today's grant version. An
 -- unknown pre-hook refresh session is denied even if its JWT is otherwise valid.
 if event->>'authentication_method'='oauth_provider/authorization_code' then
  insert into sill_private.oauth_token_sessions(owner_id,client_id,session_id,consent_version)
   values(uid,cid,sid,g.consent_version) on conflict do nothing;
 end if;
 select consent_version into v from sill_private.oauth_token_sessions where owner_id=uid and client_id=cid and session_id=sid;
 if v=g.consent_version then claims:=jsonb_set(claims,'{sill_consent_version}',to_jsonb(v));end if;
 return jsonb_build_object('claims',claims);
end $$;
revoke all on sill_private.oauth_token_sessions from public,anon,authenticated;
revoke all on function sill_private.oauth_access_token_hook(jsonb) from public,anon,authenticated;
grant usage on schema sill_private to sill_oauth_issuer,supabase_auth_admin;
grant select,update on sill_private.oauth_clients to sill_oauth_issuer;
grant select on sill_private.caller_grants to sill_oauth_issuer;
grant select,insert on sill_private.oauth_token_sessions to sill_oauth_issuer;
grant create on schema sill_private to sill_oauth_issuer;
alter function sill_private.oauth_access_token_hook(jsonb) owner to sill_oauth_issuer;
revoke create on schema sill_private from sill_oauth_issuer;
set local role sill_oauth_issuer;
grant execute on function sill_private.oauth_access_token_hook(jsonb) to supabase_auth_admin;
reset role;
revoke set option for sill_oauth_issuer from current_user;
commit;

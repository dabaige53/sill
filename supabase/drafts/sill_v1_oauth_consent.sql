-- REVIEW ONLY: fifth draft, after sessions_snapshots. Never applied to production here.
begin;
alter table sill_private.caller_grants add column consent_version bigint;
-- Existing grants remain unchanged. New consent-managed grants require an issuer-stamped version.
create or replace function sill_private.authorize(required_scope text, resource text default '*') returns void
language plpgsql stable security invoker set search_path='' as $$
declare claims jsonb:=sill_private.request_claims();
begin
 if sill_private.request_uid() is null or claims->>'role' is distinct from 'authenticated'
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
   where g.owner_id=sill_private.request_uid() and g.caller_id=sill_private.caller()
   and required_scope=any(g.scopes) and (resource=any(g.resources) or '*'=any(g.resources))
   and g.audience is not null
   and (g.consent_version is null or (claims->'sill_consent_version'=to_jsonb(g.consent_version)))
   and (claims->>'aud'=g.audience or claims->'aud' @> jsonb_build_array(g.audience))
   and ((not (claims ? 'client_id') and g.audience='authenticated')
        or (claims ? 'client_id' and g.audience<>'authenticated'))) then
  raise exception 'forbidden';
 end if;
end $$;

create role sill_consent_executor nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant sill_consent_executor to current_user with inherit false, set true;
create table sill_private.oauth_clients(
 owner_id uuid not null references sill_private.workspaces(owner_id), client_id uuid not null,
 policy jsonb not null check(jsonb_typeof(policy)='object'), enabled boolean not null default false,
 generation bigint not null default 0, primary key(owner_id,client_id)
);
create table sill_private.oauth_flows(
 owner_id uuid not null, id uuid not null, client_id uuid not null, authorization_id text,
 kind text not null check(kind in ('consent','revoke')), browser_hash text not null, csrf_hash text not null,
 review jsonb, policy_snapshot jsonb not null, prior_grant jsonb, generation bigint not null,
 state text not null default 'ready' check(state in ('ready','processing','done','denied','failed')),
 expires_at timestamptz not null default statement_timestamp()+interval '10 minutes',
 primary key(owner_id,id), foreign key(owner_id,client_id) references sill_private.oauth_clients(owner_id,client_id)
);
create index oauth_flow_expiry on sill_private.oauth_flows(owner_id,expires_at);
create table sill_private.oauth_audit(
 owner_id uuid not null, flow_id uuid not null, client_id uuid not null, action text not null,
 recorded_at timestamptz not null default statement_timestamp(), primary key(owner_id,flow_id,action)
);
alter table sill_private.oauth_clients enable row level security;
alter table sill_private.oauth_flows enable row level security;
alter table sill_private.oauth_audit enable row level security;
create policy consent_clients on sill_private.oauth_clients to sill_consent_executor using(owner_id=(select sill_private.request_uid())) with check(owner_id=(select sill_private.request_uid()));
create policy consent_flows on sill_private.oauth_flows to sill_consent_executor using(owner_id=(select sill_private.request_uid())) with check(owner_id=(select sill_private.request_uid()));
create policy consent_audit on sill_private.oauth_audit to sill_consent_executor using(owner_id=(select sill_private.request_uid())) with check(owner_id=(select sill_private.request_uid()));
-- No broad grants to the content executor or authenticated. Only this checked gateway can mutate OAuth rows.
create policy consent_grants_select on sill_private.caller_grants for select to sill_consent_executor using(owner_id=(select sill_private.request_uid()));
create policy consent_grants_insert on sill_private.caller_grants for insert to sill_consent_executor with check(owner_id=(select sill_private.request_uid()) and caller_id like 'oauth:%');
create policy consent_grants_update on sill_private.caller_grants for update to sill_consent_executor using(owner_id=(select sill_private.request_uid()) and caller_id like 'oauth:%') with check(owner_id=(select sill_private.request_uid()) and caller_id like 'oauth:%');
create policy consent_grants_delete on sill_private.caller_grants for delete to sill_consent_executor using(owner_id=(select sill_private.request_uid()) and caller_id like 'oauth:%');
create function sill_private.oauth_gateway(op text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' set row_security=on as $$
declare uid uuid:=sill_private.request_uid(); c sill_private.oauth_clients; f sill_private.oauth_flows;
 current_grant jsonb; scopes text[]; resources text[]; choice text; claims jsonb:=sill_private.request_claims();
begin
 if claims ? 'client_id' or claims->>'aud' is distinct from 'authenticated' then raise exception 'forbidden';end if;
 perform sill_private.authorize('content:read','*');
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>16384 then raise exception 'invalid_request';end if;
 if op='list' then
  return coalesce((select jsonb_agg(jsonb_build_object('clientId',x.client_id,'policy',x.policy,'enabled',x.enabled,'grant',to_jsonb(g)))
   from sill_private.oauth_clients x left join sill_private.caller_grants g on g.owner_id=x.owner_id and g.caller_id='oauth:'||x.client_id::text and g.audience=x.policy->>'audience' where x.owner_id=uid),'[]'::jsonb);
 end if;
 if op in ('policy','begin') then
  select * into c from sill_private.oauth_clients where owner_id=uid and client_id=(p->>'clientId')::uuid for update;
 else
  -- Read the flow key first, then lock client before flow consistently across instances.
  select * into f from sill_private.oauth_flows where owner_id=uid and id=(p->>'flowId')::uuid;
  if not found then raise exception 'not_found';end if;
  select * into c from sill_private.oauth_clients where owner_id=uid and client_id=f.client_id for update;
 end if;
 if c.client_id is null then raise exception 'forbidden';end if;
 if op='policy' then
  if not c.enabled then raise exception 'forbidden';end if;
  return c.policy;
 end if;
 select to_jsonb(g) into current_grant from sill_private.caller_grants g where owner_id=uid and caller_id='oauth:'||c.client_id::text for update;
 if current_grant is not null and current_grant->>'audience' is distinct from c.policy->>'audience' then raise exception 'forbidden';end if;
 if op='begin' then
  if coalesce(p->>'kind','') not in ('consent','revoke') or coalesce(p->>'browserHash','')!~'^[0-9a-f]{64}$' or coalesce(p->>'csrfHash','')!~'^[0-9a-f]{64}$' then raise exception 'invalid_request';end if;
  if p->>'kind'='consent' then
   if coalesce(p->'review'->>'authorizationId','')!~'^[A-Za-z0-9_-]{16,128}$' or not c.enabled or (p->'review'->>'userId') is distinct from uid::text or (p->'review'->>'clientId') is distinct from c.client_id::text
    or (p->'review'->>'audience') is distinct from c.policy->>'audience'
    or not coalesce(c.policy->'redirectUris' ? (p->'review'->>'redirectUri'),false)
    or not coalesce(c.policy->'identityScopes' @> (p->'review'->'identityScopes'),false) then raise exception 'forbidden';end if;
   scopes:=array(select jsonb_array_elements_text(p->'review'->'contentScopes'));
   resources:=array(select jsonb_array_elements_text(p->'review'->'resources'));
   if cardinality(scopes)=0 or not ('content:read'=any(scopes)) or not scopes<@array['content:read','content:write','content:delete','event:submit','event:read']
    or not coalesce(c.policy->'contentScopes' @> to_jsonb(scopes),false) or cardinality(resources)=0 or cardinality(resources)>100
    or not coalesce(c.policy->'resources' @> to_jsonb(resources),false) or ('*'=any(resources) and cardinality(resources)<>1)
    or c.policy->>'audience' is distinct from (c.policy->>'appOrigin')||'/mcp'
    or c.policy->>'appOrigin' not like 'https://%' then raise exception 'forbidden';end if;
  end if;
  delete from sill_private.oauth_flows where owner_id=uid and expires_at<statement_timestamp();
  if (select count(*) from sill_private.oauth_flows where owner_id=uid)>=32 then raise exception 'rate_limited';end if;
  insert into sill_private.oauth_flows(owner_id,id,client_id,authorization_id,kind,browser_hash,csrf_hash,review,policy_snapshot,prior_grant,generation)
   values(uid,(p->>'flowId')::uuid,c.client_id,p->'review'->>'authorizationId',p->>'kind',p->>'browserHash',p->>'csrfHash',p->'review',c.policy,current_grant,c.generation);
  return jsonb_build_object('ok',true);
 end if;
 select * into f from sill_private.oauth_flows where owner_id=uid and id=(p->>'flowId')::uuid for update;
 if f.browser_hash is distinct from p->>'browserHash' or f.csrf_hash is distinct from p->>'csrfHash' then raise exception 'forbidden';end if;
 if f.expires_at<=statement_timestamp() or f.generation<>c.generation or f.policy_snapshot<>c.policy then raise exception 'revision_conflict';end if;
 if op='inspect' then
  if f.state<>'ready' then raise exception 'revision_conflict';end if;
  return jsonb_build_object('kind',f.kind,'review',f.review,'policy',c.policy,'clientId',c.client_id);
 end if;
 if op='claim' then
  choice:=p->>'decision';
  if f.state<>'ready' or (f.kind='consent' and choice not in ('approve','deny')) or (f.kind='revoke' and choice<>'revoke') or choice is null then raise exception 'revision_conflict';end if;
  if f.prior_grant is distinct from current_grant then raise exception 'revision_conflict';end if;
  if choice='approve' and (not c.enabled or exists(select 1 from sill_private.oauth_flows where owner_id=uid and client_id=c.client_id and state='processing' and expires_at>statement_timestamp())) then raise exception 'revision_conflict';end if;
  update sill_private.oauth_flows set state=case when choice='revoke' then 'done' else 'processing' end where owner_id=uid and id=f.id;
  if choice='revoke' then
   delete from sill_private.caller_grants where owner_id=uid and caller_id='oauth:'||c.client_id::text and audience=c.policy->>'audience';
   update sill_private.oauth_clients set generation=generation+1 where owner_id=uid and client_id=c.client_id;
  end if;
  insert into sill_private.oauth_audit(owner_id,flow_id,client_id,action) values(uid,f.id,c.client_id,choice||'_claimed');
  return jsonb_build_object('kind',f.kind,'review',f.review,'clientId',c.client_id);
 end if;
 if op='finish' then
  if f.state<>'processing' or f.prior_grant is distinct from current_grant then raise exception 'revision_conflict';end if;
  choice:=p->>'result';
  if choice not in ('approved','denied','failed') or choice is null then raise exception 'invalid_request';end if;
  if choice='approved' then
   if not c.enabled or not exists(select 1 from sill_private.oauth_audit where owner_id=uid and flow_id=f.id and action='approve_claimed') then raise exception 'forbidden';end if;
   insert into sill_private.caller_grants(owner_id,caller_id,scopes,resources,audience,consent_version)
    values(uid,'oauth:'||c.client_id::text,array(select jsonb_array_elements_text(f.review->'contentScopes')),array(select jsonb_array_elements_text(f.review->'resources')),c.policy->>'audience',c.generation+1)
    on conflict(owner_id,caller_id) do update set scopes=excluded.scopes,resources=excluded.resources,audience=excluded.audience,consent_version=excluded.consent_version;
   update sill_private.oauth_clients set generation=generation+1 where owner_id=uid and client_id=c.client_id;
  end if;
  update sill_private.oauth_flows set state=case choice when 'approved' then 'done' when 'denied' then 'denied' else 'failed' end where owner_id=uid and id=f.id;
  insert into sill_private.oauth_audit(owner_id,flow_id,client_id,action) values(uid,f.id,c.client_id,choice);
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'invalid_request';
end $$;
create function public.sill_oauth_flow(op text,p jsonb) returns jsonb language sql security invoker set search_path='' as $$select sill_private.oauth_gateway(op,p)$$;
revoke all on sill_private.oauth_clients,sill_private.oauth_flows,sill_private.oauth_audit from public,anon,authenticated;
revoke all on function sill_private.oauth_gateway(text,jsonb),public.sill_oauth_flow(text,jsonb) from public,anon,authenticated;
grant usage on schema sill_private to sill_consent_executor;
grant execute on function sill_private.request_uid(),sill_private.request_claims(),sill_private.caller(),sill_private.authorize(text,text) to sill_consent_executor;
grant select,update on sill_private.oauth_clients to sill_consent_executor;
grant select,insert,update,delete on sill_private.oauth_flows to sill_consent_executor;
grant select,insert on sill_private.oauth_audit to sill_consent_executor;
grant select,insert,update,delete on sill_private.caller_grants to sill_consent_executor;
grant create on schema sill_private to sill_consent_executor;
alter function sill_private.oauth_gateway(text,jsonb) owner to sill_consent_executor;
revoke create on schema sill_private from sill_consent_executor;
set local role sill_consent_executor;
grant execute on function sill_private.oauth_gateway(text,jsonb) to authenticated;
reset role;
revoke set option for sill_consent_executor from current_user;
grant execute on function public.sill_oauth_flow(text,jsonb) to authenticated;
commit;

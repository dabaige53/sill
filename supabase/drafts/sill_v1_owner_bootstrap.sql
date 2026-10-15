-- REVIEW ONLY, after storage/rpc/boundary; never run without a verified existing owner.
-- Operator sets sill.bootstrap_owner in the same dedicated session (then RESETs it); no email/token is embedded.
begin;
do $$
declare owner uuid := nullif(current_setting('sill.bootstrap_owner',true),'')::uuid;
begin
 if owner is null or not exists(select 1 from auth.users where id=owner) then
  raise exception 'verified_existing_owner_required';
 end if;
 if exists(select 1 from sill_private.caller_grants where owner_id=owner and caller_id='user:'||owner::text
   and (scopes is distinct from array['content:read','content:write','content:delete']::text[]
     or resources is distinct from array['*']::text[] or audience is distinct from 'authenticated')) then
  raise exception 'existing_grant_requires_review';
 end if;
 insert into sill_private.workspaces(owner_id) values(owner) on conflict(owner_id) do nothing;
 insert into sill_private.caller_grants(owner_id,caller_id,scopes,resources,audience)
 values(owner,'user:'||owner::text,array['content:read','content:write','content:delete'],array['*'],'authenticated')
 on conflict(owner_id,caller_id) do nothing;
end $$;
commit;

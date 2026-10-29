begin;
-- Keep the existing full snapshot API; polling can skip card aggregation when unchanged.
create function sill_private.api_get_workspace_since(known_revision bigint) returns jsonb
language plpgsql security definer set search_path='' set row_security=on as $$
declare current_revision bigint;
begin
 perform sill_private.authorize('content:read','*');
 select change_version into current_revision from sill_private.workspaces
 where owner_id=sill_private.request_uid();
 if current_revision is null then raise exception 'not_found'; end if;
 if current_revision=known_revision then
  return jsonb_build_object('revision',current_revision,'unchanged',true);
 end if;
 return sill_private.get_workspace();
end $$;
create function public.sill_get_workspace_since(known_revision bigint) returns jsonb
language sql security invoker set search_path='' as $$
 select sill_private.api_get_workspace_since(known_revision)
$$;
revoke all on function sill_private.api_get_workspace_since(bigint),public.sill_get_workspace_since(bigint) from public,anon,authenticated;
grant sill_rpc_executor to current_user with inherit false,set true;
grant create on schema sill_private to sill_rpc_executor;
alter function sill_private.api_get_workspace_since(bigint) owner to sill_rpc_executor;
revoke create on schema sill_private from sill_rpc_executor;
set local role sill_rpc_executor;
grant execute on function sill_private.api_get_workspace_since(bigint) to authenticated;
reset role;
revoke set option for sill_rpc_executor from current_user;
grant execute on function public.sill_get_workspace_since(bigint) to authenticated;
commit;

begin;
-- Keyword search runs inside the database: only matching cards leave it, without bodies.
-- Every keyword must appear; title, summary and tag hits rank first, then the newest card.
create function sill_private.api_search_contents(search_query text, requested_limit integer default null) returns jsonb
language plpgsql security definer set search_path='' set row_security=on as $$
declare terms text[]; page integer:=coalesce(requested_limit,20); result jsonb;
begin
 perform sill_private.authorize('content:read','*');
 if search_query is null or length(btrim(search_query)) not between 1 and 200 or page not between 1 and 50 then
  raise exception 'invalid_request';
 end if;
 select array_agg(distinct term) into terms
 from regexp_split_to_table(lower(btrim(search_query)),'\s+') term where term<>'';
 with docs as (
  select c.id,c.content_type,c.card,c.state,c.revision,c.created_at,c.updated_at,
   lower(concat_ws(' ',c.card->>'title',c.card->>'summary',
    (select string_agg(tag,' ') from jsonb_array_elements_text(coalesce(c.card->'tags','[]')) tag))) head,
   lower(concat_ws(' ',c.card->>'body',c.card->>'url',c.state->>'note',
    (select string_agg(s->>'name',' ') from jsonb_array_elements(coalesce(c.card->'sources','[]')) s),
    (select string_agg(a->>'name',' ') from jsonb_array_elements(coalesce(c.card->'authors','[]')) a))) rest
  from sill_private.contents c
  where c.owner_id=sill_private.request_uid() and not c.deleted
 ), hits as (
  select d.*,(select count(*) from unnest(terms) term where strpos(d.head,term)>0) head_hits,
   (select min(nullif(strpos(lower(coalesce(d.card->>'body','')),term),0)) from unnest(terms) term) body_at
  from docs d
  where (select bool_and(strpos(d.head,term)>0 or strpos(d.rest,term)>0) from unnest(terms) term)
 )
 select jsonb_build_object('total',(select count(*) from hits),'items',coalesce((
  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',h.id,'type',h.content_type,'title',h.card->>'title','summary',h.card->>'summary',
    'lead',left(coalesce(h.card->>'body',''),600),
    'excerpt',case when h.body_at is not null then substr(h.card->>'body',greatest(1,h.body_at-80),320) end,
    'url',h.card->'url','sources',h.card->'sources','tags',h.card->'tags','publishedAt',h.card->'publishedAt',
    'start',h.card->'start','end',h.card->'end','due',h.card->'due',
    'archived',coalesce((h.state->>'archived')::boolean,false),'revision',h.revision,
    'created_at',to_char(h.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'updated_at',to_char(h.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
   )) order by h.head_hits desc,h.created_at desc,h.id)
  from (select * from hits order by head_hits desc,created_at desc,id limit page) h),'[]'::jsonb))
 into result;
 return result;
end $$;
create function public.sill_search_contents(search_query text, requested_limit integer default null) returns jsonb
language sql security invoker set search_path='' as $$
 select sill_private.api_search_contents(search_query,requested_limit)
$$;
revoke all on function sill_private.api_search_contents(text,integer),public.sill_search_contents(text,integer) from public,anon,authenticated;
grant sill_rpc_executor to current_user with inherit false,set true;
grant create on schema sill_private to sill_rpc_executor;
alter function sill_private.api_search_contents(text,integer) owner to sill_rpc_executor;
revoke create on schema sill_private from sill_rpc_executor;
set local role sill_rpc_executor;
grant execute on function sill_private.api_search_contents(text,integer) to authenticated;
reset role;
revoke set option for sill_rpc_executor from current_user;
grant execute on function public.sill_search_contents(text,integer) to authenticated;
commit;

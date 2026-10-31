-- Normalize writes at the shared database boundary. Existing rows are not rewritten.
begin;
create or replace function sill_private.check_card() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if not new.deleted then
  if not new.card?'time' then
   new.card:=new.card||jsonb_build_object('time',
    case when tg_op='UPDATE' and old.card?'time' then (old.card->>'time')::numeric
    else floor(extract(epoch from new.created_at)*1000) end);
  end if;
  perform sill_private.validate_card(new.card,new.content_type);
  if new.content_type='task' and jsonb_array_length(new.card->'tasks')>6
   and (tg_op='INSERT' or new.card->'tasks' is distinct from old.card->'tasks') then
   raise exception 'invalid_request';
  end if;
 end if;
 return new;
end $$;
-- Old cards expose their real insertion time without a bulk data rewrite.
create or replace function sill_private.content_json(c sill_private.contents) returns jsonb
language sql stable security invoker set search_path='' as $$
 select (case when c.deleted then '{}'::jsonb else
  jsonb_build_object('time',floor(extract(epoch from c.created_at)*1000))||c.card end)
 ||jsonb_build_object('id',c.id,'type',c.content_type,'title',case when c.deleted then '已删除' else c.card->>'title' end,
 'body',case when c.deleted then '' else coalesce(c.card->>'body','') end,
 'state',c.state,'revision',c.revision,'created_at',to_char(c.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'updated_at',to_char(c.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'deleted',c.deleted)
$$;
commit;

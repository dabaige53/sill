-- Card body is one Markdown string and points move into it (ADR 0063).
-- Stored legacy rows keep their arrays and points; every read returns the converted body.
begin;
create function sill_private.card_body_markdown(card jsonb) returns text
language sql immutable security invoker set search_path='' as $$
 select concat_ws(E'\n\n',
  (select string_agg(n::text||'. '||p,E'\n' order by n) from jsonb_array_elements_text(case when jsonb_typeof(card->'points')='array' then card->'points' else '[]'::jsonb end) with ordinality as x(p,n)),
  case jsonb_typeof(card->'body') when 'string' then nullif(card->>'body','') when 'array' then (select string_agg(b,E'\n\n' order by n) from jsonb_array_elements_text(card->'body') with ordinality as y(b,n) where b ~ '[^[:space:]]') end)
$$;
create or replace function sill_private.content_json(c sill_private.contents) returns jsonb
language sql stable security invoker set search_path='' as $$
 select (case when c.deleted then '{}'::jsonb else c.card-'points' end) || jsonb_build_object('id',c.id,'type',c.content_type,'title',case when c.deleted then '已删除' else c.card->>'title' end,
 'body',case when c.deleted then '""'::jsonb else to_jsonb(sill_private.card_body_markdown(c.card)) end,
 'state',c.state,'revision',c.revision,'created_at',to_char(c.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'updated_at',to_char(c.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'deleted',c.deleted)
 ||case when not c.deleted and c.card ? 'url' then jsonb_build_object('url',c.card->'url') else '{}'::jsonb end
$$;
-- Keep ownership, permissions, revision and idempotency implementation unchanged.
do $migration$
declare source text;
begin
 source:=pg_get_functiondef('sill_private.validate_classic_card_changes(jsonb,boolean)'::regprocedure);
 if strpos(source,$expected$'sources','points','why'$expected$)=0 then raise exception 'migration_source_mismatch: classic field allow-list';end if;
 source:=replace(source,$old$'sources','points','why'$old$,$new$'sources','why'$new$);
 if source !~ $re$if k='body' then\s+if jsonb_typeof\(v\)<>'array' then raise exception 'invalid_request'; end if;$re$ then raise exception 'migration_source_mismatch: classic body type';end if;
 source:=regexp_replace(source,$re$if k='body' then\s+if jsonb_typeof\(v\)<>'array' then raise exception 'invalid_request'; end if;$re$,$new$if k='body' then$new$);
 if strpos(source,$expected$if jsonb_array_length(v)>100 or exists(select 1 from jsonb_array_elements(v) b where jsonb_typeof(b)<>'string' or length(b#>>'{}')>50000) then raise exception 'invalid_request'; end if;$expected$)=0 then raise exception 'migration_source_mismatch: classic body size';end if;
 source:=replace(source,$old$if jsonb_array_length(v)>100 or exists(select 1 from jsonb_array_elements(v) b where jsonb_typeof(b)<>'string' or length(b#>>'{}')>50000) then raise exception 'invalid_request'; end if;$old$,$new$if jsonb_typeof(v)<>'string' or length(v#>>'{}')>500000 then raise exception 'invalid_request'; end if;$new$);
 execute source;
 source:=pg_get_functiondef('sill_private.validate_card_metadata(jsonb,text)'::regprocedure);
 if strpos(source,$expected$exists(select 1 from jsonb_array_elements_text(coalesce(c->'body','[]')) b where b ~ '[^[:space:]]')$expected$)=0 then raise exception 'migration_source_mismatch: metadata body';end if;
 source:=replace(source,$old$exists(select 1 from jsonb_array_elements_text(coalesce(c->'body','[]')) b where b ~ '[^[:space:]]')$old$,$new$sill_private.card_body_markdown(c) ~ '[^[:space:]]'$new$);
 execute source;
 source:=pg_get_functiondef('sill_private.write_v1(text,text,jsonb,text)'::regprocedure);
 if strpos(source,$expected$jsonb_build_object('body','[]'::jsonb)||(payload-'state')$expected$)=0 then raise exception 'migration_source_mismatch: write_v1 create body';end if;
 source:=replace(source,$old$jsonb_build_object('body','[]'::jsonb)||(payload-'state')$old$,$new$jsonb_build_object('body',''::text)||(payload-'state')$new$);
 if strpos(source,$expected$next_card:=c.card||(ch-'state');$expected$)=0 then raise exception 'migration_source_mismatch: write_v1 card merge';end if;
 source:=replace(source,$old$next_card:=c.card||(ch-'state');$old$,$new$next_card:=(case when ch?'body' then c.card-'points' else c.card end)||(ch-'state');$new$);
 execute source;
 source:=pg_get_functiondef('sill_private.apply_operations(jsonb,text)'::regprocedure);
 if strpos(source,$expected$'sources','points','why'$expected$)=0 then raise exception 'migration_source_mismatch: apply_operations field allow-list';end if;
 source:=replace(source,$old$'sources','points','why'$old$,$new$'sources','why'$new$);
 if strpos(source,$expected$jsonb_build_object('body','[]'::jsonb)||ch$expected$)=0 then raise exception 'migration_source_mismatch: apply_operations create body';end if;
 source:=replace(source,$old$jsonb_build_object('body','[]'::jsonb)||ch$old$,$new$jsonb_build_object('body',''::text)||ch$new$);
 if strpos(source,$expected$ch:=(coalesce(c.card,'{}')-array['authors',$expected$)=0 then raise exception 'migration_source_mismatch: apply_operations card merge';end if;
 source:=replace(source,$old$ch:=(coalesce(c.card,'{}')-array['authors',$old$,$new$ch:=(coalesce(c.card,'{}')-array['points','authors',$new$);
 execute source;
end $migration$;
revoke all on function sill_private.card_body_markdown(jsonb) from public;
grant execute on function sill_private.card_body_markdown(jsonb) to sill_rpc_executor;
commit;

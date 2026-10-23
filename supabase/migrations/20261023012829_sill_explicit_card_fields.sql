-- Explicit card facts. No existing row is read, rewritten or removed by this migration.
begin;
create function sill_private.validate_card_date(v jsonb, instant boolean default false) returns void
language plpgsql immutable security invoker set search_path='' as $$
declare s text:=v#>>'{}'; y integer; m integer; d integer; max_day integer;
begin
 if jsonb_typeof(v) is distinct from 'string' or length(s) not between 10 and 40 then raise exception 'invalid_request';end if;
 if s !~ '^\d{4}-\d{2}-\d{2}(T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$' or (instant and length(s)=10) then raise exception 'invalid_request';end if;
 y:=substring(s,1,4)::int;m:=substring(s,6,2)::int;d:=substring(s,9,2)::int;
 if m not between 1 and 12 then raise exception 'invalid_request';end if;
 max_day:=case when m=2 then case when y%400=0 or (y%4=0 and y%100<>0) then 29 else 28 end when m in (4,6,9,11) then 30 else 31 end;
 if d not between 1 and max_day then raise exception 'invalid_request';end if;
end $$;
create function sill_private.validate_card_field(k text,v jsonb) returns void
language plpgsql stable security invoker set search_path='' as $$
declare e jsonb; n numeric;
begin
 if k='meta' then raise exception 'invalid_request';end if;
 if k='readingEstimate' and v='null' then return;end if;
 if v='null' then raise exception 'invalid_request';end if;
 if k in ('publishedAt','modifiedAt','savedAt','takenAt') then perform sill_private.validate_card_date(v);end if;
 if k='sentAt' then perform sill_private.validate_card_date(v,true);end if;
 if k='bodyCoverage' and (jsonb_typeof(v)<>'string' or v#>>'{}' not in ('full','excerpt','summary','none')) then raise exception 'invalid_request';end if;
 if k in ('section','caption') and (jsonb_typeof(v)<>'string' or (k='section' and length(regexp_replace(v#>>'{}','^\s+|\s+$','','g')) not between 1 and 100) or (k='caption' and length(v#>>'{}')>2000)) then raise exception 'invalid_request';end if;
 if k='timeZone' and (jsonb_typeof(v)<>'string' or not exists(select 1 from pg_catalog.pg_timezone_names where lower(name)=lower(v#>>'{}') and name not in ('Factory','localtime') and name!~'^(posix|right)/')) then raise exception 'invalid_request';end if;
 if k in ('chapterCount','coverageStart','coverageEnd') then
  if jsonb_typeof(v)<>'number' then raise exception 'invalid_request';end if;
  n:=(v#>>'{}')::numeric;
  if n<(case when k='chapterCount' then 1 else 0 end) or n>(case when k='chapterCount' then 10000 else 8640000000000000 end) or (k='chapterCount' and trunc(n)<>n) then raise exception 'invalid_request';end if;
 end if;
 if k in ('authors','recipients') then
  if jsonb_typeof(v)<>'array' then raise exception 'invalid_request';end if;
  if jsonb_array_length(v)>(case when k='authors' then 20 else 100 end) then raise exception 'invalid_request';end if;
  for e in select * from jsonb_array_elements(v) loop
   if k='authors' then perform sill_private.validate_card_field('publisher',e);
   elsif jsonb_typeof(e)<>'string' or length(regexp_replace(e#>>'{}','^\s+|\s+$','','g')) not between 1 and 300 then raise exception 'invalid_request';end if;
  end loop;
 end if;
 if k in ('publisher','project') then
  if jsonb_typeof(v)<>'object' or jsonb_typeof(v->'name') is distinct from 'string' or length(regexp_replace(v->>'name','^\s+|\s+$','','g')) not between 1 and 300 then raise exception 'invalid_request';end if;
  if v?'url' and (jsonb_typeof(v->'url')<>'string' or v->>'url'!~'^https?://[^[:space:]/?#]+([/?#][^[:space:]]*)?$') then raise exception 'invalid_request';end if;
 end if;
 if k='readingEstimate' then
  if jsonb_typeof(v)<>'object' or not v?&array['seconds','origin','scope'] or jsonb_typeof(v->'seconds') is distinct from 'number' or jsonb_typeof(v->'origin') is distinct from 'string' or jsonb_typeof(v->'scope') is distinct from 'string' then raise exception 'invalid_request';end if;
  n:=(v->>'seconds')::numeric;
  if n not between 1 and 31536000 or trunc(n)<>n or v->>'origin' not in ('provided','calculated') or v->>'scope' not in ('full','available') then raise exception 'invalid_request';end if;
  if (v?'method' and (jsonb_typeof(v->'method')<>'string' or length(regexp_replace(v->>'method','^\s+|\s+$','','g')) not between 1 and 100)) or (v->>'origin'='calculated' and not v?'method') then raise exception 'invalid_request';end if;
 end if;
 if k='files' then
  if jsonb_typeof(v)<>'array' then raise exception 'invalid_request';end if;
  for e in select * from jsonb_array_elements(v) loop
   if e ?| array['meta','time'] then raise exception 'invalid_request';end if;
   if e?'mimeType' and (jsonb_typeof(e->'mimeType')<>'string' or e->>'mimeType'!~'^[A-Za-z0-9!#$&^_.+-]+/[A-Za-z0-9!#$&^_.+-]+$' or length(e->>'mimeType')>200) then raise exception 'invalid_request';end if;
   if e?'sizeBytes' then
    if jsonb_typeof(e->'sizeBytes')<>'number' then raise exception 'invalid_request';end if;
    n:=(e->>'sizeBytes')::numeric;
    if n not between 0 and 9007199254740991 or trunc(n)<>n then raise exception 'invalid_request';end if;
   end if;
   if e?'modifiedAt' then perform sill_private.validate_card_date(e->'modifiedAt');end if;
   if e?'url' and (jsonb_typeof(e->'url')<>'string' or e->>'url'!~'^https?://[^[:space:]/?#]+([/?#][^[:space:]]*)?$') then raise exception 'invalid_request';end if;
  end loop;
 end if;
end $$;
alter function sill_private.validate_card_changes(jsonb,boolean) rename to validate_classic_card_changes;
create function sill_private.validate_card_changes(ch jsonb,creating boolean default false) returns void
language plpgsql stable security invoker set search_path='' as $$
declare k text;v jsonb;classic jsonb;
begin
 if jsonb_typeof(ch) is distinct from 'object' or ch='{}' then raise exception 'invalid_request';end if;
 for k,v in select * from jsonb_each(ch) loop perform sill_private.validate_card_field(k,v);end loop;
 classic:=ch-array['authors','publisher','publishedAt','modifiedAt','savedAt','bodyCoverage','readingEstimate','section','sentAt','recipients','project','timeZone','chapterCount','takenAt','caption','coverageStart','coverageEnd'];
 if classic='{}' then classic:='{"state":{}}';end if;
 perform sill_private.validate_classic_card_changes(classic,creating);
end $$;
-- Rebind the existing entry validator to the new field validator for active sessions.
create or replace function sill_private.validate_changes(ch jsonb,creating boolean default false) returns void
language plpgsql stable security invoker set search_path='' as $$
begin
 if ch?'state' then perform sill_private.validate_workspace_state(ch->'state');end if;
 perform sill_private.validate_card_changes(case when ch-'state'='{}' then jsonb_build_object('state','{}'::jsonb) else ch-'state' end,creating);
end $$;
create function sill_private.validate_card_metadata(c jsonb,t text) returns void
language plpgsql stable security invoker set search_path='' as $$
declare k text;v jsonb;
begin
 if c?'meta' then raise exception 'invalid_request';end if;
 for k,v in select * from jsonb_each(c) loop
  if k=any(array['authors','publisher','publishedAt','modifiedAt','savedAt','bodyCoverage','readingEstimate','section','sentAt','recipients','project','timeZone','chapterCount','takenAt','caption','coverageStart','coverageEnd','files']) then perform sill_private.validate_card_field(k,v);end if;
  if k in ('authors','publisher') and t not in ('article','note','mail','media','digest','suggestion','file') then raise exception 'invalid_request';end if;
  if k in ('bodyCoverage','readingEstimate') and t not in ('article','note','mail','digest','suggestion','file') then raise exception 'invalid_request';end if;
  if (k='section' and t<>'article') or (k in ('sentAt','recipients') and t<>'mail') or (k='project' and t not in ('task','reminder')) or (k='timeZone' and t<>'event') or (k='chapterCount' and t<>'media') or (k in ('takenAt','caption') and t<>'photo') or (k in ('coverageStart','coverageEnd') and t<>'digest') then raise exception 'invalid_request';end if;
 end loop;
 if c?'coverageStart' or c?'coverageEnd' then
  if not c?&array['coverageStart','coverageEnd'] or (c->>'coverageEnd')::numeric<=(c->>'coverageStart')::numeric then raise exception 'invalid_request';end if;
 end if;
 if c->>'bodyCoverage'='none' and exists(select 1 from jsonb_array_elements_text(coalesce(c->'body','[]')) b where b ~ '[^[:space:]]') then raise exception 'invalid_request';end if;
 if c->'readingEstimate'->>'origin'='calculated' and (not c?'bodyCoverage' or not exists(select 1 from jsonb_array_elements_text(coalesce(c->'body','[]')) b where b ~ '[^[:space:]]') or c->>'bodyCoverage'='none' or (c->'readingEstimate'->>'scope'='full' and c->>'bodyCoverage' is distinct from 'full')) then raise exception 'invalid_request';end if;
end $$;
-- All write paths validate merged facts, including changes of card type.
create function sill_private.check_explicit_card_metadata() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if not new.deleted then perform sill_private.validate_card_metadata(new.card,new.content_type);end if;
 return new;
end $$;
create trigger sill_explicit_card_metadata_check before insert or update on sill_private.contents for each row execute function sill_private.check_explicit_card_metadata();
-- Keep ownership, permissions, revision and idempotency implementation unchanged.
do $migration$
declare source text;
begin
 source:=pg_get_functiondef('sill_private.write_v1(text,text,jsonb,text)'::regprocedure);
 if strpos(source,$expected$next_card:=c.card||(ch-'state');$expected$)=0 then raise exception 'migration_source_mismatch: write_v1 card merge';end if;
 source:=replace(source,'next_card:=c.card||(ch-''state'');', $replacement$if c.card->'readingEstimate'->>'origin'='calculated' and ((ch?'body' and ch->'body' is distinct from c.card->'body') or (ch?'bodyCoverage' and ch->'bodyCoverage' is distinct from c.card->'bodyCoverage')) and not ch?'readingEstimate' then raise exception 'invalid_request';end if;
   next_card:=c.card||(ch-'state');$replacement$);
 execute source;
 source:=pg_get_functiondef('sill_private.apply_operations(jsonb,text)'::regprocedure);
 if strpos(source,$expected$'meta','form'$expected$)=0 then raise exception 'migration_source_mismatch: apply_operations deprecated field';end if;
 source:=replace(source,'''meta'',''form''','''form''');
 if strpos(source,$expected$'priority'];$expected$)=0 then raise exception 'migration_source_mismatch: apply_operations field allow-list';end if;
 source:=replace(source,$old$'priority'];$old$,$new$'priority','authors','publisher','publishedAt','modifiedAt','savedAt','bodyCoverage','readingEstimate','section','sentAt','recipients','project','timeZone','chapterCount','takenAt','caption','coverageStart','coverageEnd'];$new$);
 if strpos(source,$expected$ch:=coalesce(c.card,'{}')||ch-'id';$expected$)=0 then raise exception 'migration_source_mismatch: apply_operations card merge';end if;
 source:=replace(source,$old$ch:=coalesce(c.card,'{}')||ch-'id';$old$,$new$ch:=(coalesce(c.card,'{}')-array['authors','publisher','publishedAt','modifiedAt','savedAt','bodyCoverage','readingEstimate','section','sentAt','recipients','project','timeZone','chapterCount','takenAt','caption','coverageStart','coverageEnd'])||ch-'id';$new$);
 execute source;
end $migration$;
revoke all on function sill_private.validate_card_date(jsonb,boolean), sill_private.validate_card_field(text,jsonb), sill_private.validate_card_changes(jsonb,boolean), sill_private.validate_card_metadata(jsonb,text), sill_private.check_explicit_card_metadata() from public;
grant execute on function sill_private.validate_card_date(jsonb,boolean), sill_private.validate_card_field(text,jsonb), sill_private.validate_card_changes(jsonb,boolean), sill_private.validate_card_metadata(jsonb,text), sill_private.check_explicit_card_metadata() to sill_rpc_executor;
commit;

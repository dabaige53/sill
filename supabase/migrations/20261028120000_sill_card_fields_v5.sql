-- Card fields 5.0.0 (ADR 0086): one strict card validator replaces the layered field validators.
-- The product is not in production. Stored cards are cleared at deployment, not converted here.
begin;
drop trigger rich_card_fields on sill_private.contents;
drop trigger sill_explicit_card_metadata_check on sill_private.contents;
drop trigger sill_rich_card_check on sill_private.contents;
drop function sill_private.check_rich_card();
drop function sill_private.check_explicit_card_metadata();
drop function sill_private.validate_rich_card();
drop function sill_private.validate_card_metadata(jsonb,text);
drop function sill_private.validate_card_field(text,jsonb);
drop function sill_private.validate_rich_fields(jsonb);
drop function sill_private.validate_pre_rich_card_changes(jsonb,boolean);
drop function sill_private.validate_classic_card_changes(jsonb,boolean);

-- A trimmed contract string must contain more than whitespace, including tabs and line breaks.
create or replace function sill_private.validate_rich_schema(v jsonb,s jsonb) returns void
language plpgsql immutable security invoker set search_path='' as $$
declare k text;e jsonb;
begin
 perform sill_private.validate_schema(v,s);
 if jsonb_typeof(v)='object' then
  for k in select jsonb_array_elements_text(coalesce(s->'required','[]')) loop
   if not v?k then raise exception 'invalid_request';end if;
  end loop;
  for k,e in select * from jsonb_each(v) loop
   if s->'properties'?k then perform sill_private.validate_rich_schema(e,s->'properties'->k);end if;
  end loop;
 elsif jsonb_typeof(v)='array' then
  for e in select * from jsonb_array_elements(v) loop perform sill_private.validate_rich_schema(e,s->'items');end loop;
 elsif jsonb_typeof(v)='string' then
  if s?'minLength' and length(regexp_replace(v#>>'{}','^[[:space:]]+|[[:space:]]+$','','g'))<(s->>'minLength')::int then raise exception 'invalid_request';end if;
  if s->>'format'='uri' and v#>>'{}' !~ '^https?://[^/[:space:]]+' then raise exception 'invalid_request';end if;
 end if;
end $$;

-- Card facts as written: the contract JSON Schema with no unknown fields.
create or replace function sill_private.validate_card_changes(ch jsonb,creating boolean default false) returns void
language plpgsql stable security invoker set search_path='' as $$
declare c jsonb:=ch-'state';e jsonb;
begin
 if jsonb_typeof(ch) is distinct from 'object' or ch='{}' then raise exception 'invalid_request';end if;
 if creating and not c?&array['title','type'] then raise exception 'invalid_request';end if;
 if c='{}' then return;end if;
 if exists(select 1 from jsonb_each(c) f where f.value='null') then raise exception 'invalid_request';end if;
 perform sill_private.validate_rich_schema(c,'{"type":"object","properties":{"audioUrl":{"type":"string","pattern":"^https?:\\/\\/"},"chapters":{"maxItems":10000,"type":"array","items":{"type":"object","properties":{"start":{"type":"number","minimum":0,"maximum":86400},"title":{"type":"string","minLength":1,"maxLength":500}},"required":["start","title"],"additionalProperties":false}},"transcript":{"maxItems":10000,"type":"array","items":{"type":"object","properties":{"start":{"type":"number","minimum":0,"maximum":86400},"text":{"type":"string","minLength":1,"maxLength":20000}},"required":["start","text"],"additionalProperties":false}},"pullRequest":{"type":"object","properties":{"repository":{"type":"string","maxLength":300,"pattern":"^[A-Za-z0-9_.-]+\\/[A-Za-z0-9_.-]+$"},"number":{"type":"integer","minimum":1,"maximum":9007199254740991},"state":{"type":"string","enum":["draft","open","merged","closed"]},"observedAt":{"type":"string","pattern":"(?:^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$)|(?:^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$)"},"headBranch":{"type":"string","minLength":1,"maxLength":300},"baseBranch":{"type":"string","minLength":1,"maxLength":300},"reviewers":{"maxItems":100,"type":"array","items":{"type":"object","properties":{"login":{"type":"string","minLength":1,"maxLength":300},"url":{"type":"string","pattern":"^https?:\\/\\/"},"decision":{"type":"string","enum":["pending","approved","changesRequested","commented","dismissed"]}},"required":["login","decision"],"additionalProperties":false}},"checks":{"maxItems":1000,"type":"array","items":{"type":"object","properties":{"name":{"type":"string","minLength":1,"maxLength":300},"status":{"type":"string","enum":["queued","inProgress","completed"]},"conclusion":{"type":"string","enum":["success","failure","neutral","cancelled","skipped","timedOut","actionRequired","stale"]},"url":{"type":"string","pattern":"^https?:\\/\\/"}},"required":["name","status"],"additionalProperties":false}},"additions":{"type":"integer","minimum":0,"maximum":9007199254740991},"deletions":{"type":"integer","minimum":0,"maximum":9007199254740991},"changedFiles":{"type":"integer","minimum":0,"maximum":9007199254740991},"reviewRequested":{"type":"boolean"}},"required":["repository","number","state","observedAt"],"additionalProperties":false},"type":{"type":"string","minLength":1,"maxLength":100},"title":{"type":"string","minLength":1,"maxLength":1000},"summary":{"type":"string","maxLength":10000},"authors":{"maxItems":20,"type":"array","items":{"type":"object","properties":{"name":{"type":"string","minLength":1,"maxLength":300},"url":{"type":"string","pattern":"^https?:\\/\\/"}},"required":["name"],"additionalProperties":false}},"publishedAt":{"type":"string","minLength":10,"maxLength":40,"pattern":"^\\d{4}-\\d{2}-\\d{2}(?:T(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d{1,9})?)?(?:Z|[+-](?:[01]\\d|2[0-3]):[0-5]\\d))?$"},"project":{"type":"object","properties":{"name":{"type":"string","minLength":1,"maxLength":300},"url":{"type":"string","pattern":"^https?:\\/\\/"}},"required":["name"],"additionalProperties":false},"form":{"type":"string","enum":["quote"]},"images":{"minItems":1,"maxItems":50,"type":"array","items":{"type":"string","maxLength":8192,"pattern":"^(?:(?:architecture|coast|mountain|botanical)$|https:\\/\\/[^\\s/@?#]+(?:[/?#][^\\s]*)?$)"}},"tags":{"maxItems":100,"type":"array","items":{"type":"string","maxLength":100}},"body":{"type":"string","maxLength":500000},"url":{"type":"string","pattern":"^https?:\\/\\/"},"sources":{"maxItems":11,"type":"array","items":{"type":"object","properties":{"name":{"type":"string","minLength":1,"maxLength":300},"kind":{"type":"string","minLength":1,"maxLength":100}},"required":["name","kind"],"additionalProperties":false}},"location":{"type":"string","maxLength":300},"meeting":{"type":"object","properties":{"name":{"type":"string","minLength":1,"maxLength":100},"url":{"type":"string","pattern":"^https?:\\/\\/"},"code":{"type":"string","maxLength":100}},"required":["name","url"],"additionalProperties":false},"media":{"type":"string","enum":["video","podcast"]},"duration":{"type":"integer","minimum":0,"maximum":86400},"files":{"maxItems":200,"type":"array","items":{"type":"object","properties":{"name":{"type":"string","minLength":1,"maxLength":300},"mimeType":{"type":"string","minLength":3,"maxLength":200,"pattern":"^[A-Za-z0-9!#$&^_.+-]+\\/[A-Za-z0-9!#$&^_.+-]+$"},"sizeBytes":{"type":"integer","minimum":0,"maximum":9007199254740991},"modifiedAt":{"type":"string","minLength":10,"maxLength":40,"pattern":"^\\d{4}-\\d{2}-\\d{2}(?:T(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d{1,9})?)?(?:Z|[+-](?:[01]\\d|2[0-3]):[0-5]\\d))?$"},"url":{"type":"string","pattern":"^https?:\\/\\/"}},"required":["name"],"additionalProperties":false}},"tasks":{"maxItems":100,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","pattern":"^[a-zA-Z0-9_-]{1,100}$"},"text":{"type":"string","minLength":1,"maxLength":2000}},"required":["id","text"],"additionalProperties":false}},"start":{"type":"number","minimum":0,"maximum":8640000000000000},"end":{"type":"number","minimum":0,"maximum":8640000000000000},"due":{"type":"number","minimum":0,"maximum":8640000000000000},"time":{"type":"number","minimum":0,"maximum":8640000000000000},"people":{"maxItems":100,"type":"array","items":{"type":"string","maxLength":100}},"related":{"maxItems":100,"type":"array","items":{"type":"string","pattern":"^[a-zA-Z0-9_-]{1,100}$"}},"priority":{"type":"number","minimum":0,"maximum":10}},"additionalProperties":false}'::jsonb);
 if c?'type' and c->>'type' not in ('article','pr','mail','note','task','event','reminder','media','digest','suggestion','photo','file') then raise exception 'invalid_request';end if;
 if c?'images' and jsonb_array_length(c->'images')=0 then raise exception 'invalid_request';end if;
 if c?'publishedAt' then perform sill_private.validate_card_date(c->'publishedAt');end if;
 for e in select * from jsonb_array_elements(coalesce(c->'files','[]')) loop
  if e?'modifiedAt' then perform sill_private.validate_card_date(e->'modifiedAt');end if;
 end loop;
 if c?'pullRequest' then perform sill_private.validate_card_date(c->'pullRequest'->'observedAt',true);end if;
 if exists(select 1 from jsonb_array_elements(coalesce(c->'tasks','[]')) t where t->>'id' in ('__proto__','constructor','prototype'))
  or exists(select 1 from jsonb_array_elements_text(coalesce(c->'related','[]')) r where r in ('__proto__','constructor','prototype'))
  or (select count(*)<>count(distinct t->>'id') from jsonb_array_elements(coalesce(c->'tasks','[]')) t) then raise exception 'invalid_request';end if;
end $$;

-- Rules across fields, checked on the merged card for every write path, including type changes.
create function sill_private.validate_card(c jsonb,t text) returns void
language plpgsql stable security invoker set search_path='' as $$
declare k text;e jsonb;last_time numeric;at_time numeric;
begin
 perform sill_private.validate_card_changes(c);
 if (c?'authors' and t not in ('article','note','mail','media','digest','suggestion','file'))
  or (c?'project' and t not in ('task','reminder')) or (c?'people' and t<>'event') or (c?'form' and t<>'note')
  or (c?'audioUrl' and (t<>'media' or c->>'media' is distinct from 'podcast')) or (c?'pullRequest' and t<>'pr') then raise exception 'invalid_request';end if;
 if (t='event' and (not c?&array['start','end'] or (c->>'start')::numeric<=0 or (c->>'end')::numeric<=(c->>'start')::numeric))
  or (t='task' and jsonb_array_length(coalesce(c->'tasks','[]'))=0)
  or (t='media' and c->>'media' is distinct from 'podcast' and not c?'images')
  or (t='photo' and not c?'images') or (t='file' and jsonb_array_length(coalesce(c->'files','[]'))=0)
  or (t='pr' and not c?'pullRequest') then raise exception 'invalid_request';end if;
 foreach k in array array['chapters','transcript'] loop
  if c?k and t<>'media' then raise exception 'invalid_request';end if;
  last_time:=-1;
  for e in select * from jsonb_array_elements(coalesce(c->k,'[]')) loop
   at_time:=(e->>'start')::numeric;
   if at_time<=last_time or (c?'duration' and at_time>(c->>'duration')::numeric) then raise exception 'invalid_request';end if;
   last_time:=at_time;
  end loop;
 end loop;
 for e in select * from jsonb_array_elements(coalesce(c->'pullRequest'->'checks','[]')) loop
  if e?'conclusion' and e->>'status'<>'completed' then raise exception 'invalid_request';end if;
 end loop;
end $$;
create function sill_private.check_card() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if not new.deleted then perform sill_private.validate_card(new.card,new.content_type);end if;
 return new;
end $$;
create trigger sill_card_check before insert or update on sill_private.contents for each row execute function sill_private.check_card();

create or replace function sill_private.validate_workspace_state(v jsonb) returns void language sql immutable security invoker set search_path='' as $$
 select sill_private.validate_schema(v,'{"type":"object","properties":{"seen":{"type":"boolean"},"read":{"type":"boolean"},"bookmarked":{"type":"boolean"},"later":{"type":"boolean"},"playbackPosition":{"type":"number","minimum":0,"maximum":86400},"progress":{"type":"number","minimum":0,"maximum":1},"note":{"type":"string","maxLength":4000},"taskDone":{"maxItems":100,"type":"array","items":{"type":"string","pattern":"^[a-zA-Z0-9_-]{1,100}$"}},"addedAt":{"type":"number","minimum":0,"maximum":8640000000000000},"snoozedUntil":{"type":"number","minimum":0,"maximum":8640000000000000},"dismissed":{"type":"boolean"},"reminderDone":{"type":"boolean"},"lastReminderKey":{"type":"string","maxLength":200},"lastNotifiedAt":{"type":"number","minimum":0,"maximum":8640000000000000},"readAt":{"type":"number","minimum":0,"maximum":8640000000000000},"restoredAt":{"type":"number","minimum":0,"maximum":8640000000000000},"done":{"type":"boolean"},"archived":{"type":"boolean"},"lessLike":{"type":"boolean"}},"additionalProperties":false}'::jsonb)
$$;
-- Task completion is personal state only; card tasks carry no completion.
create or replace function sill_private.workspace_item(c sill_private.contents) returns jsonb
language sql stable security invoker set search_path='' as $$
 select '{"seen":false,"read":false,"bookmarked":false,"later":false,"playbackPosition":0,"progress":0,"note":"","addedAt":0,"snoozedUntil":0,"dismissed":false,"reminderDone":false,"lastReminderKey":"","lastNotifiedAt":0,"readAt":0,"restoredAt":0,"done":false,"archived":false,"lessLike":false}'::jsonb
 ||jsonb_build_object('taskDone',coalesce((select jsonb_agg(t->'id') from jsonb_array_elements(coalesce(c.card->'tasks','[]')) t where c.content_type='task' and c.state->'done'='true'),'[]'::jsonb),'reminderDone',coalesce(c.state->'reminderDone',c.state->'done','false'::jsonb))||c.state
$$;
drop function sill_private.card_body_markdown(jsonb);
create or replace function sill_private.content_json(c sill_private.contents) returns jsonb
language sql stable security invoker set search_path='' as $$
 select (case when c.deleted then '{}'::jsonb else c.card end) || jsonb_build_object('id',c.id,'type',c.content_type,'title',case when c.deleted then '已删除' else c.card->>'title' end,
 'body',case when c.deleted then '' else coalesce(c.card->>'body','') end,
 'state',c.state,'revision',c.revision,'created_at',to_char(c.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'updated_at',to_char(c.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'deleted',c.deleted)
$$;
-- Keep ownership, permissions, revision and idempotency unchanged; a card upsert replaces the whole card.
do $migration$
declare source text;
begin
 source:=pg_get_functiondef('sill_private.write_v1(text,text,jsonb,text)'::regprocedure);
 if strpos(source,$expected$   if c.card->'readingEstimate'->>'origin'='calculated'$expected$)=0 then raise exception 'migration_source_mismatch: write_v1 reading estimate';end if;
 source:=regexp_replace(source,$re$   if c\.card->'readingEstimate'->>'origin'='calculated'[^\n]*\n$re$,'');
 if strpos(source,$expected$next_card:=(case when ch?'body' then c.card-'points' else c.card end)||(ch-'state');$expected$)=0 then raise exception 'migration_source_mismatch: write_v1 card merge';end if;
 source:=replace(source,$old$next_card:=(case when ch?'body' then c.card-'points' else c.card end)||(ch-'state');$old$,$new$next_card:=c.card||(ch-'state');$new$);
 execute source;
 source:=pg_get_functiondef('sill_private.apply_operations(jsonb,text)'::regprocedure);
 if source !~ $re$;k text;known text\[\]:=array\[[^]]*\];$re$ then raise exception 'migration_source_mismatch: apply_operations field allow-list';end if;
 source:=regexp_replace(source,$re$;k text;known text\[\]:=array\[[^]]*\];$re$,';k text;');
 if strpos(source,$expected$   select coalesce(jsonb_object_agg(key,value),'{}') into v from jsonb_each(ch) where key=any(known);
   perform sill_private.validate_changes(v,true);
   -- Unknown card fields survive full-card edits and remain available to future clients.
   ch:=(coalesce(c.card,'{}')-known-'points')||ch-'id';$expected$)=0 then raise exception 'migration_source_mismatch: apply_operations card merge';end if;
 source:=replace(source,$old$   select coalesce(jsonb_object_agg(key,value),'{}') into v from jsonb_each(ch) where key=any(known);
   perform sill_private.validate_changes(v,true);
   -- Unknown card fields survive full-card edits and remain available to future clients.
   ch:=(coalesce(c.card,'{}')-known-'points')||ch-'id';$old$,$new$   perform sill_private.validate_changes(ch-'id',true);
   ch:=ch-'id';$new$);
 execute source;
end $migration$;
revoke all on function sill_private.validate_card(jsonb,text),sill_private.check_card() from public;
grant execute on function sill_private.validate_card(jsonb,text),sill_private.check_card() to sill_rpc_executor;
commit;

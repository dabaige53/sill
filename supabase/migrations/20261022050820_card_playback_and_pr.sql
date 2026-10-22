-- Additive card and playback fields; runs before the separate Markdown body migration.
begin;
create function sill_private.validate_rich_schema(v jsonb,s jsonb) returns void
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
  if s?'minLength' and length(btrim(v#>>'{}'))<(s->>'minLength')::int then raise exception 'invalid_request';end if;
  if s->>'format'='uri' and v#>>'{}' !~ '^https?://[^/[:space:]]+' then raise exception 'invalid_request';end if;
 end if;
end $$;
create function sill_private.validate_rich_fields(c jsonb) returns void language sql immutable security invoker set search_path='' as $$
 select sill_private.validate_rich_schema(c,'{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"audioUrl":{"description":"Podcast audio URL, read only during playback. Not an acquisition or sync source.","type":"string","pattern":"^https?:\\/\\/"},"chapters":{"maxItems":10000,"type":"array","items":{"type":"object","properties":{"start":{"type":"number","minimum":0,"maximum":86400},"title":{"type":"string","minLength":1,"maxLength":500}},"required":["start","title"],"additionalProperties":{}}},"transcript":{"maxItems":10000,"type":"array","items":{"type":"object","properties":{"start":{"type":"number","minimum":0,"maximum":86400},"text":{"type":"string","minLength":1,"maxLength":20000}},"required":["start","text"],"additionalProperties":{}}},"attachments":{"description":"Mail attachments; when supplied, replaces the legacy single attachment label for display.","maxItems":200,"type":"array","items":{"type":"object","properties":{"name":{"type":"string","minLength":1,"maxLength":300},"url":{"type":"string","pattern":"^https?:\\/\\/"},"mimeType":{"type":"string","minLength":3,"maxLength":200,"pattern":"^[A-Za-z0-9!#$&^_.+-]+\\/[A-Za-z0-9!#$&^_.+-]+$"},"sizeBytes":{"type":"integer","minimum":0,"maximum":9007199254740991}},"required":["name"],"additionalProperties":{}}},"pullRequest":{"description":"PR snapshot written by an assistant. observedAt is the observation time; never presented as live GitHub state.","type":"object","properties":{"repository":{"type":"string","maxLength":300,"pattern":"^[A-Za-z0-9_.-]+\\/[A-Za-z0-9_.-]+$"},"number":{"type":"integer","minimum":1,"maximum":9007199254740991},"state":{"type":"string","enum":["draft","open","merged","closed"]},"observedAt":{"type":"string","format":"date-time","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z|([+-]\\d{2}:\\d{2})))$"},"headBranch":{"type":"string","minLength":1,"maxLength":300},"baseBranch":{"type":"string","minLength":1,"maxLength":300},"author":{"type":"object","properties":{"login":{"type":"string","minLength":1,"maxLength":300},"url":{"type":"string","pattern":"^https?:\\/\\/"}},"required":["login"],"additionalProperties":{}},"reviewers":{"maxItems":100,"type":"array","items":{"type":"object","properties":{"login":{"type":"string","minLength":1,"maxLength":300},"url":{"type":"string","pattern":"^https?:\\/\\/"},"decision":{"type":"string","enum":["pending","approved","changesRequested","commented","dismissed"]}},"required":["login","decision"],"additionalProperties":{}}},"checks":{"maxItems":1000,"type":"array","items":{"type":"object","properties":{"name":{"type":"string","minLength":1,"maxLength":300},"status":{"type":"string","enum":["queued","inProgress","completed"]},"conclusion":{"type":"string","enum":["success","failure","neutral","cancelled","skipped","timedOut","actionRequired","stale"]},"url":{"type":"string","pattern":"^https?:\\/\\/"}},"required":["name","status"],"additionalProperties":{}}},"additions":{"type":"integer","minimum":0,"maximum":9007199254740991},"deletions":{"type":"integer","minimum":0,"maximum":9007199254740991},"changedFiles":{"type":"integer","minimum":0,"maximum":9007199254740991},"comments":{"type":"integer","minimum":0,"maximum":9007199254740991},"reviewRequested":{"type":"boolean"},"files":{"maxItems":3000,"type":"array","items":{"type":"object","properties":{"path":{"type":"string","minLength":1,"maxLength":2000},"additions":{"type":"integer","minimum":0,"maximum":9007199254740991},"deletions":{"type":"integer","minimum":0,"maximum":9007199254740991}},"required":["path"],"additionalProperties":{}}}},"required":["repository","number","state","observedAt"],"additionalProperties":{}}},"additionalProperties":{}}'::jsonb)
$$;
create or replace function sill_private.validate_workspace_state(v jsonb) returns void language sql immutable security invoker set search_path='' as $$
 select sill_private.validate_schema(v,'{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"seen":{"type":"boolean"},"read":{"type":"boolean"},"bookmarked":{"type":"boolean"},"later":{"type":"boolean"},"tagsEdited":{"type":"boolean"},"playbackPosition":{"description":"Actual playback position in seconds, separate from reading progress; saving position does not mark read.","type":"number","minimum":0,"maximum":86400},"progress":{"type":"number","minimum":0,"maximum":1},"note":{"type":"string","maxLength":4000},"tags":{"maxItems":20,"type":"array","items":{"type":"string","maxLength":30}},"taskDone":{"maxItems":100,"type":"array","items":{"type":"string","pattern":"^[a-zA-Z0-9_-]{1,100}$"}},"addedAt":{"type":"number","minimum":0,"maximum":8640000000000000},"snoozedUntil":{"type":"number","minimum":0,"maximum":8640000000000000},"dismissed":{"type":"boolean"},"reminderDone":{"type":"boolean"},"lastReminderKey":{"type":"string","maxLength":200},"lastNotifiedAt":{"type":"number","minimum":0,"maximum":8640000000000000},"readAt":{"type":"number","minimum":0,"maximum":8640000000000000},"restoredAt":{"type":"number","minimum":0,"maximum":8640000000000000},"done":{"type":"boolean"},"archived":{"type":"boolean"},"lessLike":{"type":"boolean"}},"additionalProperties":false}'::jsonb)
$$;
alter function sill_private.validate_card_changes(jsonb,boolean) rename to validate_pre_rich_card_changes;
create function sill_private.validate_card_changes(ch jsonb,creating boolean default false) returns void
language plpgsql stable security invoker set search_path='' as $$
declare basic jsonb;
begin
 perform sill_private.validate_rich_fields(ch);
 basic:=ch-array['audioUrl','chapters','transcript','attachments','pullRequest'];
 if basic='{}' then basic:='{"state":{}}';end if;
 perform sill_private.validate_pre_rich_card_changes(basic,creating);
end $$;
create function sill_private.check_rich_card() returns trigger
language plpgsql security invoker set search_path='' as $$
declare c jsonb:=new.card;t text:=new.content_type;k text;e jsonb;last_time numeric;at_time numeric;
begin
 if new.deleted then return new;end if;
 perform sill_private.validate_rich_fields(c);
 if (c?'audioUrl' and (t<>'media' or c->>'media' is distinct from 'podcast')) or (c?'attachments' and t<>'mail') or (c?'pullRequest' and t<>'pr') or (t='pr' and not c?'pullRequest') then raise exception 'invalid_request';end if;
 foreach k in array array['chapters','transcript'] loop
  if c?k and t<>'media' then raise exception 'invalid_request';end if;
  last_time:=-1;
  for e in select * from jsonb_array_elements(coalesce(c->k,'[]')) loop
   at_time:=(e->>'start')::numeric;
   if at_time<=last_time or (c?'duration' and at_time>(c->>'duration')::numeric) then raise exception 'invalid_request';end if;
   last_time:=at_time;
  end loop;
 end loop;
 if c?'chapterCount' and jsonb_array_length(coalesce(c->'chapters','[]'))>(c->>'chapterCount')::numeric then raise exception 'invalid_request';end if;
 if c?'pullRequest' then
  perform sill_private.validate_card_date(c->'pullRequest'->'observedAt',true);
  for e in select * from jsonb_array_elements(coalesce(c->'pullRequest'->'checks','[]')) loop
   if e?'conclusion' and e->>'status'<>'completed' then raise exception 'invalid_request';end if;
  end loop;
  if c->'pullRequest'?'changedFiles' and jsonb_array_length(coalesce(c->'pullRequest'->'files','[]'))>(c->'pullRequest'->>'changedFiles')::numeric then raise exception 'invalid_request';end if;
 end if;
 return new;
end $$;
create trigger rich_card_fields before insert or update on sill_private.contents for each row execute function sill_private.check_rich_card();
do $migration$
declare source text;
begin
 source:=pg_get_functiondef('sill_private.validate_classic_card_changes(jsonb,boolean)'::regprocedure);
 if strpos(source,$old$'article','mail'$old$)=0 then raise exception 'migration_source_mismatch: PR types';end if;
 execute replace(source,$old$'article','mail'$old$,$new$'pr','article','mail'$new$);
 source:=pg_get_functiondef('sill_private.apply_operations(jsonb,text)'::regprocedure);
 if strpos(source,$old$'coverageEnd']$old$)=0 then raise exception 'migration_source_mismatch: rich allow list';end if;
 execute replace(source,$old$'coverageEnd']$old$,$new$'coverageEnd','audioUrl','chapters','transcript','attachments','pullRequest']$new$);
end $migration$;
revoke all on function sill_private.validate_rich_schema(jsonb,jsonb),sill_private.validate_rich_fields(jsonb),sill_private.validate_card_changes(jsonb,boolean),sill_private.check_rich_card() from public;
grant execute on function sill_private.validate_rich_schema(jsonb,jsonb),sill_private.validate_rich_fields(jsonb),sill_private.validate_card_changes(jsonb,boolean),sill_private.check_rich_card() to sill_rpc_executor;
commit;

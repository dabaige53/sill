begin;
-- Validate the same JSON Schemas used at the HTTP/MCP boundary, including direct RPC callers.
create function sill_private.validate_schema(v jsonb, s jsonb) returns void
language plpgsql immutable security invoker set search_path='' as $$
declare k text; e jsonb;
begin
 if s?'type' and jsonb_typeof(v) is distinct from (case when s->>'type'='integer' then 'number' else s->>'type' end) then raise exception 'invalid_request';end if;
 if s?'enum' and not (s->'enum' @> jsonb_build_array(v)) then raise exception 'invalid_request';end if;
 if jsonb_typeof(v)='object' then
  if s->'additionalProperties'='false' and exists(select 1 from jsonb_object_keys(v) n where not (s->'properties'?n)) then raise exception 'invalid_request';end if;
  for k,e in select * from jsonb_each(v) loop if s->'properties'?k then perform sill_private.validate_schema(e,s->'properties'->k);end if;end loop;
 elsif jsonb_typeof(v)='array' then
  if s?'maxItems' and jsonb_array_length(v)>(s->>'maxItems')::int then raise exception 'invalid_request';end if;
  for e in select * from jsonb_array_elements(v) loop perform sill_private.validate_schema(e,s->'items');end loop;
 elsif jsonb_typeof(v)='string' then
  if (s?'maxLength' and length(v#>>'{}')>(s->>'maxLength')::int) or (s?'pattern' and v#>>'{}' !~ (s->>'pattern')) then raise exception 'invalid_request';end if;
 elsif jsonb_typeof(v)='number' then
  if (s->>'type'='integer' and trunc((v#>>'{}')::numeric)<>(v#>>'{}')::numeric) or (s?'minimum' and (v#>>'{}')::numeric<(s->>'minimum')::numeric) or (s?'maximum' and (v#>>'{}')::numeric>(s->>'maximum')::numeric) then raise exception 'invalid_request';end if;
 end if;
end $$;
create function sill_private.validate_workspace_state(v jsonb) returns void language sql immutable security invoker set search_path='' as $$ select sill_private.validate_schema(v,'{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"seen":{"type":"boolean"},"read":{"type":"boolean"},"bookmarked":{"type":"boolean"},"later":{"type":"boolean"},"tagsEdited":{"type":"boolean"},"progress":{"type":"number","minimum":0,"maximum":1},"note":{"type":"string","maxLength":4000},"tags":{"maxItems":20,"type":"array","items":{"type":"string","maxLength":30}},"taskDone":{"maxItems":100,"type":"array","items":{"type":"string","pattern":"^[a-zA-Z0-9_-]{1,100}$"}},"addedAt":{"type":"number","minimum":0,"maximum":8640000000000000},"snoozedUntil":{"type":"number","minimum":0,"maximum":8640000000000000},"dismissed":{"type":"boolean"},"reminderDone":{"type":"boolean"},"lastReminderKey":{"type":"string","maxLength":200},"lastNotifiedAt":{"type":"number","minimum":0,"maximum":8640000000000000},"readAt":{"type":"number","minimum":0,"maximum":8640000000000000},"restoredAt":{"type":"number","minimum":0,"maximum":8640000000000000},"done":{"type":"boolean"},"archived":{"type":"boolean"},"lessLike":{"type":"boolean"}},"additionalProperties":false}'::jsonb) $$;
create function sill_private.validate_workspace_preferences(v jsonb) returns void language sql immutable security invoker set search_path='' as $$ select sill_private.validate_schema(v,'{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"singleKeyShortcuts":{"type":"boolean"},"sort":{"type":"string","enum":["priority","unread","time"]},"reduceTransparency":{"type":"boolean"},"stack":{"type":"boolean"},"fadeRead":{"type":"boolean"},"archiveAfter":{"type":"string","enum":["3d","7d","never"]},"floatTimely":{"type":"boolean"},"collapseOnFinish":{"type":"boolean"},"newHint":{"type":"string","enum":["away","off"]},"theme":{"type":"string","enum":["system","light","dark"]},"density":{"type":"string","enum":["compact","standard","roomy"]},"reduceMotion":{"type":"boolean"},"aiLocal":{"type":"boolean"},"onboarded":{"type":"boolean"}},"additionalProperties":false}'::jsonb) $$;
-- Preserve the rich-card validator while extending the old write API's state vocabulary.
alter function sill_private.validate_changes(jsonb,boolean) rename to validate_card_changes;
create function sill_private.validate_changes(ch jsonb, creating boolean default false) returns void
language plpgsql immutable security invoker set search_path='' as $$
begin
 if ch?'state' then perform sill_private.validate_workspace_state(ch->'state');end if;
 perform sill_private.validate_card_changes(case when ch-'state'='{}' then jsonb_build_object('state','{}'::jsonb) else ch-'state' end,creating);
end $$;
-- A failed/unknown event result cannot mark completion through the extended state fields.
do $migration$
declare source text;
begin
 source:=pg_get_functiondef('sill_private.write_v1(text,text,jsonb,text)'::regprocedure);
 source:=replace(source, $old$meta->>'outcome'<>'succeeded' and ch->'state'->'done'='true'::jsonb$old$, $new$meta->>'outcome'<>'succeeded' and (ch->'state'->'done'='true'::jsonb or ch->'state'->'reminderDone'='true'::jsonb or coalesce(jsonb_array_length(ch->'state'->'taskDone'),0)>0)$new$);
 execute source;
end $migration$;
create function sill_private.workspace_item(c sill_private.contents) returns jsonb
language sql stable security invoker set search_path='' as $$
 select '{"seen":false,"read":false,"bookmarked":false,"later":false,"tagsEdited":false,"progress":0,"note":"","tags":[],"addedAt":0,"snoozedUntil":0,"dismissed":false,"reminderDone":false,"lastReminderKey":"","lastNotifiedAt":0,"readAt":0,"restoredAt":0,"done":false,"archived":false,"lessLike":false}'::jsonb
 ||jsonb_build_object('taskDone',coalesce((select jsonb_agg(t->'id') from jsonb_array_elements(coalesce(c.card->'tasks','[]')) t where case when c.content_type='task' and c.state?'done' then c.state->'done'='true' else t->'done'='true' end),'[]'::jsonb),'reminderDone',coalesce(c.state->'reminderDone',c.state->'done','false'::jsonb))||c.state
$$;
create function sill_private.workspace_preferences(v jsonb) returns jsonb language sql immutable security invoker set search_path='' as $$
 select '{"singleKeyShortcuts":true,"reduceTransparency":false,"sort":"priority","stack":true,"fadeRead":true,"archiveAfter":"7d","floatTimely":true,"collapseOnFinish":true,"newHint":"away","theme":"system","density":"standard","reduceMotion":false,"aiLocal":true,"onboarded":true}'::jsonb||v
$$;
create function sill_private.get_workspace() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;uid uuid:=sill_private.request_uid();
begin
 perform sill_private.authorize('content:read','*');
 select jsonb_build_object('revision',w.change_version,'state',jsonb_build_object('cards',coalesce((select jsonb_agg(sill_private.content_json(c) order by c.created_at,c.id) from sill_private.contents c where c.owner_id=uid and not c.deleted),'[]'::jsonb),'items',coalesce((select jsonb_object_agg(c.id,sill_private.workspace_item(c)) from sill_private.contents c where c.owner_id=uid and not c.deleted),'{}'::jsonb),'preferences',sill_private.workspace_preferences(w.preferences),'seconds',w.reading_seconds)) into result from sill_private.workspaces w where w.owner_id=uid;
 if result is null then raise exception 'not_found';end if;
 return result;
end $$;
create function sill_private.apply_operations(payload jsonb,idem text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare uid uuid:=sill_private.request_uid(); actor text:=sill_private.caller();w sill_private.workspaces;c sill_private.contents;r sill_private.receipts;o jsonb;v jsonb;b jsonb;ch jsonb;rid text;kind text;digest text;seq bigint;result jsonb;k text;known text[]:=array['title','type','body','url','summary','meta','form','image','tags','sources','points','why','sender','location','meeting','media','duration','files','photos','attachment','tasks','start','end','due','time','people','related','priority'];
begin
 perform sill_private.authorize('content:read','*');
 if jsonb_typeof(payload) is distinct from 'object' or exists(select 1 from jsonb_object_keys(payload) n where n not in ('operations','expectedRevision')) or jsonb_typeof(payload->'operations') is distinct from 'array' or idem is null or idem !~ '^[a-zA-Z0-9_-]{8,128}$' then raise exception 'invalid_request';end if;
 if jsonb_array_length(payload->'operations') not between 1 and 5000 or octet_length(payload::text)>524288 then raise exception 'invalid_request';end if;
 if payload?'expectedRevision' and (jsonb_typeof(payload->'expectedRevision')<>'number' or payload->>'expectedRevision'!~'^[0-9]+$' or (payload->>'expectedRevision')::numeric>9007199254740991) then raise exception 'invalid_request';end if;
 -- Check current permissions before a stored result can be replayed.
 for o in select * from jsonb_array_elements(payload->'operations') loop
  kind:=o->>'op';rid:=case when kind='card.upsert' then o->'card'->>'id' else o->>'id' end;
  if kind not in ('card.upsert','card.delete','item.patch','preferences.patch','reading.add') or kind is null then raise exception 'invalid_request';end if;
  perform sill_private.authorize(case when kind='card.delete' then 'content:delete' else 'content:write' end,case when kind in ('preferences.patch','reading.add') or (kind='card.upsert' and o->'before'='null') then '*' else rid end);
 end loop;
 select * into w from sill_private.workspaces where owner_id=uid for update;
 if not found then raise exception 'not_found';end if;
 digest:=encode(sha256(convert_to(payload::text,'UTF8')),'hex');
 select * into r from sill_private.receipts where owner_id=uid and caller_id=actor and operation_resource='workspace:operations' and idempotency_key=idem;
 if found then
  if r.request_digest<>digest then raise exception 'idempotency_conflict';end if;
  if r.expires_at<=clock_timestamp() then raise exception 'idempotency_expired';end if;
  return r.response;
 end if;
 if payload?'expectedRevision' and (payload->>'expectedRevision')::bigint<>w.change_version then raise exception 'revision_conflict';end if;
 for o in select * from jsonb_array_elements(payload->'operations') loop
  kind:=o->>'op';b:=o->'before';v:=o->'values';rid:=case when kind='card.upsert' then o->'card'->>'id' else o->>'id' end;
  if jsonb_typeof(o)<>'object' or exists(select 1 from jsonb_object_keys(o) n where n<>all(case when kind='card.upsert' then array['op','card','before'] when kind='card.delete' then array['op','id','before'] when kind='item.patch' then array['op','id','values','before'] when kind='preferences.patch' then array['op','values','before'] else array['op','seconds'] end)) then raise exception 'invalid_request';end if;
  if kind<>'reading.add' and not payload?'expectedRevision' and not o?'before' then raise exception 'invalid_request';end if;
  if kind in ('card.upsert','card.delete','item.patch') then
   if rid is null or rid!~'^[a-zA-Z0-9_-]{1,100}$' or rid in ('__proto__','constructor','prototype') then raise exception 'invalid_request';end if;
   select * into c from sill_private.contents where owner_id=uid and id=rid;
   if kind='card.upsert' and b='null' then
    if found then raise exception 'revision_conflict';end if;
   elsif c.id is null or c.deleted then raise exception 'not_found';
   end if;
   if b is not null and b<>'null' then
    if jsonb_typeof(b)<>'object' then raise exception 'invalid_request';end if;
    if kind='item.patch' then
     perform sill_private.validate_workspace_state(b);
     if not payload?'expectedRevision' and exists(select 1 from jsonb_object_keys(v) key where not b?key) then raise exception 'invalid_request';end if;
     if exists(select 1 from jsonb_each(b) p where sill_private.workspace_item(c)->p.key is distinct from p.value) then raise exception 'revision_conflict';end if;
    else
     if (b-'revision'-'state'-'created_at'-'updated_at'-'deleted') is distinct from (sill_private.content_json(c)-'revision'-'state'-'created_at'-'updated_at'-'deleted') then raise exception 'revision_conflict';end if;
    end if;
   elsif b='null' and kind<>'card.upsert' then raise exception 'invalid_request';
   end if;
  end if;
  if kind='card.upsert' then
   ch:=o->'card';
   if jsonb_typeof(ch) is distinct from 'object' or ch ?| array['revision','state','created_at','updated_at','deleted','owner_id','change_version'] then raise exception 'invalid_request';end if;
   select coalesce(jsonb_object_agg(key,value),'{}') into v from jsonb_each(ch) where key=any(known);
   perform sill_private.validate_changes(v,true);
   -- Unknown card fields survive full-card edits and remain available to future clients.
   ch:=coalesce(c.card,'{}')||ch-'id';
   update sill_private.workspaces set change_version=change_version+1 where owner_id=uid returning change_version into seq;
   if c.id is null then
    insert into sill_private.contents(owner_id,id,card,state,content_type,change_version) values(uid,rid,jsonb_build_object('body','[]'::jsonb)||ch,'{}',ch->>'type',seq);
   else
    update sill_private.contents set card=ch,content_type=ch->>'type',revision=revision+1,change_version=seq,updated_at=clock_timestamp() where owner_id=uid and id=rid;
   end if;
  elsif kind='card.delete' then
   update sill_private.workspaces set change_version=change_version+1 where owner_id=uid returning change_version into seq;
 update sill_private.contents set card='{}',item='{}',state='{}',deleted=true,revision=revision+1,change_version=seq,updated_at=clock_timestamp() where owner_id=uid and id=rid;
  elsif kind='item.patch' then
   perform sill_private.validate_workspace_state(v);
   if c.content_type='task' and v ?& array['done','taskDone'] and v->'done' is distinct from to_jsonb(jsonb_array_length(coalesce(c.card->'tasks','[]'))>0 and not exists(select 1 from jsonb_array_elements(coalesce(c.card->'tasks','[]')) t where not v->'taskDone' @> jsonb_build_array(t->'id'))) then raise exception 'invalid_request';end if;
   if v?'taskDone' and exists(select 1 from jsonb_array_elements(v->'taskDone') t where not exists(select 1 from jsonb_array_elements(coalesce(c.card->'tasks','[]')) task where task->'id'=t)) then raise exception 'invalid_request';end if;
   update sill_private.workspaces set change_version=change_version+1 where owner_id=uid returning change_version into seq;
 update sill_private.contents set state=state||v,revision=revision+1,change_version=seq,updated_at=clock_timestamp() where owner_id=uid and id=rid;
  elsif kind='preferences.patch' then
   perform sill_private.authorize('content:write','*');perform sill_private.validate_workspace_preferences(v);
   if b is not null then
    perform sill_private.validate_workspace_preferences(b);
    if not payload?'expectedRevision' and exists(select 1 from jsonb_object_keys(v) key where not b?key) then raise exception 'invalid_request';end if;
    if exists(select 1 from jsonb_each(b) p where sill_private.workspace_preferences(w.preferences)->p.key is distinct from p.value) then raise exception 'revision_conflict';end if;
   end if;
   update sill_private.workspaces set preferences=preferences||v,change_version=change_version+1 where owner_id=uid;
  else
   if jsonb_typeof(o->'seconds') is distinct from 'number' or o->>'seconds'!~'^[0-9]+$' or (o->>'seconds')::numeric>86400 then raise exception 'invalid_request';end if;
   update sill_private.workspaces set reading_seconds=reading_seconds+(o->>'seconds')::numeric,change_version=change_version+1 where owner_id=uid and reading_seconds+(o->>'seconds')::numeric<=10000000;
   if not found then raise exception 'invalid_request';end if;
  end if;
  select * into w from sill_private.workspaces where owner_id=uid;
  seq:=w.change_version;
 end loop;
 result:=sill_private.get_workspace();
 insert into sill_private.receipts(owner_id,caller_id,operation_resource,idempotency_key,request_digest,status_code,response,expires_at) values(uid,actor,'workspace:operations',idem,digest,200,result,clock_timestamp()+interval '7 days');
 return result;
end $$;
create function sill_private.validate_workspace_row() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.content_type='task' then
  if new.state?'taskDone' and (TG_OP='INSERT' or new.state->'taskDone' is distinct from old.state->'taskDone') then
   if new.state?'done' and (TG_OP='INSERT' or new.state->'done' is distinct from old.state->'done') and new.state->'done' is distinct from to_jsonb(jsonb_array_length(coalesce(new.card->'tasks','[]'))>0 and not exists(select 1 from jsonb_array_elements(coalesce(new.card->'tasks','[]')) t where not new.state->'taskDone' @> jsonb_build_array(t->'id'))) then raise exception 'invalid_request';end if;
   new.state:=new.state||jsonb_build_object('done',jsonb_array_length(coalesce(new.card->'tasks','[]'))>0 and not exists(select 1 from jsonb_array_elements(coalesce(new.card->'tasks','[]')) t where not new.state->'taskDone' @> jsonb_build_array(t->'id')));
  elsif new.state?'done' and (TG_OP='INSERT' or new.state->'done' is distinct from old.state->'done') then
   new.state:=new.state||jsonb_build_object('taskDone',case when new.state->'done'='true' then coalesce((select jsonb_agg(t->'id') from jsonb_array_elements(coalesce(new.card->'tasks','[]')) t),'[]'::jsonb) else '[]'::jsonb end);
  end if;
 end if;
 if new.content_type='reminder' then
  if new.state?'reminderDone' and (TG_OP='INSERT' or new.state->'reminderDone' is distinct from old.state->'reminderDone') then new.state:=new.state||jsonb_build_object('done',new.state->'reminderDone');
  elsif new.state?'done' and (TG_OP='INSERT' or new.state->'done' is distinct from old.state->'done') then new.state:=new.state||jsonb_build_object('reminderDone',new.state->'done');end if;
 end if;
 perform sill_private.validate_workspace_state(new.state);
 if new.state?'taskDone' and exists(select 1 from jsonb_array_elements(new.state->'taskDone') t where t#>>'{}' in ('__proto__','constructor','prototype') or not exists(select 1 from jsonb_array_elements(coalesce(new.card->'tasks','[]')) task where task->'id'=t)) then raise exception 'invalid_request';end if;
 return new;
end $$;
create trigger sill_workspace_state_check before insert or update on sill_private.contents for each row execute function sill_private.validate_workspace_row();
create function sill_private.api_get_workspace() returns jsonb language sql security definer set search_path='' set row_security=on as $$select sill_private.get_workspace()$$;
create function sill_private.api_apply_operations(payload jsonb,idem text) returns jsonb language sql security definer set search_path='' set row_security=on as $$select sill_private.apply_operations(payload,idem)$$;
create function public.sill_get_workspace() returns jsonb language sql security invoker set search_path='' as $$select sill_private.api_get_workspace()$$;
create function public.sill_apply_operations(payload jsonb,idem text) returns jsonb language sql security invoker set search_path='' as $$select sill_private.api_apply_operations(payload,idem)$$;
revoke all on function sill_private.validate_schema(jsonb,jsonb),sill_private.validate_workspace_state(jsonb),sill_private.validate_workspace_preferences(jsonb),sill_private.validate_changes(jsonb,boolean),sill_private.workspace_item(sill_private.contents),sill_private.workspace_preferences(jsonb),sill_private.get_workspace(),sill_private.apply_operations(jsonb,text),sill_private.validate_workspace_row(),sill_private.api_get_workspace(),sill_private.api_apply_operations(jsonb,text),public.sill_get_workspace(),public.sill_apply_operations(jsonb,text) from public,anon,authenticated;
grant execute on function sill_private.validate_schema(jsonb,jsonb),sill_private.validate_workspace_state(jsonb),sill_private.validate_workspace_preferences(jsonb),sill_private.validate_changes(jsonb,boolean),sill_private.workspace_item(sill_private.contents),sill_private.workspace_preferences(jsonb),sill_private.get_workspace(),sill_private.apply_operations(jsonb,text),sill_private.validate_workspace_row() to sill_rpc_executor;
grant sill_rpc_executor to current_user with inherit false,set true;
grant create on schema sill_private to sill_rpc_executor;
alter function sill_private.api_get_workspace() owner to sill_rpc_executor;
alter function sill_private.api_apply_operations(jsonb,text) owner to sill_rpc_executor;
revoke create on schema sill_private from sill_rpc_executor;
set local role sill_rpc_executor;
grant execute on function sill_private.api_get_workspace(),sill_private.api_apply_operations(jsonb,text) to authenticated;
reset role;
revoke set option for sill_rpc_executor from current_user;
grant execute on function public.sill_get_workspace(),public.sill_apply_operations(jsonb,text) to authenticated;
commit;

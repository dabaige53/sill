begin;

-- Reads and field-level write guards must agree on the value of an absent field.
create or replace function sill_private.workspace_item(c sill_private.contents) returns jsonb
language sql stable security invoker set search_path='' as $$
 select '{"seen":false,"read":false,"bookmarked":false,"later":false,"tagsEdited":false,"playbackPosition":0,"progress":0,"note":"","tags":[],"addedAt":0,"snoozedUntil":0,"dismissed":false,"reminderDone":false,"lastReminderKey":"","lastNotifiedAt":0,"readAt":0,"restoredAt":0,"done":false,"archived":false,"lessLike":false}'::jsonb
 ||jsonb_build_object('taskDone',coalesce((select jsonb_agg(t->'id') from jsonb_array_elements(coalesce(c.card->'tasks','[]')) t where case when c.content_type='task' and c.state?'done' then c.state->'done'='true' else t->'done'='true' end),'[]'::jsonb),'reminderDone',coalesce(c.state->'reminderDone',c.state->'done','false'::jsonb))||c.state
$$;
create or replace function sill_private.workspace_preferences(v jsonb) returns jsonb
language sql immutable security invoker set search_path='' as $$
 select '{"singleKeyShortcuts":true,"reduceTransparency":false,"sort":"priority","stack":true,"fadeRead":true,"archiveAfter":"7d","floatTimely":true,"collapseOnFinish":true,"newHint":"away","theme":"system","density":"standard","reduceMotion":false,"aiLocal":true,"onboarded":true,"hiddenActions":[],"cardTextSize":"standard","cardSpacing":"standard","cardPadding":"standard","readerTextSize":"standard","readerSpacing":"standard","readerWidth":"full","textWeight":"standard"}'::jsonb||v
$$;

-- Full replacement keeps unknown extensions, not omitted fields from the current contract.
do $migration$
declare source text; patched text;
begin
 source:=pg_get_functiondef('sill_private.apply_operations(jsonb,text)'::regprocedure);
 patched:=regexp_replace(source,
  $old$ch:=\(coalesce\(c.card,'\{\}'\)-array\[[^\]]+\]\)\|\|ch-'id';$old$,
  $new$ch:=(coalesce(c.card,'{}')-known-'points')||ch-'id';$new$);
 if patched=source then raise exception 'migration_source_mismatch: full card replacement';end if;
 execute patched;
end $migration$;

-- Expired keys stay reserved. Only their no-longer-replayable response copies are cleared.
create index receipts_pending_compaction on sill_private.receipts(owner_id,expires_at)
 where response<>'null'::jsonb;
create function sill_private.compact_receipt_responses() returns void
language sql security invoker set search_path='' as $$
 update sill_private.receipts set response='null'::jsonb
 where owner_id=sill_private.request_uid() and expires_at<=statement_timestamp()
 and response<>'null'::jsonb
$$;
revoke all on function sill_private.compact_receipt_responses() from public,anon,authenticated;
grant update(response) on sill_private.receipts to sill_rpc_executor;
grant execute on function sill_private.compact_receipt_responses() to sill_rpc_executor;
do $migration$
declare source text; patched text;
begin
 source:=pg_get_functiondef('sill_private.get_workspace()'::regprocedure);
 patched:=replace(source,
  $old$perform sill_private.authorize('content:read','*');$old$,
  $new$perform sill_private.authorize('content:read','*');
 perform sill_private.compact_receipt_responses();$new$);
 if patched=source then raise exception 'migration_source_mismatch: workspace receipt compaction';end if;
 execute patched;
 source:=pg_get_functiondef('sill_private.session_info()'::regprocedure);
 patched:=replace(source,
  $old$perform sill_private.authorize(g.scopes[1],g.resources[1]);$old$,
  $new$perform sill_private.authorize(g.scopes[1],g.resources[1]);
 perform sill_private.compact_receipt_responses();$new$);
 if patched=source then raise exception 'migration_source_mismatch: session receipt compaction';end if;
 execute patched;
end $migration$;
commit;

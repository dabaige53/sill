-- Additive card fields; preserve authorization, revisions, receipts and existing rows.
begin;
create or replace function sill_private.validate_changes(ch jsonb, creating boolean default false) returns void
language plpgsql immutable security invoker set search_path='' as $$
declare k text; v jsonb; e jsonb; max_items integer; max_chars integer;
begin
 if jsonb_typeof(ch) is distinct from 'object' or ch='{}' then raise exception 'invalid_request'; end if;
 if creating and not (ch ? 'title' and ch ? 'type') then raise exception 'invalid_request'; end if;
 for k,v in select * from jsonb_each(ch) loop
  if k not in ('title','type','body','url','state','summary','meta','form','image','tags','sources','points','why','sender','location','meeting','media','duration','files','photos','attachment','tasks','start','end','due','time','people','related','priority') or v='null' then raise exception 'invalid_request'; end if;
  if k='title' and (jsonb_typeof(v)<>'string' or length(ch->>'title') not between 1 and 1000) then raise exception 'invalid_request'; end if;
  if k='type' and (jsonb_typeof(v)<>'string' or ch->>'type' not in ('article','mail','note','task','event','reminder','media','insight','digest','suggestion','photo','file')) then raise exception 'invalid_request'; end if;
  if k='url' and (jsonb_typeof(v)<>'string' or ch->>'url' !~ '^https?://[^ /]+') then raise exception 'invalid_request'; end if;
  if k='body' then
   if jsonb_typeof(v)<>'array' then raise exception 'invalid_request'; end if;
   if jsonb_array_length(v)>100 or exists(select 1 from jsonb_array_elements(v) b where jsonb_typeof(b)<>'string' or length(b#>>'{}')>50000) then raise exception 'invalid_request'; end if;
  end if;
  if k='state' then
   if jsonb_typeof(v)<>'object' then raise exception 'invalid_request'; end if;
   if exists(select 1 from jsonb_each(v) s where s.key not in ('read','done','archived') or jsonb_typeof(s.value)<>'boolean') then raise exception 'invalid_request'; end if;
  end if;

  if k in ('summary','meta','sender','location','attachment') then
   max_chars:=case when k='summary' then 10000 else 300 end;
   if jsonb_typeof(v)<>'string' or length(v#>>'{}')>max_chars then raise exception 'invalid_request';end if;
  end if;
  if k='form' and (jsonb_typeof(v)<>'string' or v#>>'{}' not in ('standard','image','quote','compact','data')) then raise exception 'invalid_request';end if;
  if k='image' and (jsonb_typeof(v)<>'string' or v#>>'{}' not in ('architecture','coast','mountain','botanical')) then raise exception 'invalid_request';end if;
  if k='media' and (jsonb_typeof(v)<>'string' or v#>>'{}' not in ('video','podcast')) then raise exception 'invalid_request';end if;
  if k in ('start','end','due','time','duration','priority') then
   if jsonb_typeof(v)<>'number' then raise exception 'invalid_request';end if;
   if (v#>>'{}')::numeric<0 or (v#>>'{}')::numeric>(case when k='duration' then 86400 when k='priority' then 10 else 8640000000000000 end) then raise exception 'invalid_request';end if;
   if k='duration' and trunc((v#>>'{}')::numeric)<>(v#>>'{}')::numeric then raise exception 'invalid_request';end if;
  end if;
  if k in ('tags','people','related','points','photos','tasks','sources','files') then
   if jsonb_typeof(v)<>'array' then raise exception 'invalid_request';end if;
   max_items:=case k when 'points' then 3 when 'photos' then 50 when 'sources' then 11 when 'files' then 200 else 100 end;
   if jsonb_array_length(v)>max_items then raise exception 'invalid_request';end if;
   for e in select * from jsonb_array_elements(v) loop
    if k in ('tags','people','related','points','photos') then
     max_chars:=case when k='points' then 200 else 100 end;
     if jsonb_typeof(e)<>'string' or length(e#>>'{}')>max_chars then raise exception 'invalid_request';end if;
     if k='points' and length(e#>>'{}')<1 then raise exception 'invalid_request';end if;
     if k='related' and ((e#>>'{}')!~'^[a-zA-Z0-9_-]{1,100}$' or e#>>'{}' in ('__proto__','constructor','prototype')) then raise exception 'invalid_request';end if;
     if k='photos' and e#>>'{}' not in ('architecture','coast','mountain','botanical') then raise exception 'invalid_request';end if;
    else
     if jsonb_typeof(e)<>'object' then raise exception 'invalid_request';end if;
     if k='tasks' then
      if jsonb_typeof(e->'id') is distinct from 'string' or e->>'id'!~'^[a-zA-Z0-9_-]{1,100}$' or e->>'id' in ('__proto__','constructor','prototype')
       or jsonb_typeof(e->'text') is distinct from 'string' or length(e->>'text') not between 1 and 2000
       or (e?'done' and jsonb_typeof(e->'done')<>'boolean') then raise exception 'invalid_request';end if;
     end if;
     if k in ('sources','files') then
      if jsonb_typeof(e->'name') is distinct from 'string' or length(e->>'name') not between 1 and 300 then raise exception 'invalid_request';end if;
     end if;
     if k='sources' and (jsonb_typeof(e->'kind') is distinct from 'string' or length(e->>'kind') not between 1 and 100) then raise exception 'invalid_request';end if;
     if k='files' then
      if e?'meta' and (jsonb_typeof(e->'meta')<>'string' or length(e->>'meta')>200) then raise exception 'invalid_request';end if;
      if e?'time' then
       if jsonb_typeof(e->'time')<>'number' then raise exception 'invalid_request';end if;
       if (e->>'time')::numeric not between 0 and 8640000000000000 then raise exception 'invalid_request';end if;
      end if;
     end if;
    end if;
   end loop;
   if k='tasks' and (select count(*)<>count(distinct t->>'id') from jsonb_array_elements(v) t) then raise exception 'invalid_request';end if;
  end if;
  if k='meeting' then
   if jsonb_typeof(v)<>'object' or jsonb_typeof(v->'name') is distinct from 'string' or length(v->>'name') not between 1 and 100
    or jsonb_typeof(v->'url') is distinct from 'string' or v->>'url'!~'^https?://[^ /]+'
    or (v?'code' and (jsonb_typeof(v->'code')<>'string' or length(v->>'code')>100)) then raise exception 'invalid_request';end if;
  end if;
  if k='why' then
   if jsonb_typeof(v)<>'object' or jsonb_typeof(v->'reason') is distinct from 'string' or length(v->>'reason') not between 1 and 300 then raise exception 'invalid_request';end if;
   if v?'basis' then
    if jsonb_typeof(v->'basis')<>'array' then raise exception 'invalid_request';end if;
    if jsonb_array_length(v->'basis')>5 or exists(select 1 from jsonb_array_elements(v->'basis') b where jsonb_typeof(b)<>'string' or length(b#>>'{}')>200) then raise exception 'invalid_request';end if;
   end if;
  end if;
 end loop;
end $$;


create or replace function sill_private.content_json(c sill_private.contents) returns jsonb
language sql stable security invoker set search_path='' as $$
 select (case when c.deleted then '{}'::jsonb else c.card end) || jsonb_build_object('id',c.id,'type',c.content_type,'title',case when c.deleted then '已删除' else c.card->>'title' end,
 'body',case when c.deleted then '[]'::jsonb else coalesce(c.card->'body','[]') end,
 'state',c.state,'revision',c.revision,'created_at',to_char(c.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'updated_at',to_char(c.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'deleted',c.deleted)
 ||case when not c.deleted and c.card ? 'url' then jsonb_build_object('url',c.card->'url') else '{}'::jsonb end
$$;

-- Validate paired fields on the merged row, including direct writes through the RPC.
-- Legacy cards without structured fields remain editable.
create function sill_private.validate_rich_card() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if not new.deleted and new.content_type='event' and (new.card ? 'start' or new.card ? 'end') then
  if not (new.card ?& array['start','end']) or (new.card->>'start')::numeric<=0 or (new.card->>'end')::numeric<=(new.card->>'start')::numeric then raise exception 'invalid_request';end if;
 end if;
 if not new.deleted then
  if new.content_type='task' and new.card?'tasks' and jsonb_array_length(new.card->'tasks')=0 then raise exception 'invalid_request';end if;
  if new.content_type='photo' and new.card?'photos' and jsonb_array_length(new.card->'photos')=0 and not new.card?'image' then raise exception 'invalid_request';end if;
  if new.content_type='file' and new.card?'files' and jsonb_array_length(new.card->'files')=0 then raise exception 'invalid_request';end if;
  if new.content_type='media' and new.card->>'media'='video' and not new.card?'image' then raise exception 'invalid_request';end if;
 end if;
 return new;
end $$;
revoke all on function sill_private.validate_rich_card() from public;
create trigger sill_rich_card_check before insert or update on sill_private.contents for each row execute function sill_private.validate_rich_card();
commit;

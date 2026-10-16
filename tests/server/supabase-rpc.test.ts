import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateDesign} from '../../scripts/check-contracts.ts';
import {PGlite} from '@electric-sql/pglite';
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222';
test('private V1 RPC local transactional preparation',async (t?: any)=>{
 const db=new PGlite();
 const outputs=[];
 try {
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
 grant usage on schema auth to authenticated;
 insert into auth.users values('${A}'),('${B}');`);
 for(const name of ['sill_v1_storage.sql','sill_v1_rpc.sql']) await db.exec(await readFile(new URL('../../supabase/drafts/'+name,import.meta.url),'utf8'));
 await db.exec(`insert into sill_private.workspaces(owner_id) select id from auth.users;
 insert into sill_private.caller_grants values
 ('${A}','user:${A}',array['content:read','content:write','content:delete','event:submit','event:read'],array['*']),
 ('${B}','user:${B}',array['content:read','content:write','content:delete','event:submit','event:read'],array['*']),
 ('${A}','oauth:agent',array['content:read','content:write','event:result','event:read'],array['*']),
 ('${A}','oauth:other',array['content:read','content:write','event:result','event:read'],array['*']);
 insert into sill_private.destinations values('${A}','agent','oauth:agent',array['summarize','complete'],true);`);
 async function identity(sub: any=A,client_id?: any){
  await db.exec('reset role');await db.query<Record<string, any>>("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub,role:'authenticated',...(client_id?{client_id}:{})})]);await db.exec('set role authenticated');
 }
 await identity();
 await assert.rejects(db.query<Record<string, any>>("select sill_private.get_content('x')"),/permission denied/);
 // Local synthetic test grants only; no production grants exist in the draft.
 await db.exec(`reset role;grant usage on schema sill_private to authenticated;
 grant execute on all functions in schema sill_private to authenticated;
 grant select,insert,update,delete on sill_private.workspaces,sill_private.contents,sill_private.events,sill_private.receipts,sill_private.sync_snapshots to authenticated;
 grant select on sill_private.caller_grants,sill_private.destinations to authenticated;`);
 await identity();
 const write=async(op?: any,id?: any,payload?: any,key?: any)=> {const r=(await db.query<Record<string, any>>('select sill_private.write_v1($1,$2,$3::jsonb,$4) as value',[op,id,JSON.stringify(payload),key])).rows[0].value;outputs.push({schema:op==='submit_event'?'Event':'Content',value:r.body});return r;};
 const get=async (id?: any)=>(await db.query<Record<string, any>>('select sill_private.get_content($1) as value',[id])).rows[0].value;
 const list=async(cursor: any=null,since: any=null,limit: any=null)=>{const r=(await db.query<Record<string, any>>('select sill_private.list_contents($1,$2,$3) as value',[cursor,since,limit])).rows[0].value;outputs.push({schema:'ContentPage',value:r});return r;};
 let id: any,second: any,firstPage: any,fullWatermark: any;
 await t.test('create replay, request conflict, CAS rollback and no-op',async()=>{
  const original=await write('create',null,{title:'One',type:'note',body:['old'],state:{read:false}},'create_0001');
  id=original.body.id;assert.equal(original.status_code,201);assert.equal(original.body.revision,1);
  assert.deepEqual(await write('create',null,{state:{read:false},body:['old'],type:'note',title:'One'},'create_0001'),original);
  await assert.rejects(write('create',null,{title:'different',type:'note'},'create_0001'),/idempotency_conflict/);
  await assert.rejects(write('update',id,{expectedRevision:0,changes:{title:'bad'}},'update_bad'),/revision_conflict/);
  assert.equal((await get(id)).title,'One');
  await db.query<Record<string, any>>(`update sill_private.contents set card=card||'{"tasks":[{"id":"legacy","text":"preserve","done":false}]}'::jsonb where id=$1`,[id]);
  const updated=await write('update',id,{expectedRevision:1,changes:{title:'Changed'}},'update_001');
  assert.equal(updated.body.revision,2);
  assert.equal((await db.query<Record<string, any>>('select card from sill_private.contents where id=$1',[id])).rows[0].card.tasks[0].text,'preserve');
  assert.deepEqual(await write('update',id,{expectedRevision:1,changes:{title:'Changed'}},'update_001'),updated);
  const same=await write('update',id,{expectedRevision:2,changes:{title:'Changed'}},'noop_0001');assert.equal(same.body.revision,2);
  for(const changes of [{body:null},{unexpected:1},{state:{read:'true'}},{body:[3]},{}]){
   await assert.rejects(write('update',id,{expectedRevision:2,changes},'invalid01'),/invalid_request/);
  }
  const n=(await db.query<Record<string, any>>("select count(*)::int n from sill_private.receipts where idempotency_key in ('update_bad','invalid01')")).rows[0].n;
  assert.equal(n,0);
 });
 await t.test('cross-user isolation and unknown OAuth deny without borrowing owner grants',async()=>{
  await identity(B);await assert.rejects(get(id),/not_found/);
  await assert.rejects(write('delete',id,{expectedRevision:2},'delete_001'),/not_found/);
  await identity(A,'unregistered');await assert.rejects(get(id),/forbidden/);
  await assert.rejects(write('create',null,{title:'One',type:'note',body:['old'],state:{read:false}},'create_0001'),/forbidden/);
  await identity();
 });
 await t.test('snapshot pagination is frozen; update/deletion land in next incremental batch',async()=>{
  second=(await write('create',null,{title:'Two',type:'note'},'create_0002')).body.id;
  firstPage=await list(null,null,1);assert.equal(firstPage.items.length,1);assert.ok(firstPage.next_cursor);assert.equal(firstPage.sync_cursor,null);
  await write('update',id,{expectedRevision:2,changes:{body:['new']}},'update_002');
  await write('delete',second,{expectedRevision:1},'delete_002');
  const next=await list(firstPage.next_cursor);fullWatermark=next.sync_cursor;
  const frozen=[...firstPage.items,...next.items];assert.equal(frozen.find((c?: any)=>c.id===id).revision,2);assert.equal(frozen.find((c?: any)=>c.id===second).deleted,false);
  const delta=await list(null,fullWatermark);assert.equal(delta.items.length,2);
  assert.equal(delta.items.find((c?: any)=>c.id===id).revision,3);
  assert.equal(delta.items.find((c?: any)=>c.id===second).deleted,true);assert.deepEqual(delta.items.find((c?: any)=>c.id===second).body,[]);
  const replay=await write('delete',second,{expectedRevision:1},'delete_002');assert.equal(replay.body.revision,2);
  await assert.rejects(get(second),/not_found/);
  await assert.rejects(list(firstPage.next_cursor,null,2),/invalid_request/);
  await identity(B);await assert.rejects(list(firstPage.next_cursor),/cursor_expired/);await identity();
  await assert.rejects(list(firstPage.next_cursor,fullWatermark),/invalid_request/);
 });
 await t.test('event queued is not complete; wrong assignee denied; result and content atomic',async()=>{
  const event: Record<string, any>={event_id:'event_one',card_id:id,card_version:3,action:'summarize',destination_ref:'agent'};
  const queued=await write('submit_event',null,event,'event_0001');assert.equal(queued.status_code,202);assert.equal(queued.body.outcome,'pending');assert.equal(queued.body.delivery,'queued');
  await assert.rejects(write('submit_event',null,{...event,action:'complete'},'event_0002'),/idempotency_conflict/);
  const payload: Record<string, any>={expectedRevision:3,changes:{title:'result'},metadata:{event_id:'event_one',outcome:'succeeded',summary:'evidence'}};
  await identity(A,'other');await assert.rejects(write('update',id,payload,'result_001'),/forbidden/);assert.equal((await get(id)).title,'Changed');
  await identity(A,'agent');const result=await write('update',id,payload,'result_001');assert.equal(result.body.revision,4);
  assert.deepEqual(await write('update',id,payload,'result_001'),result);
  const e=(await db.query<Record<string, any>>("select sill_private.get_event('event_one') value")).rows[0].value;
  assert.equal(e.outcome,'succeeded');assert.equal(e.result_revision,4);assert.equal(e.delivery,'queued');
  await identity();
  await write('submit_event',null,{...event,event_id:'event_two',card_version:4},'event_0003');
  await identity(A,'agent');
  const metadata: Record<string, any>={event_id:'event_two',outcome:'unknown',summary:'needs reconciliation'};
  await assert.rejects(write('update',id,{expectedRevision:4,changes:{state:{done:true}},metadata},'result_002'),/invalid_request/);
  const unknown=await write('update',id,{expectedRevision:4,metadata},'result_002');assert.equal(unknown.body.revision,4);
  await assert.rejects(write('update',id,{expectedRevision:4,metadata:{...metadata,outcome:'succeeded'}},'result_003'),/event_terminal_conflict/);
  await identity();
 });
 await t.test('expired cursor fails explicitly; no grants or secrets added to public schema',async()=>{
  await db.exec("update sill_private.sync_snapshots set expires_at=created_at+interval '1 microsecond'");
  await assert.rejects(list(firstPage.next_cursor),/cursor_expired/);
  await db.exec('reset role');
  const funcs=(await db.query<Record<string, any>>("select proname,prosecdef from pg_proc join pg_namespace n on n.oid=pronamespace where n.nspname='sill_private'")).rows;
  assert.ok(funcs.every((f?: any)=>!f.prosecdef));
  assert.equal((await db.query<Record<string, any>>("select count(*)::int n from pg_tables where schemaname='public'")).rows[0].n,0);
 });
 await t.test('RPC success projections validate against checked-in V1 schemas',async()=>{
  for(const output of outputs)validateDesign(output.schema.replace('ContentPage','CardPage').replace('Content','Card'),output.value);
  assert.ok(outputs.length>10);
 });
 } finally {await db.close();}
});

/** Real isolated PostgreSQL sessions; no host ports, volumes, passwords or cloud access. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
const image='postgres:17.6@sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929';
const owner='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const container=`sill-pg-test-${process.pid}`;
const quote=x=>"'"+String(x).replaceAll("'","''")+"'";
function command(args,input=''){
 return new Promise((resolve,reject)=>{
  const p=spawn('docker',args,{stdio:['pipe','pipe','pipe']});let out='',err='';
  p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',reject);
  p.on('close',code=>code?reject(Object.assign(new Error(err||out),{code})):resolve(out.trim()));p.stdin.end(input);
 });
}
const sql=s=>command(['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres'],s);
const asUser=(sub=owner,client)=>`set request.jwt.claims=${quote(JSON.stringify({sub,role:'authenticated',aud:client?'https://sill.example/mcp':'authenticated',exp:Math.floor(Date.now()/1000)+3600,...(client?{client_id:client}:{})}))};set role authenticated;`;
const write=(op,id,payload,key)=>`select sill_private.write_v1(${quote(op)},${id===null?'null':quote(id)},${quote(JSON.stringify(payload))}::jsonb,${quote(key)});`;
const parse=out=>JSON.parse(out.split('\n').filter(Boolean)[0]);
async function holding(name){
 for(let n=0;n<100;n++){
  if(await sql(`select count(*) from pg_stat_activity where application_name=${quote(name)} and wait_event='PgSleep';`)==='1') return;
  await new Promise(r=>setTimeout(r,30));
 }
 throw new Error('Writer never acquired lock');
}
test('PostgreSQL 17 actual SQL, concurrent sessions, RLS and rollback', {timeout:90000},async t=>{
 let started=false;
 try{
  await command(['run','--rm','-d','--name',container,'--network','none','--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust',image]);started=true;
  let ready=false;
  for(let n=0;n<150;n++){
   try{
    // The image briefly runs a temporary init server; wait for the final PID 1 server.
    if(await command(['exec',container,'cat','/proc/1/comm'])==='postgres'){
     await command(['exec',container,'pg_isready','-U','postgres']);ready=true;break;
    }
   }catch{}
   await new Promise(r=>setTimeout(r,100));
  }
  assert.ok(ready,'Postgres became ready');
  await sql(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
    grant usage on schema auth to authenticated;
    insert into auth.users values('${owner}'),('${other}');`);
  for(const file of ['sill_v1_storage.sql','sill_v1_rpc.sql'])await sql(await readFile(new URL('../supabase/drafts/'+file,import.meta.url),'utf8'));
  await t.test('draft installs without any authenticated or anon execution privilege',async()=>{
   await assert.rejects(sql(asUser()+"select sill_private.get_content('x');"),/permission denied/);
   await assert.rejects(sql("set role anon;select sill_private.get_content('x');"),/permission denied/);
   assert.equal(await sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='sill_private' and p.prosecdef;"),'0');
  });
  // Synthetic local permissions, never migration content or production SQL.
  await sql(`insert into sill_private.workspaces(owner_id) select id from auth.users;
    insert into sill_private.caller_grants values('${owner}','user:${owner}',array['content:read','content:write','content:delete','event:submit','event:read'],array['*']),
    ('${other}','user:${other}',array['content:read','content:write','content:delete'],array['*']);
    grant usage on schema sill_private to authenticated;grant execute on all functions in schema sill_private to authenticated;
    grant select,insert,update,delete on sill_private.workspaces,sill_private.contents,sill_private.events,sill_private.receipts,sill_private.sync_snapshots to authenticated;
    grant select on sill_private.caller_grants,sill_private.destinations to authenticated;`);
  const created=parse(await sql(asUser()+write('create',null,{title:'Concurrent',type:'note'},'initial_01')));
  const id=created.body.id;
  await t.test('two same-revision writers serialize; stale writer conflicts after first commit',async()=>{
   const first=sql(`set application_name='sill-lock-a';${asUser()}begin;${write('update',id,{expectedRevision:1,changes:{title:'Winner'}},'writer_a1')}select pg_sleep(1.5);commit;`);
   await holding('sill-lock-a');
   const second=sql(asUser()+write('update',id,{expectedRevision:1,changes:{title:'Loser'}},'writer_b1'));
   const results=await Promise.allSettled([first,second]);
   assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');assert.match(results[1].reason.message,/revision_conflict/);
   const row=JSON.parse(await sql(asUser()+`select sill_private.get_content(${quote(id)});`));assert.equal(row.title,'Winner');assert.equal(row.revision,2);
   assert.equal(await sql("select count(*) from sill_private.receipts where idempotency_key='writer_b1';"),'0');
  });
  await t.test('concurrent duplicate create returns same receipt and creates one row',async()=>{
   const request=write('create',null,{title:'Once',type:'note'},'duplicate1');
   const first=sql(`set application_name='sill-lock-b';${asUser()}begin;${request}select pg_sleep(1.5);commit;`);
   await holding('sill-lock-b');
   const [a,b]=await Promise.all([first,sql(asUser()+request)]);assert.deepEqual(parse(a),parse(b));
   assert.equal(await sql("select count(*) from sill_private.contents where card->>'title'='Once';"),'1');
  });
  await t.test('snapshot cannot take watermark of uncommitted writer and delta includes later tombstone',async()=>{
   const first=sql(`set application_name='sill-lock-c';${asUser()}begin;${write('update',id,{expectedRevision:2,changes:{title:'Committed'}},'writer_c1')}select pg_sleep(1.5);commit;`);
   await holding('sill-lock-c');
   const reader=sql(asUser()+"select sill_private.list_contents(null,null,100);");
   const [,page]=await Promise.all([first,reader]);const snap=JSON.parse(page);
   assert.equal(snap.items.find(c=>c.id===id).title,'Committed');assert.ok(snap.sync_cursor);
   await sql(asUser()+write('delete',id,{expectedRevision:3},'delete001'));
   const delta=JSON.parse(await sql(asUser()+`select sill_private.list_contents(null,${quote(snap.sync_cursor)},100);`));
   assert.equal(delta.items.length,1);assert.equal(delta.items[0].deleted,true);assert.equal(delta.items[0].revision,4);
  });
  await t.test('later transaction failure rolls back content, watermark and receipt together',async()=>{
   const before=await sql(`select change_version from sill_private.workspaces where owner_id='${owner}';`);
   await assert.rejects(sql(asUser()+'begin;'+write('create',null,{title:'Rolled back',type:'note'},'rollback1')+'select 1/0;commit;'),/division by zero/);
   assert.equal(await sql("select count(*) from sill_private.contents where card->>'title'='Rolled back';"),'0');
   assert.equal(await sql("select count(*) from sill_private.receipts where idempotency_key='rollback1';"),'0');
   assert.equal(await sql(`select change_version from sill_private.workspaces where owner_id='${owner}';`),before);
  });
  await t.test('real RLS blocks cross-owner raw rows and grant self-escalation',async()=>{
   assert.equal(await sql(asUser(other)+'select count(*) from sill_private.contents;'),'0');
   await assert.rejects(sql(asUser(other)+write('delete',id,{expectedRevision:4},'denied001')),/not_found/);
   await assert.rejects(sql(asUser()+"update sill_private.caller_grants set scopes=array['*'];"),/permission denied/);
   await assert.rejects(sql(asUser(owner,'unregistered')+write('create',null,{title:'No',type:'note'},'denied002')),/forbidden/);
   await assert.rejects(sql(asUser(other)+`insert into sill_private.contents(owner_id,id,change_version,card) values('${owner}','forged',1,'{}');`),/row-level security/);
  });
  await t.test('final boundary: public RPC works but direct tables, raw private RPC and same-owner ungranted client fail',async()=>{
   await sql(await readFile(new URL('../supabase/drafts/sill_v1_boundary.sql',import.meta.url),'utf8'));
   await sql("update sill_private.caller_grants set audience='authenticated' where caller_id like 'user:%';");
   const current=JSON.parse(await sql(asUser()+"select public.sill_list_contents(null,null,100);"));
   assert.ok(current.items.length>0);
   for(const statement of ['select * from sill_private.contents;',"update sill_private.contents set card='{}';",'select * from sill_private.caller_grants;',"select sill_private.get_content('x');"]){
    await assert.rejects(sql(asUser()+statement),/permission denied/);
   }
   assert.equal(await sql("select pg_has_role('authenticated','sill_rpc_executor','MEMBER');"),'f');
   assert.equal(await sql("select rolbypassrls or rolsuper or rolcanlogin from pg_roles where rolname='sill_rpc_executor';"),'f');
   await assert.rejects(sql(asUser(owner,'unregistered')+"select public.sill_list_contents(null,null,100);"),/forbidden/);
   const target=current.items[0].id;
   await sql(`insert into sill_private.caller_grants(owner_id,caller_id,scopes,resources,audience) values('${owner}','oauth:reader',array['content:read'],array[${quote(target)}],'https://sill.example/mcp');`);
   assert.equal(JSON.parse(await sql(asUser(owner,'reader')+`select public.sill_get_content(${quote(target)});`)).id,target);
   await assert.rejects(sql(asUser(owner,'reader')+`select public.sill_write_v1('delete',${quote(target)},'{"expectedRevision":1}','denied001');`),/forbidden/);
   await assert.rejects(sql(asUser(other)+`select public.sill_get_content(${quote(target)});`),/not_found/);
  });
  console.log('ENGINE '+await sql('select version();'));
 }finally{if(started)await command(['rm','-f',container]);}
});

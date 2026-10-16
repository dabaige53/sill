import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {setupBoundary,identity,claims,rpc,A,B,resource} from './helpers/boundary-fixture.ts';

test('public RPC boundary denies direct access and enforces per-client authorization',async (t?: any)=>{
 const db=new PGlite();try{
  await setupBoundary(db);await identity(db);
  const write=(op?: any,id?: any,payload?: any,key?: any)=>rpc(db,'sill_write_v1',[op,id,JSON.stringify(payload),key]);
  const one=(await write('create',null,{type:'note',title:'Owner record'},'create_one')).body;
  const two=(await write('create',null,{type:'note',title:'Other record'},'create_two')).body;
  await t.test('wrapper executes under nonowner non-bypass role; direct table and private RPC deny',async()=>{
   assert.equal((await rpc(db,'sill_get_content',[one.id])).title,'Owner record');
   for(const sql of ['select * from sill_private.contents',"update sill_private.contents set card='{}'",'select * from sill_private.caller_grants',"select sill_private.write_v1('create',null,'{}','bad_key_1')"])await assert.rejects(db.exec(sql),/permission denied/);
   assert.equal((await db.query<Record<string, any>>("select pg_has_role('authenticated','sill_rpc_executor','MEMBER') as member")).rows[0].member,false);
   await db.exec('reset role');
   const role=(await db.query<Record<string, any>>("select rolsuper,rolbypassrls,rolcanlogin from pg_roles where rolname='sill_rpc_executor'")).rows[0];assert.deepEqual(role,{rolsuper:false,rolbypassrls:false,rolcanlogin:false});
   const tables=(await db.query<Record<string, any>>("select count(*)::int n from pg_tables where schemaname='sill_private' and tableowner='sill_rpc_executor'")).rows[0].n;assert.equal(tables,0);
   await db.exec('set role anon');await assert.rejects(rpc(db,'sill_get_content',[one.id]),/permission denied/);
   await identity(db);
  });
  await t.test('cross owner and same-owner clients cannot borrow grants or replay receipts',async()=>{
   await identity(db,claims(B));await assert.rejects(rpc(db,'sill_get_content',[one.id]),/not_found/);
   await db.exec('reset role');await db.query<Record<string, any>>("insert into sill_private.caller_grants values($1,'oauth:reader',array['content:read'],array[$2],$3)",[A,one.id,resource]);
   await identity(db,claims(A,{client_id:'reader',aud:resource}));assert.equal((await rpc(db,'sill_get_content',[one.id])).id,one.id);
   await assert.rejects(rpc(db,'sill_get_content',[two.id]),/forbidden/);
   await assert.rejects(rpc(db,'sill_list_contents',[null,null,50]),/forbidden/);
   await assert.rejects(write('update',one.id,{expectedRevision:1,changes:{title:'No'}},'update_no'),/forbidden/);
   await assert.rejects(write('create',null,{type:'note',title:'Owner record'},'create_one'),/forbidden/);
   await identity(db,claims(A,{client_id:'unknown',aud:resource,user_metadata:{scopes:['*']}}));await assert.rejects(rpc(db,'sill_get_content',[one.id]),/forbidden/);
  });
  await t.test('private claim helpers fail closed without trusted claims and cannot be invoked directly',async()=>{
   await identity(db);await assert.rejects(db.exec('select sill_private.request_claims()'),/permission denied/);
   await assert.rejects(db.exec('select sill_private.request_uid()'),/permission denied/);
   for(const raw of ['', '{}','[]','not-json',JSON.stringify(claims(A,{sub:'invalid'}))]){
    await db.exec('reset role');await db.query<Record<string, any>>("select set_config('request.jwt.claims',$1,false)",[raw]);
    await db.query<Record<string, any>>("select set_config('request.jwt.claim.sub',$1,false)",[A]);
    await db.exec('set role authenticated');await assert.rejects(rpc(db,'sill_get_content',[one.id]),/unauthenticated/);
   }
   await identity(db);
  });
  await t.test('database boundary independently rejects wrong resource, expired and anonymous claims',async()=>{
   for(const extra of [{client_id:'reader',aud:'authenticated'},{client_id:'reader',aud:'https://wrong.example/mcp'},{exp:0},{is_anonymous:true},{role:'anon'}]){
    await identity(db,claims(A,extra));await assert.rejects(rpc(db,'sill_get_content',[one.id]),/forbidden|unauthenticated/);
   }
   await identity(db);
   await assert.rejects(write('update',one.id,{expectedRevision:99,changes:{title:'stale'}},'stale_one'),/revision_conflict/);
   assert.equal((await rpc(db,'sill_get_content',[one.id])).revision,1);
  });
 }finally{await db.close();}
});

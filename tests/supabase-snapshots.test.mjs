import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {setupBoundary,identity,claims,rpc,A,B} from './helpers/boundary-fixture.mjs';
test('session creates no cursors; shared snapshots have bounded count, bytes, age and cleanup',async()=>{
 const db=new PGlite();try{
  await setupBoundary(db);await identity(db);
  for(let i=0;i<20;i++)await rpc(db,'sill_session_info');
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from sill_private.sync_snapshots')).rows[0].n,0);await identity(db);
  for(let i=0;i<4;i++)await rpc(db,'sill_write_v1',['create',null,JSON.stringify({type:'note',title:'Card '+i}),'create_0'+i]);
  const first=await rpc(db,'sill_list_contents',[null,null,1]);let next=await rpc(db,'sill_list_contents',[first.next_cursor,null,null]);
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from sill_private.list_snapshots')).rows[0].n,1);assert.equal((await db.query("select count(*)::int n from sill_private.sync_snapshots where items<>'[]'::jsonb")).rows[0].n,0);await identity(db);
  for(let i=0;i<9;i++)await rpc(db,'sill_list_contents',[null,null,1]);
  await assert.rejects(rpc(db,'sill_list_contents',[next.next_cursor,null,null]),/cursor_expired/);
  for(let i=0;i<135;i++)await rpc(db,'sill_list_contents',[null,null,100]);
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from sill_private.list_snapshots')).rows[0].n,8);assert.equal((await db.query('select count(*)::int n from sill_private.sync_snapshots')).rows[0].n,128);
  await db.exec("update sill_private.list_snapshots set created_at=clock_timestamp()-interval '20 minutes',expires_at=clock_timestamp()-interval '10 minutes';update sill_private.sync_snapshots set created_at=clock_timestamp()-interval '2 days',expires_at=clock_timestamp()-interval '1 day';");
  await identity(db);await rpc(db,'sill_session_info');await db.exec('reset role');
  for(const table of ['list_snapshots','sync_snapshots'])assert.equal((await db.query(`select count(*)::int n from sill_private.${table}`)).rows[0].n,0);
  await identity(db);await rpc(db,'sill_list_contents',[null,null,1]);await db.exec('reset role');
  await db.exec("update sill_private.list_snapshots set created_at=clock_timestamp()-interval '20 minutes',expires_at=clock_timestamp()-interval '10 minutes';");
  await db.exec(await readFile(new URL('../supabase/drafts/sill_v1_expired_snapshot_cleanup.sql',import.meta.url),'utf8'));
  assert.equal((await db.query('select count(*)::int n from sill_private.list_snapshots')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from sill_private.sync_snapshots')).rows[0].n,0);
  await identity(db);
  for(let i=0;i<5;i++)await rpc(db,'sill_write_v1',['create',null,JSON.stringify({type:'note',title:'Large',body:Array(10).fill('x'.repeat(50000))}),'large_00'+i]);
  await assert.rejects(rpc(db,'sill_list_contents',[null,null,100]),/rate_limited/);await db.exec('reset role');
  // Bootstrap refuses unknown owners and refuses silently changing existing grants.
  const script=await readFile(new URL('../supabase/drafts/sill_v1_owner_bootstrap.sql',import.meta.url),'utf8');
  await assert.rejects(db.exec(script),/verified_existing_owner_required/);await db.exec('rollback');
  await db.query("select set_config('sill.bootstrap_owner',$1,false)",[A]);await assert.rejects(db.exec(script),/existing_grant_requires_review/);await db.exec('rollback');
  await db.query("select set_config('sill.bootstrap_owner',$1,false)",[B]);await db.exec(script);await db.exec(script);
  await identity(db,claims(B));assert.equal((await rpc(db,'sill_session_info')).userId,B);
 }finally{await db.close();}
});

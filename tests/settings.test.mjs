import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ConfigSchema } from '../server/config.mjs';
import { Service } from '../server/service.mjs';
import { startHttp } from '../server/http.mjs';

async function fixture(t) {
  const dir=await mkdtemp(join(tmpdir(),'qg-settings-'));
  const config=ConfigSchema.parse({dataDir:dir});
  const service=new Service(config);
  t.after(async()=>{await service.close();await rm(dir,{recursive:true,force:true});});
  return {service,config};
}
const defaults={values:{sort:'priority',reduceTransparency:false},revision:0};

test('settings are strict, transactional, revisioned and persistent; no-op does not audit',async t=>{
  const {service:s,config}=await fixture(t);
  assert.deepEqual(s.readSettings(),defaults);
  assert.equal(s.store.list('settings').length,0,'defaults need no write');
  for(const args of [
    {set:{},expectedRevision:0},{set:{sort:'random'},expectedRevision:0},
    {set:{reduceTransparency:'true'},expectedRevision:0},{set:{sort:null},expectedRevision:0},
    {set:{token:'never accepted'},expectedRevision:0},{set:{sort:'time'},expectedRevision:-1},
    {set:{sort:'time'},expectedRevision:0.5},{set:{sort:'time'},expectedRevision:'0'},
    {set:{sort:'time'}},{set:{sort:'time'},expectedRevision:0,connectorId:'unexpected'},
  ])assert.throws(()=>s.updateSettings(args));
  assert.deepEqual(s.readSettings(),defaults);
  const updated=s.updateSettings({set:{sort:'unread'},expectedRevision:0});
  assert.deepEqual(updated,{values:{sort:'unread',reduceTransparency:false},revision:1});
  assert.deepEqual(s.updateSettings({set:{sort:'unread'},expectedRevision:1}),updated);
  const events=s.store.history().filter(e=>e.event==='settings_updated');
  assert.equal(events.length,1);
  assert.deepEqual(events[0].detail,{changedKeys:['sort'],fromRevision:0,toRevision:1});
  assert.throws(()=>s.updateSettings({set:{sort:'time'},expectedRevision:0}),error=>error.code==='SETTINGS_CONFLICT'&&error.detail.current.revision===1);
  const other=new Service(config);t.after(()=>other.close());
  assert.deepEqual(other.readSettings(),updated,'another connection sees persisted settings');
  const latest=other.updateSettings({set:{reduceTransparency:true},expectedRevision:1});
  assert.throws(()=>s.updateSettings({set:{sort:'time'},expectedRevision:1}),error=>error.code==='SETTINGS_CONFLICT');
  assert.deepEqual(s.readSettings(),latest);
  const audit=s.store.audit.bind(s.store);
  s.store.audit=()=>{throw new Error('simulated audit write failure');};
  assert.throws(()=>s.updateSettings({set:{sort:'time'},expectedRevision:2}),/audit write failure/);
  s.store.audit=audit;
  assert.deepEqual(s.readSettings(),latest,'failed audit rolls back the setting and revision');
});

test('MCP and HTTP use one settings contract, protect access and return conflict instead of overwriting',async t=>{
  const {service}=await fixture(t);
  const token='settings-test-only-012345678901234567890';
  const server=await startHttp(service,{port:0,token}),origin=`http://127.0.0.1:${server.address().port}`;
  const client=new Client({name:'settings-test',version:'1'});
  t.after(async()=>{await client.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  await client.connect(new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
  const tools=await client.listTools();
  assert.equal(tools.tools.length,24,'preserve 19 existing tools plus four content tools');
  assert.ok(tools.tools.some(tool=>tool.name==='qg_update_settings'&&tool.inputSchema.properties.set));
  const call=(name,args={})=>client.callTool({name,arguments:args});
  const read=await call('qg_read_settings');assert.deepEqual(read.structuredContent,defaults);
  assert.equal((await fetch(origin+'/api/settings')).status,401);
  assert.equal((await fetch(origin+'/api/settings',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({set:{sort:'time'},expectedRevision:0})})).status,401);
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  const updated=await call('qg_update_settings',{set:{reduceTransparency:true},expectedRevision:0});
  assert.notEqual(updated.isError,true);
  assert.deepEqual(await (await fetch(origin+'/api/settings',{headers})).json(),updated.structuredContent);
  const patch=await fetch(origin+'/api/settings',{method:'PATCH',headers,body:JSON.stringify({set:{sort:'time'},expectedRevision:1})});
  assert.equal(patch.status,200);const latest=await patch.json();
  assert.deepEqual((await call('qg_read_settings')).structuredContent,latest);
  const conflict=await fetch(origin+'/api/settings',{method:'PATCH',headers,body:JSON.stringify({set:{sort:'priority'},expectedRevision:1})});
  assert.equal(conflict.status,409);assert.deepEqual((await conflict.json()).current,latest);
  const mcpConflict=await call('qg_update_settings',{set:{sort:'unread'},expectedRevision:1});
  assert.equal(mcpConflict.isError,true);assert.equal(mcpConflict.structuredContent.code,'SETTINGS_CONFLICT');
  assert.deepEqual(mcpConflict.structuredContent.current,latest);
  for(const set of [{sort:'invented'},{reduceTransparency:1},{authToken:'not-allowed'},{}]) {
    const bad=await fetch(origin+'/api/settings',{method:'PATCH',headers,body:JSON.stringify({set,expectedRevision:2})});
    assert.equal(bad.status,400);
    assert.equal((await call('qg_update_settings',{set,expectedRevision:2})).isError,true);
  }
  assert.deepEqual(service.readSettings(),latest);
  const noop=await call('qg_update_settings',{set:{sort:'time'},expectedRevision:2});
  assert.deepEqual(noop.structuredContent,latest);
});

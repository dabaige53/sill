/** One real-browser integration journey, with an isolated MCP source and SQLite. */
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ConfigSchema, ROOT } from '../server/config.mjs';
import { Service } from '../server/service.mjs';
import { startHttp } from '../server/http.mjs';

const token='isolated-browser-test-012345678901234567890';
const directory=await mkdtemp(join(tmpdir(),'qg-live-browser-'));
const fixtures=[],clients=[];
let browser;
const artifacts=join(ROOT,'tests/artifacts');
await mkdir(artifacts,{recursive:true});
async function fixture(name,connectors=[]) {
  const service=new Service(ConfigSchema.parse({dataDir:join(directory,name),connectors}));
  service.connectors.env={QG_TEST_TOKEN:token};
  const server=await startHttp(service,{port:0,token});
  const origin=`http://127.0.0.1:${server.address().port}`;
  fixtures.push({service,server});
  const client=new Client({name:'browser-integration',version:'1'});
  await client.connect(new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
  clients.push(client);
  return {service,origin,client};
}
async function call(client,name,args={}) {
  const response=await client.callTool({name,arguments:args});
  assert.notEqual(response.isError,true,JSON.stringify(response));
  return response.structuredContent;
}
try {
  const source=await fixture('source');
  await call(source.client,'qg_ingest',{sourceId:'notes',items:[{externalId:'1',title:'共享源联调笔记',content:'来自隔离 MCP 来源的完整正文。',kind:'note'}]});
  const app=await fixture('app',[{id:'upstream',label:'联调 MCP 来源',type:'mcp',url:source.origin+'/mcp',tokenEnv:'QG_TEST_TOKEN',readTools:['qg_search'],collect:{tool:'qg_search',itemsPath:'items',fields:{id:'id',title:'title',content:'content',kind:'kind'}}}]);
  const collected=await call(app.client,'qg_collect',{connectorId:'upstream'});
  const id=collected.items[0].id;
  const suggestion=await call(app.client,'qg_ingest',{sourceId:'synthesis',items:[{externalId:'s1',title:'有证据的关联建议',kind:'suggestion',content:'综合结论',evidenceIds:[id]}]});
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(({id})=>{
    if(!localStorage.getItem('qg-test-seeded')) {
      localStorage.setItem('quiet-glass-v1',JSON.stringify({version:2,items:{'note-01':{note:'离线演示保持独立'}}}));
      localStorage.setItem('quiet-glass-live-v1',JSON.stringify({version:2,items:{[id]:{note:'连接前保存的本地备注',tags:['保留标签'],tagsEdited:true,progress:.3}}}));
      localStorage.setItem('qg-test-seeded','1');
    }
  },{id});
  await page.goto(app.origin);
  await page.locator('#qg-token').waitFor();
  assert.equal(await page.locator('.feed-card').count(),0,'no demo content before authentication');
  await page.locator('#qg-token').fill(token);
  await page.locator('[data-qg-action="login"]').click();
  await page.locator(`[data-card="${id}"]`).waitFor();
  assert.equal(await page.locator('.feed-card').count(),2);
  assert.equal(await page.locator(`[data-card="${suggestion.cardIds[0]}"] .linked-card`).count(),1,'evidence links use shared V0.5 cards');
  assert.equal(await page.evaluate(id=>window.__quietGlass.store.item(id).note,id),'','legacy notes are not silently uploaded');
  await page.evaluate(id=>window.__app.openPanel('editor',id),id);
  await page.locator('[data-action="annotation-import"]').click();
  await page.locator('[data-action="save-note"]').click();
  await page.waitForFunction(id=>window.__quietGlass.store.item(id).note==='连接前保存的本地备注',id);
  await page.evaluate(id=>window.__app.attach([id]),id);
  assert.equal((await call(app.client,'qg_list_requests')).requests.length,0,'attach is never send');
  await page.locator('#ai-input').fill('请结合这张卡片说明');
  await page.locator('[data-action="ai-send"]').click();
  await page.waitForFunction(()=>document.querySelector('#ai-messages').textContent.includes('已保存请求'));
  const request=(await call(app.client,'qg_list_requests')).requests[0];
  assert.deepEqual(request.cardIds,[id]);
  await call(app.client,'qg_answer_request',{requestId:request.id,answer:'MCP 返回的证据回答',evidenceIds:[id]});
  await page.getByText('MCP 返回的证据回答',{exact:true}).waitFor({timeout:10000});
  await page.evaluate(()=>window.__app.closeAI());
  await page.evaluate(id=>window.__app.action('bookmark',id),id);
  await page.waitForFunction(id=>window.__quietGlass.store.item(id).bookmarked,id);
  await assertEventually(async()=>assert.equal((await call(app.client,'qg_get_card',{cardId:id})).state.bookmarked,true));
  // A slow preview must never replace a newer settings panel.
  let releasePreview,previewStarted;
  const previewReady=new Promise(resolve=>previewStarted=resolve);
  await page.route(`**/api/cards/${id}`,async route=>{previewStarted();await new Promise(resolve=>releasePreview=resolve);await route.continue();});
  await page.locator(`[data-card="${id}"] .card-title-button`).click();
  await previewReady;
  await page.evaluate(()=>window.__app.openPanel('settings'));
  const previewResponse=page.waitForResponse(response=>response.url().endsWith('/api/cards/'+id));
  releasePreview();
  await (await previewResponse).finished();
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  assert.equal(await page.evaluate(()=>window.__app.modalKind),'settings');
  await page.unroute(`**/api/cards/${id}`);
  await page.evaluate(()=>window.__app.navigate('#feed'));
  await page.locator(`[data-card="${id}"] .card-title-button`).click();
  await page.locator('#modal.preview').waitFor();
  await page.locator('[data-action="reader"]').click();
  await page.locator('#modal.reader').waitFor();
  assert.ok((await page.locator('#reader-scroll').textContent()).includes('来自隔离 MCP 来源的完整正文。'));
  assert.ok(!(await page.locator('.reading-caption').first().textContent()).includes('示例正文'));
  await page.evaluate(()=>window.__app.navigate('#feed'));
  await call(source.client,'qg_ingest',{sourceId:'notes',items:[{externalId:'2',title:'等待确认的新卡片',content:'刷新后先排队',kind:'note'}]});
  await page.evaluate(()=>window.__app.refresh());
  await page.waitForFunction(()=>window.__app.pendingCards.length===1,null,{timeout:10000});
  assert.equal(await page.locator('.feed-card').count(),2,'refresh queues new content without changing the feed');
  await page.locator('#new-count').click();
  await page.waitForFunction(()=>document.querySelectorAll('.feed-card').length===3);
  await page.reload();
  await page.locator(`[data-card="${id}"]`).waitFor();
  const state=await page.evaluate(id=>({live:window.__quietGlass.store.item(id),demo:JSON.parse(localStorage.getItem('quiet-glass-v1')),token:localStorage.getItem('QG_AUTH_TOKEN')}),id);
  assert.equal(state.live.note,'连接前保存的本地备注');
  assert.equal(state.live.bookmarked,true);
  assert.deepEqual(state.live.tags,['保留标签']);
  assert.equal(state.demo.items['note-01'].note,'离线演示保持独立');
  assert.equal(state.token,null);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:join(artifacts,'live-integration.png'),fullPage:true});
  await writeFile(join(artifacts,'live-integration.json'),JSON.stringify({status:'PASS',checks:['MCP source collection','shared V0.5 rendering and evidence links','authentication without demo data','browser state isolation and reload','attach-before-send','MCP answer returned to UI','SQLite bookmark feedback','interrupted preview protection','full reader content','refresh queue and explicit insertion','all five entry points'],pageErrors:errors},null,2));
  console.log('PASS live browser + HTTP + MCP end-to-end integration');
} finally {
  await browser?.close();
  for(const client of clients.reverse())await client.close();
  for(const {server,service} of fixtures.reverse()){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await service.close();}
  await rm(directory,{recursive:true,force:true});
}
async function assertEventually(assertion) {
  let error;
  for(let i=0;i<50;i++){try{return await assertion();}catch(e){error=e;await new Promise(resolve=>setTimeout(resolve,50));}}
  throw error;
}

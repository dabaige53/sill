/** Ordinary settings: one browser journey across UI, HTTP, MCP and reload. */
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ConfigSchema, ROOT } from '../server/config.mjs';
import { Service } from '../server/service.mjs';
import { startHttp } from '../server/http.mjs';

const directory=await mkdtemp(join(tmpdir(),'qg-settings-browser-'));
const service=new Service(ConfigSchema.parse({dataDir:directory}));
service.ingest({sourceId:'fixture',items:[{externalId:'one',title:'设置联调卡片',content:'隔离测试内容'}]});
const token='ordinary-settings-test-012345678901234567890';
const server=await startHttp(service,{port:0,token}),origin=`http://127.0.0.1:${server.address().port}`;
const client=new Client({name:'settings-browser-test',version:'1'});
const artifacts=join(ROOT,'tests/artifacts');await mkdir(artifacts,{recursive:true});
let browser;
async function call(name,args={}) {
  const response=await client.callTool({name,arguments:args});
  assert.notEqual(response.isError,true,JSON.stringify(response));return response.structuredContent;
}
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
  await call('qg_update_settings',{set:{sort:'unread',reduceTransparency:true},expectedRevision:0});
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    if(!localStorage.getItem('settings-test-seeded')) {
      localStorage.setItem('sill-live-v1',JSON.stringify({version:2,items:{},sort:'time',reduceTransparency:false}));
      localStorage.setItem('sill-v1',JSON.stringify({version:2,items:{},sort:'priority',reduceTransparency:false}));
      localStorage.setItem('settings-test-seeded','1');
    }
  });
  let firstSettingsRead=true;
  await page.route('**/api/settings',route=>{
    if(route.request().method()==='GET'&&firstSettingsRead){
      firstSettingsRead=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'one transient settings read failure'})});
    }
    return route.continue();
  });
  await page.goto(origin);
  await page.locator('#qg-token').fill(token);await page.locator('[data-qg-action="login"]').click();
  await page.locator('.feed-card').waitFor();
  assert.equal(firstSettingsRead,false,'initial settings failure must not block content loading');
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(()=>window.__app.sort==='unread'&&document.body.classList.contains('opaque'));
  await page.unroute('**/api/settings');
  assert.deepEqual(await page.evaluate(()=>({sort:window.__app.sort,opaque:document.body.classList.contains('opaque')})),{sort:'unread',opaque:true});
  assert.equal((await call('qg_read_settings')).revision,1,'loading never uploads stale localStorage');
  await page.evaluate(()=>window.__app.openPanel('settings'));
  assert.equal(await page.getByRole('switch',{name:'减少透明度'}).getAttribute('aria-checked'),'true');
  await page.getByRole('switch',{name:'减少透明度'}).click();
  await page.waitForFunction(()=>!document.body.classList.contains('opaque'));
  assert.equal((await call('qg_read_settings')).revision,2);
  await page.evaluate(()=>window.__app.openPanel('filter'));
  await page.locator('[data-action="sort-feed"][data-extra="time"]').click();
  await page.waitForFunction(()=>window.__app.sort==='time');
  assert.equal((await call('qg_read_settings')).revision,3);
  await page.evaluate(()=>window.__app.openPanel('settings'));
  await page.evaluate(async()=>{const a=window.__app.action('toggle-transparency');const b=window.__app.action('toggle-transparency');await Promise.all([a,b]);});
  assert.deepEqual(await call('qg_read_settings'),{values:{sort:'time',reduceTransparency:false},revision:5});
  await call('qg_update_settings',{set:{sort:'priority',reduceTransparency:true},expectedRevision:5});
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(()=>window.__app.sort==='priority'&&document.body.classList.contains('opaque'));
  assert.equal(await page.getByRole('switch',{name:'减少透明度'}).getAttribute('aria-checked'),'true');
  // Hold one user change in flight while another client changes the revision.
  let release,started;const ready=new Promise(resolve=>started=resolve);
  let intercepted=0;
  await page.route('**/api/settings',async route=>{
    if(route.request().method()!=='PATCH')return route.continue();
    intercepted++;started();await new Promise(resolve=>release=resolve);await route.continue();
  });
  await page.getByRole('switch',{name:'减少透明度'}).click();await ready;
  await page.evaluate(()=>{window.__app.action('sort-feed','','time');});
  await call('qg_update_settings',{set:{sort:'unread'},expectedRevision:6});
  const response=page.waitForResponse(r=>r.url().endsWith('/api/settings')&&r.request().method()==='PATCH');
  release();assert.equal((await response).status(),409);
  await page.waitForFunction(()=>document.querySelector('#toast-text').textContent.includes('已在另一处更新'));
  assert.equal(intercepted,1,'stale queued gestures are not replayed after a conflict');
  assert.deepEqual(await call('qg_read_settings'),{values:{sort:'unread',reduceTransparency:true},revision:7});
  assert.deepEqual(await page.evaluate(()=>({sort:window.__app.sort,opaque:document.body.classList.contains('opaque')})),{sort:'unread',opaque:true});
  await page.unroute('**/api/settings');
  await page.evaluate(async()=>{await window.__app.action('sort-feed','','time');});
  assert.equal((await call('qg_read_settings')).revision,8,'a fresh explicit gesture may update after conflict');
  await page.reload();await page.locator('.feed-card').waitFor();
  assert.deepEqual(await page.evaluate(()=>({sort:window.__app.sort,opaque:document.body.classList.contains('opaque')})),{sort:'time',opaque:true});
  assert.equal((await call('qg_read_settings')).revision,8,'reload is read-only');
  await page.screenshot({path:join(artifacts,'settings-synchronized.png')});
  // Serve the unchanged standalone page without the HTTP runtime marker.
  const offline=await readFile(join(ROOT,'index.html'),'utf8');
  await page.route('**/offline.html',route=>route.fulfill({status:200,contentType:'text/html',body:offline}));
  await page.goto(origin+'/offline.html');await page.waitForFunction(()=>window.__app);
  assert.equal(await page.evaluate(()=>!!window.__QG_RUNTIME__),false);
  assert.equal(await page.evaluate(()=>window.__app.sort),'priority');
  await page.evaluate(()=>{window.__app.action('toggle-transparency');window.__app.openPanel('filter');window.__app.action('sort-feed','','unread');});
  assert.equal(await page.evaluate(()=>window.__app.sort),'unread');
  assert.deepEqual(await call('qg_read_settings'),{values:{sort:'time',reduceTransparency:true},revision:8},'demo cannot overwrite server settings');
  assert.deepEqual(errors,[]);
  await writeFile(join(artifacts,'settings-browser.json'),JSON.stringify({status:'PASS',checks:['transient settings read does not block feed and recovers','server authority over stale localStorage','UI sort and transparency persist','rapid gestures serialize','MCP changes reach open UI','HTTP conflict applies latest without replay','fresh gesture after conflict','reload stays read-only','offline demo stays local'],pageErrors:errors},null,2));
  console.log('PASS ordinary settings browser + HTTP + MCP synchronization');
} finally {
  await browser?.close();await client.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await service.close();await rm(directory,{recursive:true,force:true});
}

/** F08 owner preference UI: real Chromium, HTTP/MCP CAS, isolated fixture data only.
 * Run: npm run test:preferences-browser (builds the shared host resource first).
 * The host entry below is a protocol simulator, not native-host certification. */
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {ConfigSchema,ROOT} from '../server/config.mjs';
import {Service} from '../server/service.mjs';
import {startHttp} from '../server/http.mjs';

const directory=await mkdtemp(join(tmpdir(),'qg-preferences-browser-'));
const service=new Service(ConfigSchema.parse({dataDir:directory}));
service.ingest({sourceId:'design-source',items:[{externalId:'design',title:'设计研究',content:'设计和阅读的隔离测试内容。'}]});
service.ingest({sourceId:'other-source',items:[{externalId:'other',title:'另一来源卡片',content:'独立测试数据。'}]});
const token='preferences-fixture-only-012345678901234567890';
const server=await startHttp(service,{port:0,token}),origin=`http://127.0.0.1:${server.address().port}`;
const client=new Client({name:'preferences-browser-fixture',version:'1'});
const artifacts=join(ROOT,'tests/artifacts');await mkdir(artifacts,{recursive:true});
const defaults={interests:[],sourcePriorities:{},excludedSourceIds:[],includeRead:false};
const initial={interests:['设计'],sourcePriorities:{'design-source':12},excludedSourceIds:['other-source'],includeRead:true};
const errors=[],checks=[];let browser,page;
async function rawCall(name,args={}){return client.callTool({name,arguments:args});}
async function call(name,args={}){const result=await rawCall(name,args);assert.notEqual(result.isError,true,JSON.stringify(result));return result.structuredContent;}
const read=()=>call('qg_read_settings');
const action=(target,name)=>target.locator(`[data-action="recommendation-${name}"]`);
async function open(target=page){
  await target.evaluate(()=>window.__app.openPanel('settings'));
  await target.locator('#qg-recommendation-settings').waitFor();
  await target.locator('#qg-recommendation-settings').evaluate(node=>{node.open=true;});
  await target.locator('#qg-recommendation-interests').waitFor();
}
async function saved(target=page){await target.waitForFunction(()=>document.querySelector('#qg-recommendation-status')?.textContent.includes('已保存')&&!document.querySelector('[data-action="recommendation-save"]').disabled);}
async function fill(values,target=page){
  await target.locator('#qg-recommendation-interests').fill(values.interests.join('\n'));
  await target.locator('#qg-recommendation-priorities').fill(Object.entries(values.sourcePriorities).map(([id,n])=>`${id}=${n}`).join('\n'));
  await target.locator('#qg-recommendation-excluded').fill(values.excludedSourceIds.join('\n'));
  await target.locator('#qg-recommendation-read').setChecked(values.includeRead);
}
async function pausedPatch(){
  let release,entered;const started=new Promise(resolve=>entered=resolve),hold=new Promise(resolve=>release=resolve);let count=0;
  await page.route('**/api/settings',async route=>{if(route.request().method()!=='PATCH')return route.continue();count++;entered();await hold;return route.continue();});
  return {release,started,count:()=>count};
}
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
  await call('qg_update_settings',{set:{recommendation:initial},expectedRevision:0});
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  const context=await browser.newContext({viewport:{width:1280,height:940},reducedMotion:'reduce'});
  page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{if(!localStorage.getItem('qg-preferences-seeded')){localStorage.setItem('sill-live-v1',JSON.stringify({version:2,items:{},recommendation:{interests:['stale-browser-only']}}));localStorage.setItem('qg-preferences-seeded','1');}});
  await page.goto(origin);await page.locator('#qg-token').fill(token);await page.locator('[data-qg-action="login"]').click();await page.locator('.feed-card').first().waitFor();
  await open();assert.equal(await page.locator('#qg-recommendation-interests').inputValue(),'设计');
  assert.match(await page.locator('#qg-recommendation-saved').innerText(),/design-source/);
  assert.match(await page.locator('#qg-recommendation-sources').innerText(),/design-source/);
  assert.equal((await read()).revision,1,'opening never uploads stale local preferences');
  checks.push('server-authoritative owner snapshot and explicit source IDs');

  const edited={interests:['阅读'],sourcePriorities:{'design-source':20},excludedSourceIds:[],includeRead:false};
  await fill(edited);await action(page,'preview').click();
  await page.waitForFunction(()=>document.querySelector('#qg-recommendation-preview')?.textContent.includes('来源 ID'));
  assert.match(await page.locator('#qg-recommendation-preview').innerText(),/匹配关注词|来源权重|尚未读完/);
  assert.equal((await read()).revision,1,'preview is a read-only per-call override');
  await page.reload();await page.locator('.feed-card').first().waitFor();await open();
  assert.equal(await page.locator('#qg-recommendation-interests').inputValue(),'阅读');
  assert.equal((await read()).revision,1,'reloading draft never writes it');
  await action(page,'save').click();await saved();assert.deepEqual((await read()).values.recommendation,edited);
  checks.push('draft preview explains ranking without saving; reload preserves unsent draft');

  // A delayed preview must not be relabelled under newly refreshed clean values.
  let releasePreview,enteredPreview;const previewStarted=new Promise(resolve=>enteredPreview=resolve),previewHold=new Promise(resolve=>releasePreview=resolve);
  await page.route('**/api/recommend',async route=>{enteredPreview();await previewHold;return route.continue();});
  await action(page,'preview').click();await previewStarted;
  let previewSnapshot=await read();await call('qg_update_settings',{set:{recommendation:{...edited,interests:['预览后更新']}},expectedRevision:previewSnapshot.revision});
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(()=>document.querySelector('#qg-recommendation-interests')?.value==='预览后更新');
  const previewResponse=page.waitForResponse(r=>r.url().endsWith('/api/recommend'));releasePreview();await previewResponse;
  await page.waitForFunction(()=>!document.querySelector('[data-action="recommendation-preview"]').disabled);
  assert.equal(await page.locator('#qg-recommendation-preview').innerText(),'','late old preview cannot appear under refreshed settings');
  await page.unroute('**/api/recommend');await action(page,'preview').click();
  await page.waitForFunction(()=>document.querySelector('#qg-recommendation-preview')?.textContent.includes('来源 ID'));
  previewSnapshot=await read();await call('qg_update_settings',{set:{recommendation:{...edited,interests:['最新预览偏好']}},expectedRevision:previewSnapshot.revision});
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(()=>document.querySelector('#qg-recommendation-interests')?.value==='最新预览偏好');
  assert.equal(await page.locator('#qg-recommendation-preview').innerText(),'','completed preview is cleared when clean fields refresh');
  checks.push('external refresh invalidates delayed and completed previews of older values');

  // A sort write uses the same queue. The recommendation save safely rebases
  // across that local unrelated write, without changing the submitted block.
  await page.locator('#qg-recommendation-interests').fill('共享队列');
  await page.evaluate(()=>{window.__app.action('sort-feed','','time');window.__app.action('recommendation-save');});
  await saved();let snapshot=await read();assert.equal(snapshot.values.sort,'time');assert.deepEqual(snapshot.values.recommendation.interests,['共享队列']);
  checks.push('ordinary and recommendation settings share one CAS queue');

  // Reset only stages defaults; undo remains available after saving and reload.
  const beforeReset=await read();await action(page,'reset').click();
  assert.equal((await read()).revision,beforeReset.revision);assert.equal(await page.locator('#qg-recommendation-interests').inputValue(),'');
  await action(page,'save').click();await saved();assert.deepEqual((await read()).values.recommendation,defaults);
  await page.reload();await page.locator('.feed-card').first().waitFor();await open();await action(page,'undo').click();
  assert.equal(await page.locator('#qg-recommendation-interests').inputValue(),'共享队列');await action(page,'save').click();await saved();
  assert.deepEqual((await read()).values.recommendation,beforeReset.values.recommendation);
  checks.push('explicit default reset is recoverable after save and reload');

  // Hold a save, edit again, navigate away and reopen before it completes.
  await page.locator('#qg-recommendation-interests').fill('提交时内容');let gate=await pausedPatch();
  await action(page,'save').click();await gate.started;
  await page.locator('#qg-recommendation-interests').fill('较新的草稿');
  await page.evaluate(()=>window.__app.openPanel('filter'));
  const response=page.waitForResponse(r=>r.url().endsWith('/api/settings')&&r.request().method()==='PATCH');gate.release();await response;
  await page.waitForFunction(()=>window.__app.modalKind==='filter');assert.equal(await page.locator('#qg-recommendation-settings').count(),0,'late completion cannot reopen settings');
  await page.unroute('**/api/settings');await open();
  assert.equal(await page.locator('#qg-recommendation-interests').inputValue(),'较新的草稿');
  assert.deepEqual((await read()).values.recommendation.interests,['提交时内容']);
  await action(page,'save').click();await saved();assert.deepEqual((await read()).values.recommendation.interests,['较新的草稿']);
  checks.push('delayed save preserves newer edits and navigation');

  // Another owner entry changes the recommendation while our save is in flight.
  await page.locator('#qg-recommendation-interests').fill('冲突草稿');gate=await pausedPatch();await action(page,'save').click();await gate.started;
  snapshot=await read();await call('qg_update_settings',{set:{recommendation:{...initial,interests:['另一入口']}},expectedRevision:snapshot.revision});
  await page.evaluate(()=>{window.__app.action('sort-feed','','unread');});
  const conflictResponse=page.waitForResponse(r=>r.url().endsWith('/api/settings')&&r.request().method()==='PATCH');gate.release();assert.equal((await conflictResponse).status(),409);
  await page.waitForFunction(()=>!document.querySelector('[data-action="recommendation-retry"]').hidden);
  assert.equal(gate.count(),1,'queued stale gestures are invalidated instead of replayed');
  assert.equal(await page.locator('#qg-recommendation-interests').inputValue(),'冲突草稿');
  assert.match(await page.locator('#qg-recommendation-saved').innerText(),/另一入口/);
  await page.unroute('**/api/settings');await page.reload();await page.locator('.feed-card').first().waitFor();await open();
  assert.equal(await page.locator('#qg-recommendation-interests').inputValue(),'冲突草稿');
  assert.equal(await action(page,'save').isDisabled(),true);await action(page,'retry').click();await saved();
  assert.deepEqual((await read()).values.recommendation.interests,['冲突草稿']);
  checks.push('MCP conflict preserves reloadable draft and requires fresh explicit decision');

  // Offline failure never uploads when connectivity returns; only explicit save.
  const beforeOffline=(await read()).revision;
  await page.locator('#qg-recommendation-interests').fill('离线草稿');
  await page.route('**/api/settings',route=>route.request().method()==='PATCH'?route.abort('internetdisconnected'):route.continue());
  await action(page,'save').click();await page.waitForFunction(()=>document.querySelector('#qg-recommendation-status')?.textContent.includes('未保存'));
  await page.unroute('**/api/settings');await page.reload();await page.locator('.feed-card').first().waitFor();await open();
  assert.equal(await page.locator('#qg-recommendation-interests').inputValue(),'离线草稿');assert.equal((await read()).revision,beforeOffline);
  await action(page,'save').click();await saved();assert.deepEqual((await read()).values.recommendation.interests,['离线草稿']);
  await page.locator('#qg-recommendation-priorities').fill('design-source=31');await action(page,'save').click();
  await page.waitForFunction(()=>document.querySelector('#qg-recommendation-status')?.textContent.includes('−30 到 30'));
  assert.equal((await read()).revision,beforeOffline+1,'invalid input never reaches settings write');
  await page.locator('#qg-recommendation-priorities').fill('design-source=20');
  checks.push('offline failure and validation preserve drafts without automatic retry');

  await page.setViewportSize({width:390,height:844});await page.locator('#qg-recommendation-settings').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'mobile settings do not overflow viewport');
  await page.screenshot({path:join(artifacts,'preferences-mobile.png')});
  checks.push('mobile settings stay within viewport');

  const failedPage=await context.newPage();failedPage.on('pageerror',error=>errors.push(error.message));
  await failedPage.route('**/web/preferences.js',route=>route.abort('failed'));
  await failedPage.goto(origin);await failedPage.locator('.feed-card').first().waitFor();
  assert.equal(await failedPage.evaluate(()=>!!window.__app),true);await failedPage.close();
  checks.push('optional preference script failure does not block existing feed');

  // Credential-free shared host UI under a bounded protocol simulator.
  const hostPage=await context.newPage();hostPage.setDefaultTimeout(12000);hostPage.on('pageerror',error=>errors.push(error.message));
  await hostPage.exposeFunction('preferenceToolProxy',async request=>rawCall(request.name,request.arguments||{}));
  await hostPage.goto(origin+'/health');const network=[];
  await hostPage.route('**/*',route=>{network.push(route.request().url());return route.abort('blockedbyclient');});
  await hostPage.setContent('<!doctype html><html><body style="margin:0"></body></html>');
  await hostPage.evaluate(html=>{
    const frame=document.createElement('iframe');frame.id='preference-host';frame.style.cssText='width:100%;height:900px;border:0';frame.setAttribute('sandbox','allow-scripts allow-same-origin');
    window.addEventListener('message',async event=>{
      if(event.source!==frame.contentWindow||event.data?.jsonrpc!=='2.0'||event.data.id==null)return;
      const request=event.data,reply=result=>event.source.postMessage({jsonrpc:'2.0',id:request.id,result},'*');
      if(request.method==='ui/initialize')reply({protocolVersion:request.params.protocolVersion,hostInfo:{name:'preference-protocol-simulator',version:'1'},hostCapabilities:{serverTools:{}},hostContext:{theme:'light',platform:'web',displayMode:'inline',availableDisplayModes:['inline']}});
      else if(request.method==='tools/call')reply(await window.preferenceToolProxy(request.params));
      else reply({});
    });
    document.body.appendChild(frame);frame.srcdoc=html;
  },await readFile(join(ROOT,'dist/host-app.html'),'utf8'));
  const frame=await (await hostPage.locator('#preference-host').elementHandle()).contentFrame();
  await frame.locator('.feed-card').first().waitFor();await open(frame);
  // Host and standalone share service settings, with isolated unsent draft storage.
  const hostBefore=await read();await fill({...defaults,interests:['宿主草稿']},frame);
  await action(frame,'preview').click();await frame.waitForFunction(()=>document.querySelector('#qg-recommendation-preview')?.textContent.includes('来源 ID'));
  assert.equal((await read()).revision,hostBefore.revision);await action(frame,'save').click();await saved(frame);
  assert.deepEqual((await read()).values.recommendation.interests,['宿主草稿']);
  assert.deepEqual(network,[],'host needs no browser network or credentials');
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(()=>document.querySelector('#qg-recommendation-saved')?.textContent.includes('宿主草稿'));
  assert.equal(await page.locator('#qg-recommendation-interests').inputValue(),'离线草稿','host refresh cannot overwrite unsaved standalone draft');
  await page.reload();await page.locator('.feed-card').first().waitFor();await open();
  assert.equal(await page.locator('#qg-recommendation-interests').inputValue(),'离线草稿','host save cannot remove the standalone reloadable draft');
  checks.push('credential-free MCP host shares saved preferences and preview; unsent other-entry drafts survive reload');
  assert.deepEqual(errors,[]);
  await writeFile(join(artifacts,'preferences-browser.json'),JSON.stringify({status:'PASS',checks,pageErrors:errors,host:'Protocol simulator only, not native-host certification'},null,2));
  console.log('PASS F08 preferences browser: '+checks.join('; '));
} finally {
  await browser?.close();await client.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await service.close();await rm(directory,{recursive:true,force:true});
}

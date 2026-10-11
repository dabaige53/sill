/** F10 owner controls, real Chromium + real pinned Wasmtime on synthetic fixtures.
 * Run: npm run test:scripts-browser. Runtime absence is a failure, never a fake pass.
 * Enabled/fuel-lowered configuration exists only in isolated temporary fixtures.
 * The MCP frame is a protocol simulator, not native-host certification. */
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

const root=await mkdtemp(join(tmpdir(),'qg-scripts-browser-'));
const artifacts=join(ROOT,'tests/artifacts');await mkdir(artifacts,{recursive:true});
const token='scripts-browser-synthetic-only-012345678901234567890';
const fixtures=[],checks=[],errors=[],mutations=[],routeErrors=[],gates=new Set();
let browser,page,closing=false;
async function fixture(name,scripts={},options={}){
  const service=new Service(ConfigSchema.parse({dataDir:join(root,name),scripts}),options);
  service.ingest({sourceId:'script-fixture',items:[{externalId:'one',title:'WebAssembly 浏览器合成测试',content:'固定注册模块测试，不读取用户内容或凭据。'}]});
  const server=await startHttp(service,{port:0,token}),origin=`http://127.0.0.1:${server.address().port}`;
  const client=new Client({name:'scripts-browser-fixture',version:'1'});
  await client.connect(new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
  const call=async(name,args={})=>{const result=await client.callTool({name,arguments:args});assert.notEqual(result.isError,true,JSON.stringify(result));return result.structuredContent;};
  const value={service,server,origin,client,call};fixtures.push(value);return value;
}
async function login(target,fixture){
  await target.goto(fixture.origin);if(await target.locator('#qg-token').count()){await target.locator('#qg-token').fill(token);await target.locator('[data-qg-action="login"]').click();}
  await target.locator('.feed-card').first().waitFor();
}
async function open(target=page){
  await target.evaluate(()=>window.__app.openPanel('settings'));await target.locator('#qg-scripts-settings').waitFor();
  await target.locator('#qg-scripts-settings').evaluate(node=>{node.open=true;});
  await target.waitForFunction(()=>/脚本执行已停用|运行器可用|运行器不可用/.test(document.querySelector('#qg-scripts-runtime')?.textContent||''));
}
const action=(target,name,id)=>target.locator(`[data-action="scripts-${name}"]${id?`[data-id="${id}"]`:''}`);
async function form(scriptId,parameters,target=page){
  await target.locator('#qg-script-id').selectOption(scriptId);await target.locator('#qg-script-parameters').fill(typeof parameters==='string'?parameters:JSON.stringify(parameters));
}
async function waitNotice(pattern,target=page){await target.waitForFunction(source=>new RegExp(source).test(document.querySelector('#qg-scripts-status')?.textContent||''),pattern);}
async function finish(fixture,target=page){await fixture.service.scripts.drain();await action(target,'refresh').click();await target.waitForFunction(()=>!document.querySelector('[data-action="scripts-refresh"]')?.disabled);}
async function holdRequest(path,method='GET'){
  let entered,release;const started=new Promise(resolve=>entered=resolve),hold=new Promise(resolve=>release=resolve);let count=0;
  const match=url=>new URL(url).pathname===path,active=new Set();
  const handler=route=>{const task=(async()=>{if(route.request().method()!==method)return route.continue();count++;entered();await hold;return route.continue();})().catch(error=>{if(!closing)routeErrors.push(`${path}: ${error.message}`);});active.add(task);task.finally(()=>active.delete(task));return task;};
  await page.route(match,handler);const gate={started,release,count:()=>count,remove:async()=>{await Promise.all([...active]);await page.unroute(match,handler);gates.delete(gate);}};gates.add(gate);return gate;
}
try{
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  const context=await browser.newContext({viewport:{width:1280,height:980},reducedMotion:'reduce'});
  page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/script')&&request.method()!=='GET')mutations.push({url:request.url(),body:request.postDataJSON(),method:request.method()});});

  const disabled=await fixture('disabled');await login(page,disabled);await open();
  assert.match(await page.locator('#qg-scripts-runtime').innerText(),/包括手动运行也被拒绝/);
  assert.equal(await action(page,'run').isDisabled(),true);await page.evaluate(()=>window.__app.action('scripts-run'));
  assert.equal(mutations.length,0);assert.equal((await disabled.call('qg_list_script_runs')).total,0);
  assert.deepEqual(await page.locator('#qg-script-id option').evaluateAll(nodes=>nodes.map(node=>node.value)),['integer-stats','bounded-echo']);
  assert.equal(await page.locator('#qg-scripts-settings input[type="file"]').count(),0);
  await page.locator('#qg-scripts-registry').evaluate(node=>{node.parentElement.open=true;});
  assert.match(await page.locator('#qg-scripts-registry').innerText(),/[a-f0-9]{64}/);
  assert.match(await page.locator('#qg-scripts-settings').innerText(),/WebAssembly 脚本（受限 v1）/);
  checks.push('disabled default rejects manual execution; fixed IDs/version/hash; no upload/source/enable control or page writes');

  const enabled=await fixture('enabled',{enabled:true});
  const available=await enabled.call('qg_list_scripts');assert.equal(available.runtimeAvailability.available,true,JSON.stringify(available.runtimeAvailability));
  assert.equal(available.runtimeAvailability.runtime,'wasmtime-py');assert.equal(available.runtimeAvailability.version,'49.0.0');
  await login(page,enabled);await open();assert.equal(await action(page,'run').isDisabled(),false);
  const beforeInvalid=mutations.length;
  await form('integer-stats','{"values":');await action(page,'run').click();await waitNotice('有效 JSON');assert.equal(mutations.length,beforeInvalid);
  await page.reload();await page.locator('.feed-card').first().waitFor();await open();assert.equal(await page.locator('#qg-script-parameters').inputValue(),'{"values":');await waitNotice('有效 JSON');
  await form('integer-stats',{values:[1000001]});await action(page,'run').click();await waitNotice('1000000');assert.equal(mutations.length,beforeInvalid);
  await form('bounded-echo',{text:'x',source:'anything'});await action(page,'run').click();assert.equal(mutations.length,beforeInvalid);
  await page.locator('#qg-script-id').selectOption('integer-stats');assert.equal(await page.locator('#qg-script-parameters').inputValue(),'{"values":[1000001]}');
  await page.locator('#qg-script-id').selectOption('bounded-echo');assert.equal(await page.locator('#qg-script-parameters').inputValue(),'{"text":"x","source":"anything"}');
  checks.push('bounded strict JSON validation stays local; per-script drafts and errors survive switching/reload without execution');

  await form('integer-stats',{values:[-7,0,9,1000000]});let gate=await holdRequest('/api/script-runs','POST');
  await page.evaluate(()=>{window.__app.action('scripts-run');window.__app.action('scripts-run');});await gate.started;
  assert.equal(gate.count(),1);assert.equal(await action(page,'run').isDisabled(),true);gate.release();await waitNotice('已确认运行');await gate.remove();await finish(enabled);
  let snapshot=await enabled.call('qg_list_script_runs'),first=snapshot.runs[0];assert.equal(snapshot.total,1);assert.equal(first.status,'completed');
  const firstDetail=await enabled.call('qg_get_script_run',{runId:first.id});assert.deepEqual(firstDetail.result.output,{count:4,sum:1000002,min:-7,max:1000000});
  assert.equal(firstDetail.result.runtime,'wasmtime-py');assert.ok(firstDetail.result.metrics.fuelConsumed>0);
  await page.locator(`[data-script-result="${first.id}"]`).waitFor();assert.match(await page.locator('#qg-script-detail').innerText(),/1000002/);
  checks.push('duplicate gestures dispatch once; actual Wasmtime integer-stat result, identity and consumed fuel rendered');

  const attacker='<img src="https://untrusted.invalid/wasm" onerror="window.__WASM_XSS__=true">';
  await form('bounded-echo',{text:attacker});let lostBody;
  await page.route('**/api/script-runs',async route=>{if(route.request().method()!=='POST')return route.continue();lostBody=route.request().postDataJSON();await route.fetch();await route.abort('failed');});
  await action(page,'run').click();await waitNotice('结果尚未确认');await enabled.service.scripts.drain();assert.equal((await enabled.call('qg_list_script_runs')).total,2);
  await page.unroute('**/api/script-runs');await page.reload();await page.locator('.feed-card').first().waitFor();await open();
  assert.equal(await page.locator('#qg-script-parameters').isDisabled(),true);assert.equal(await action(page,'run').innerText(),'重试上次运行请求');
  const beforeRetry=mutations.length;await page.waitForTimeout(2800);assert.equal(mutations.length,beforeRetry,'read-only refresh never resubmits pending request');
  // A disabled/input rejection before server receipt lookup does not establish
  // whether the previously accepted request ran. Keep its receipt for recovery.
  await page.route('**/api/script-runs',async route=>{if(route.request().method()!=='POST')return route.continue();return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({code:'SCRIPT_DISABLED',message:'合成测试：运营者暂时停用执行'})});});
  await action(page,'run').click();await waitNotice('上次结果仍需确认');assert.equal(await page.locator('#qg-script-parameters').isDisabled(),true);
  assert.equal(await action(page,'run').innerText(),'重试上次运行请求');await page.unroute('**/api/script-runs');
  await action(page,'run').click();await waitNotice('已确认运行');await finish(enabled);
  assert.deepEqual(mutations.filter(item=>new URL(item.url).pathname==='/api/script-runs').at(-1).body,lostBody);
  snapshot=await enabled.call('qg_list_script_runs');assert.equal(snapshot.total,2);const second=snapshot.runs.find(run=>run.id!==first.id);
  assert.equal((await enabled.call('qg_get_script_run',{runId:second.id})).result.output.text,attacker);
  await page.locator(`[data-script-result="${second.id}"]`).waitFor();assert.equal(await page.locator('#qg-script-detail img').count(),0);assert.equal(await page.evaluate(()=>window.__WASM_XSS__),undefined);
  checks.push('actual echo result escaped; lost accepted response uses identical immutable receipt across reload and never automatically retries');

  // Hold real reads; older responses cannot repaint a new selection or panel.
  gate=await holdRequest(`/api/script-runs/${first.id}`);await action(page,'detail',first.id).click();await gate.started;
  await action(page,'detail',second.id).click();await page.locator(`[data-script-result="${second.id}"]`).waitFor();gate.release();await gate.remove();
  await page.evaluate(()=>new Promise(requestAnimationFrame));assert.equal(await page.locator(`[data-script-result="${first.id}"]`).count(),0);
  gate=await holdRequest(`/api/script-runs/${first.id}`);await action(page,'detail',first.id).click();await gate.started;
  await page.evaluate(()=>window.__app.openPanel('filter'));gate.release();await gate.remove();assert.equal(await page.evaluate(()=>window.__app.modalKind),'filter');
  assert.equal(await page.locator('#qg-scripts-settings').count(),0);await open();
  checks.push('late detail reads cannot replace newer selected run or reopen dismissed settings');

  await form('integer-stats','{"values":[17]}');const beforeOffline=mutations.length;
  await page.route('**/api/scripts',route=>route.abort('internetdisconnected'));await action(page,'refresh').click();
  await page.waitForFunction(()=>document.querySelector('#qg-scripts-runtime')?.textContent.includes('暂时无法读取'));assert.equal(await action(page,'run').isDisabled(),true);
  assert.equal(await page.locator('#qg-script-parameters').inputValue(),'{"values":[17]}');await page.unroute('**/api/scripts');await action(page,'refresh').click();
  await page.waitForFunction(()=>document.querySelector('#qg-scripts-runtime')?.textContent.includes('运行器可用'));
  await page.route('**/api/script-runs?*',route=>route.abort('internetdisconnected'));await action(page,'refresh').click();
  await page.waitForFunction(()=>document.querySelector('#qg-scripts-history-status')?.textContent.includes('暂时无法读取'));
  assert.equal(await page.locator('[data-script-run-id]').count(),2);await page.unroute('**/api/script-runs?*');await action(page,'refresh').click();
  await page.waitForFunction(()=>!document.querySelector('[data-action="scripts-refresh"]')?.disabled);assert.equal(mutations.length,beforeOffline);
  checks.push('offline registry fails closed; history/read errors preserve draft/results and recover without writes');

  // Explicit synthetic runs populate real retained history; none are auto-created.
  for(let index=0;index<10;index++){await enabled.call('qg_run_script',{scriptId:'integer-stats',version:'1.0.0',parameters:{values:[index]},idempotencyKey:`browser-history-${index}`});await enabled.service.scripts.drain();}
  await action(page,'refresh').click();await page.waitForFunction(()=>document.querySelectorAll('[data-script-run-id]').length===10);
  await action(page,'next').click();await page.waitForFunction(()=>document.querySelectorAll('[data-script-run-id]').length===2);
  await action(page,'previous').click();await page.waitForFunction(()=>document.querySelectorAll('[data-script-run-id]').length===10);
  await page.locator('#qg-scripts-settings > summary').evaluate(node=>node.scrollIntoView({block:'start'}));await page.screenshot({path:join(artifacts,'scripts-desktop.png')});
  await page.locator('#qg-script-detail').evaluate(node=>node.scrollIntoView({block:'start'}));await page.screenshot({path:join(artifacts,'scripts-result-desktop.png')});
  await page.setViewportSize({width:390,height:844});await page.locator('#qg-scripts-settings > summary').evaluate(node=>node.scrollIntoView({block:'start'}));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'mobile controls remain in viewport');
  await page.screenshot({path:join(artifacts,'scripts-mobile.png')});await page.setViewportSize({width:1280,height:980});
  checks.push('real execution history pagination capped at ten visible rows; mobile layout remains bounded');

  const failedPage=await context.newPage();failedPage.on('pageerror',error=>errors.push(error.message));await failedPage.route('**/web/scripts.js',route=>route.abort('failed'));
  await login(failedPage,enabled);assert.equal(await failedPage.evaluate(()=>!!window.__app),true);await failedPage.close();
  checks.push('optional script control module failure never blocks feed or sign-in');

  // A trusted before-commit checkpoint holds an actual completed Wasmtime result.
  // Browser cancellation/timeout must prevent committing that late result. The
  // runtime suite separately verifies killing a live child process and cleanup.
  let cancelEntered,releaseCancel;
  const cancelStarted=new Promise(resolve=>cancelEntered=resolve),cancelHold=new Promise(resolve=>releaseCancel=resolve);
  const cancellation=await fixture('cancel',{enabled:true},{scriptsCheckpoint:async stage=>{if(stage==='before-commit'){cancelEntered();await cancelHold;}}});
  cancellation.release=releaseCancel;await login(page,cancellation);await open();await form('integer-stats',{values:[4,5]});
  await action(page,'run').click();await waitNotice('已确认运行');await Promise.race([cancelStarted,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Actual runtime did not reach the precommit cancellation checkpoint')),5000))]);
  const cancelRun=(await cancellation.call('qg_list_script_runs')).runs[0];assert.equal(cancelRun.status,'running');
  await action(page,'cancel',cancelRun.id).waitFor();await action(page,'cancel',cancelRun.id).click();await waitNotice('已取消');releaseCancel();await finish(cancellation);
  assert.equal((await cancellation.call('qg_get_script_run',{runId:cancelRun.id})).status,'cancelled');
  assert.equal((await cancellation.call('qg_get_script_run',{runId:cancelRun.id})).result,null);
  checks.push('explicit browser cancellation discards a real Wasmtime result held at trusted precommit checkpoint');

  let releaseTimeout;const timeoutHold=new Promise(resolve=>releaseTimeout=resolve);
  const timeout=await fixture('timeout',{enabled:true,timeoutMs:500},{scriptsCheckpoint:async stage=>{if(stage==='before-commit')await timeoutHold;}});
  timeout.release=releaseTimeout;await login(page,timeout);await open();await form('integer-stats',{values:[4,5]});
  await action(page,'run').click();await waitNotice('已确认运行');await timeout.service.scripts.drain();releaseTimeout();await finish(timeout);
  const timeoutRun=(await timeout.call('qg_list_script_runs')).runs[0];assert.equal(timeoutRun.status,'timed_out');assert.equal(timeoutRun.result,null);
  await page.locator('[data-script-error]').waitFor();assert.match(await page.locator('#qg-script-detail').innerText(),/已超时/);
  checks.push('service timeout remains terminal in browser and rejects late output; no automatic retry');

  const fuel=await fixture('fuel',{enabled:true,fuel:1});await login(page,fuel);await open();await form('bounded-echo',{text:'fuel fixture'});
  await action(page,'run').click();await waitNotice('已确认运行');await finish(fuel);const fuelRun=(await fuel.call('qg_list_script_runs')).runs[0];
  assert.equal(fuelRun.status,'failed');assert.match(fuelRun.error.code,/FUEL/);await page.locator('[data-script-error]').waitFor();
  assert.match(await page.locator('[data-script-error]').innerText(),/FUEL/);assert.equal(fuelRun.result,null);
  checks.push('fuel exhaustion comes from real Wasmtime with operator-lowered fuel, shown as terminal failure');

  const missing=await fixture('missing',{enabled:true,pythonPath:join(root,'not-installed-python')});await login(page,missing);await open();
  assert.match(await page.locator('#qg-scripts-runtime').innerText(),/运行器不可用/);assert.equal(await action(page,'run').isDisabled(),true);
  assert.equal((await missing.call('qg_list_script_runs')).total,0);checks.push('missing pinned runtime disables manual control with safe explanation');

  // Bundled host resource calls the exact owner MCP methods; browser networking blocked.
  const hostPage=await context.newPage();hostPage.setDefaultTimeout(15000);hostPage.on('pageerror',error=>errors.push(error.message));
  const network=[],hostCalls=[];let hostFixture=enabled;
  await hostPage.exposeFunction('scriptsToolProxy',async request=>{hostCalls.push(request.name);return hostFixture.client.callTool({name:request.name,arguments:request.arguments||{}});});
  await hostPage.goto(enabled.origin+'/health');await hostPage.route('**/*',route=>{network.push(route.request().url());return route.abort('blockedbyclient');});
  await hostPage.setContent('<!doctype html><html><body style="margin:0"></body></html>');
  await hostPage.evaluate(html=>{
    const frame=document.createElement('iframe');frame.id='scripts-host';frame.style.cssText='width:100%;height:940px;border:0';frame.setAttribute('sandbox','allow-scripts allow-same-origin');
    window.addEventListener('message',async event=>{
      if(event.source!==frame.contentWindow||event.data?.jsonrpc!=='2.0'||event.data.id==null)return;
      const request=event.data,reply=result=>event.source.postMessage({jsonrpc:'2.0',id:request.id,result},'*');
      if(request.method==='ui/initialize')reply({protocolVersion:request.params.protocolVersion,hostInfo:{name:'scripts-protocol-simulator',version:'1'},hostCapabilities:{serverTools:{}},hostContext:{theme:'light',platform:'web',displayMode:'inline',availableDisplayModes:['inline']}});
      else if(request.method==='tools/call')reply(await window.scriptsToolProxy(request.params));else reply({});
    });document.body.appendChild(frame);frame.srcdoc=html;
  },await readFile(join(ROOT,'dist/host-app.html'),'utf8'));
  const frame=await (await hostPage.locator('#scripts-host').elementHandle()).contentFrame();await frame.locator('.feed-card').first().waitFor();await open(frame);
  await form('integer-stats',{values:[3,4,5]},frame);await action(frame,'run').click();await waitNotice('已确认运行',frame);await finish(enabled,frame);
  await frame.waitForFunction(()=>document.querySelector('[data-script-result]')?.textContent.includes('12'));
  assert.deepEqual(network,[],'host controls never use browser credentials or network');
  assert.ok(hostCalls.includes('qg_list_scripts')&&hostCalls.includes('qg_run_script')&&hostCalls.includes('qg_get_script_run')&&hostCalls.includes('qg_list_script_runs'));
  checks.push('credential-free MCP host calls same owner service and real Wasmtime; protocol simulation only');
  hostFixture=disabled;await action(frame,'refresh').click();
  await frame.waitForFunction(()=>document.querySelector('#qg-scripts-runtime')?.textContent.includes('脚本执行已停用'));
  assert.equal(await action(frame,'run').isDisabled(),true);const hostRunCalls=hostCalls.filter(name=>name==='qg_run_script').length;
  await frame.evaluate(()=>window.__app.action('scripts-run'));assert.equal(hostCalls.filter(name=>name==='qg_run_script').length,hostRunCalls);
  checks.push('MCP host also renders authoritative disabled state and cannot manually submit');

  assert.deepEqual(errors,[]);assert.deepEqual(routeErrors,[]);
  await writeFile(join(artifacts,'scripts-browser.json'),JSON.stringify({status:'PASS',checks,pageErrors:errors,runtime:'Real pinned wasmtime-py 49.0.0 on Linux',host:'Protocol simulator only, not native-host certification'},null,2));
  console.log('PASS F10 restricted WebAssembly browser: '+checks.join('; '));
}catch(error){console.error('Script browser completed phases:',checks);console.error('Script fixture route errors:',routeErrors);throw error;}
finally{
  closing=true;for(const gate of gates)gate.release();await Promise.all([...gates].map(gate=>gate.remove()));await browser?.close();
  for(const fixture of fixtures){fixture.release?.();await fixture.client.close();fixture.server.closeAllConnections();await new Promise(resolve=>fixture.server.close(resolve));await fixture.service.close();}
  await rm(root,{recursive:true,force:true});
}

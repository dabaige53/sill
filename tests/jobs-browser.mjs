/** F09 registered jobs UI in real Chromium, isolated HTTP/MCP fixtures only.
 * Run: npm run test:jobs-browser (builds the shared host resource first).
 * The scheduler stays disabled; manual test runs use a fake clock and trusted
 * checkpoints. The MCP host is a protocol simulator, not native-host approval. */
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

const directory=await mkdtemp(join(tmpdir(),'qg-jobs-browser-'));
let now=Date.parse('2030-01-01T00:00:00Z'),runGate=null;
const service=new Service(ConfigSchema.parse({dataDir:directory,jobs:{enabled:false}}),{
  jobsClock:{now:()=>now},
  jobsCheckpoint:async stage=>{if(stage==='before-read'&&runGate){const gate=runGate;runGate=null;gate.enter();await gate.hold;}},
});
const attacker='<img src="https://untrusted.invalid/jobs" onerror="window.__JOB_XSS__=true">';
service.ingest({sourceId:'jobs-fixture',items:[{externalId:'one',title:'隔离任务测试 '+attacker,content:'仅用于本地注册任务测试，不连接外部数据。'}]});
const token='jobs-browser-fixture-only-012345678901234567890';
const server=await startHttp(service,{port:0,token}),origin=`http://127.0.0.1:${server.address().port}`;
const client=new Client({name:'jobs-browser-fixture',version:'1'});
const artifacts=join(ROOT,'tests/artifacts');await mkdir(artifacts,{recursive:true});
let browser,page,closing=false;
const errors=[],checks=[],mutations=[],routeErrors=[],requestGates=new Set();
async function rawCall(name,args={}){return client.callTool({name,arguments:args});}
async function call(name,args={}){const result=await rawCall(name,args);assert.notEqual(result.isError,true,JSON.stringify(result));return result.structuredContent;}
const list=()=>call('qg_list_jobs',{limit:100});
const get=id=>call('qg_get_job',{jobId:id,limit:100});
const action=(target,name,id)=>target.locator(`[data-action="jobs-${name}"]${id?`[data-id="${id}"]`:''}`);
const row=(target,id)=>target.locator(`[data-job-id="${id}"]`);
async function open(target=page){
  await target.evaluate(()=>window.__app.openPanel('settings'));
  await target.locator('#qg-jobs-settings').waitFor();
  await target.locator('#qg-jobs-settings').evaluate(node=>{node.open=true;});
  await target.waitForFunction(()=>document.querySelector('#qg-jobs-worker')?.textContent.includes('工作器已停用'));
}
async function form(title,target=page){
  await target.locator('#qg-jobs-create-form').evaluate(node=>{node.open=true;});
  await target.locator('#qg-job-title').fill(title);
  await target.locator('#qg-job-start').fill('2030-01-01T01:00');
  await target.locator('#qg-job-interval').fill('3600');
}
async function created(target=page){await target.waitForFunction(()=>document.querySelector('#qg-jobs-status')?.textContent.includes('任务已创建并保持暂停'));}
function checkpoint(){
  let enter,release;const started=new Promise(resolve=>enter=resolve),hold=new Promise(resolve=>release=resolve);
  return runGate={enter,release,started,hold};
}
async function holdRequest(path,method='GET'){
  let enter,release;const started=new Promise(resolve=>enter=resolve),hold=new Promise(resolve=>release=resolve);let count=0;
  const match=url=>new URL(url).pathname===path;
  const active=new Set();
  const handler=route=>{
    const task=(async()=>{if(route.request().method()!==method)return await route.continue();count++;enter();await hold;return await route.continue();})().catch(error=>{if(!closing)routeErrors.push(`${path} ${method}: ${error.message}`);});
    active.add(task);task.finally(()=>active.delete(task));return task;
  };
  await page.route(match,handler);
  const gate={started,release,count:()=>count,remove:async()=>{await Promise.all([...active]);await page.unroute(match,handler);requestGates.delete(gate);}};
  requestGates.add(gate);return gate;
}
async function eventually(assertion){
  let last;for(let attempt=0;attempt<100;attempt++){try{return await assertion();}catch(error){last=error;await new Promise(resolve=>setTimeout(resolve,30));}}throw last;
}
try{
  await client.connect(new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  const context=await browser.newContext({viewport:{width:1280,height:980},reducedMotion:'reduce'});
  page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/job')&&request.method()!=='GET')mutations.push({url:request.url(),method:request.method(),body:request.postDataJSON()});});
  await page.goto(origin);await page.locator('#qg-token').fill(token);await page.locator('[data-qg-action="login"]').click();await page.locator('.feed-card').first().waitFor();
  await open();assert.equal((await list()).workerEnabled,false);assert.equal((await list()).total,0);
  assert.deepEqual(await page.locator('#qg-job-kind option').evaluateAll(nodes=>nodes.map(node=>node.value)),['recommendation-snapshot','data-quality-digest']);
  assert.equal(mutations.length,0,'opening jobs does not create, run, resume or enable anything');
  checks.push('disabled worker is explicit; page open performs no job writes; fixed operation registry');

  // Creation is explicitly paused, with repeated gestures collapsed in flight.
  await form('只读推荐测试');let gate=await holdRequest('/api/jobs','POST');
  await page.evaluate(()=>{window.__app.action('jobs-create');window.__app.action('jobs-create');});await gate.started;
  assert.equal(gate.count(),1);assert.equal(await action(page,'create').isDisabled(),true);
  gate.release();await created();await gate.remove();
  let snapshot=await list();assert.equal(snapshot.total,1);const first=snapshot.jobs[0];
  assert.equal(first.paused,true);assert.equal(first.nextRunAt,null);assert.equal(first.lastRunId,null);
  assert.deepEqual(first.schedule,{startAt:'2030-01-01T01:00:00.000Z',intervalSeconds:3600});
  await row(page,first.id).waitFor();assert.match(await row(page,first.id).innerText(),/已暂停/);
  checks.push('create-paused only, explicit UTC interval schedule and duplicate-click protection');

  // Lose the create response after the server commits, then retry after reload.
  await form('重试创建保持一次');let lostCreateBody;
  await page.route('**/api/jobs',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    lostCreateBody=route.request().postDataJSON();await route.fetch();await route.abort('failed');
  });
  await action(page,'create').click();await page.waitForFunction(()=>document.querySelector('#qg-jobs-status')?.textContent.includes('创建结果尚未确认'));
  assert.equal((await list()).total,2);await page.unroute('**/api/jobs');
  await page.reload();await page.locator('.feed-card').first().waitFor();await open();
  await page.locator('#qg-jobs-create-form').evaluate(node=>{node.open=true;});
  assert.equal(await page.locator('#qg-job-title').inputValue(),'重试创建保持一次');assert.equal(await page.locator('#qg-job-title').isDisabled(),true);
  assert.equal(await action(page,'create').innerText(),'重试上次创建请求');
  await action(page,'create').click();await created();assert.equal((await list()).total,2);
  assert.deepEqual(mutations.filter(value=>new URL(value.url).pathname==='/api/jobs'&&value.method==='POST').at(-1).body,lostCreateBody);
  const second=(await list()).jobs.find(job=>job.id!==first.id);
  checks.push('lost create response reconciles identical immutable request across reload');

  // Invalid inputs remain editable and never leave the browser.
  await form('校验草稿');await page.locator('#qg-job-interval').fill('59');const beforeInvalid=mutations.length;
  await action(page,'create').click();assert.match(await page.locator('#qg-jobs-status').innerText(),/60–2592000/);assert.equal(mutations.length,beforeInvalid);
  await page.reload();await page.locator('.feed-card').first().waitFor();await open();
  await page.locator('#qg-jobs-create-form').evaluate(node=>{node.open=true;});assert.equal(await page.locator('#qg-job-interval').inputValue(),'59');
  assert.equal((await list()).total,2,'reloading an unsent draft never creates a job');
  checks.push('input validation and reloadable unsent draft do not write');

  // Hold a real operation at its trusted local checkpoint. Lose its HTTP result,
  // reload and repeat the same receipt, then cancel the sole underlying run.
  const held=checkpoint();now+=1000;let runBody;
  await page.route(`**/api/jobs/${first.id}/run`,async route=>{runBody=route.request().postDataJSON();await route.fetch();await route.abort('failed');});
  await page.evaluate(id=>{window.__app.action('jobs-run',id);window.__app.action('jobs-run',id);},first.id);
  await held.started;await page.waitForFunction(()=>document.querySelector('#qg-jobs-status')?.textContent.includes('运行结果尚未确认'));
  assert.equal((await get(first.id)).runs.length,1);assert.equal((await get(first.id)).runs[0].status,'running');
  await page.unroute(`**/api/jobs/${first.id}/run`);await page.reload();await page.locator('.feed-card').first().waitFor();await open();
  await row(page,first.id).waitFor();assert.equal(await action(page,'run',first.id).innerText(),'重试上次运行请求');
  await action(page,'run',first.id).click();await page.waitForFunction(()=>document.querySelector('#qg-jobs-status')?.textContent.includes('已确认运行'));
  assert.deepEqual(mutations.filter(value=>new URL(value.url).pathname.endsWith(`/${first.id}/run`)).at(-1).body,runBody);
  assert.equal((await get(first.id)).runs.length,1);const running=(await get(first.id)).runs[0];
  await action(page,'cancel',running.id).waitFor();await action(page,'cancel',running.id).click();
  await page.waitForFunction(()=>document.querySelector('#qg-jobs-status')?.textContent.includes('已取消'));held.release();await service.jobs.drain();
  assert.equal((await get(first.id)).runs[0].status,'cancelled');assert.equal((await get(first.id)).runs[0].result,null);
  checks.push('manual run while worker disabled; repeated/lost run request stays single across reload; explicit cancellation');

  // A fresh explicit run completes and result history survives navigation/reload.
  now+=1000;await action(page,'run',first.id).click();await service.jobs.drain();
  await action(page,'refresh').click();await page.waitForFunction(()=>document.querySelector('#qg-jobs-history')?.textContent.includes('已完成'));
  const completed=(await get(first.id)).runs.find(run=>run.status==='completed');assert.ok(completed?.result);
  await page.locator(`[data-job-result="${completed.id}"]`).evaluate(node=>{node.open=true;});
  assert.equal(await page.locator('#qg-jobs-history img').count(),0);assert.equal(await page.evaluate(()=>window.__JOB_XSS__),undefined);
  await page.reload();await page.locator('.feed-card').first().waitFor();await open();await row(page,first.id).waitFor();await action(page,'history',first.id).click();
  await page.locator(`[data-job-result="${completed.id}"]`).waitFor();
  assert.equal((await get(first.id)).job.paused,true,'manual runs do not resume schedule');
  checks.push('bounded escaped results and durable history reload; manual run preserves paused schedule');

  // Resume is an explicit CAS action. The worker remains disabled throughout.
  await action(page,'resume',first.id).click();await eventually(async()=>assert.equal((await get(first.id)).job.paused,false));
  await action(page,'pause',first.id).waitFor();await action(page,'pause',first.id).click();await eventually(async()=>assert.equal((await get(first.id)).job.paused,true));
  assert.equal((await list()).workerEnabled,false);
  const beforeConflict=(await get(first.id)).job;gate=await holdRequest(`/api/jobs/${first.id}`,'PATCH');
  await action(page,'resume',first.id).click();await gate.started;
  await call('qg_update_job',{jobId:first.id,set:{title:'另一入口已修改'},expectedRevision:beforeConflict.revision});
  gate.release();await page.waitForFunction(()=>document.querySelector('#qg-jobs-status')?.textContent.includes('另一处更新'));await gate.remove();
  assert.equal(gate.count(),1,'CAS conflict never automatically retries the mutation');
  assert.equal((await get(first.id)).job.paused,true);await page.getByText('另一入口已修改',{exact:true}).first().waitFor();
  checks.push('explicit pause/resume and cross-entry CAS recovery without automatic retry');

  // A slow history read cannot reopen settings or replace a newer selected job.
  gate=await holdRequest(`/api/jobs/${first.id}`);await action(page,'history',first.id).click();await gate.started;
  await page.evaluate(()=>window.__app.openPanel('filter'));gate.release();await gate.remove();
  await page.evaluate(()=>new Promise(requestAnimationFrame));assert.equal(await page.evaluate(()=>window.__app.modalKind),'filter');assert.equal(await page.locator('#qg-jobs-settings').count(),0);
  await open();await row(page,second.id).waitFor();gate=await holdRequest(`/api/jobs/${first.id}`);
  await action(page,'history',first.id).click();await gate.started;await action(page,'history',second.id).click();
  await page.waitForFunction(()=>document.querySelector('#qg-jobs-history h3')?.textContent.includes('重试创建保持一次'));
  gate.release();await gate.remove();await page.evaluate(()=>new Promise(requestAnimationFrame));
  assert.match(await page.locator('#qg-jobs-history h3').innerText(),/重试创建保持一次/);
  checks.push('late history responses cannot replace newer navigation or selection');

  // Offline reads leave saved state intact; reconnection never triggers a write.
  const beforeOffline=mutations.length;await page.route('**/api/jobs?*',route=>route.abort('internetdisconnected'));
  await action(page,'refresh').click();await page.waitForFunction(()=>document.querySelector('#qg-jobs-status')?.textContent.includes('暂时无法读取'));
  await page.unroute('**/api/jobs?*');await action(page,'refresh').click();await row(page,first.id).waitFor();
  assert.equal(mutations.length,beforeOffline);checks.push('offline/read errors recover without background writes');

  // Server history and UI pagination are bounded, using only explicit test runs.
  for(let i=0;i<11;i++){now+=1000;await call('qg_run_job',{jobId:second.id,idempotencyKey:`browser-history-${i}`});await service.jobs.drain();}
  await action(page,'history',second.id).click();await page.waitForFunction(()=>document.querySelectorAll('[data-job-run-id]').length===10);
  await action(page,'history-next').click();await page.waitForFunction(()=>document.querySelectorAll('[data-job-run-id]').length===1);
  await action(page,'history-previous').click();await page.waitForFunction(()=>document.querySelectorAll('[data-job-run-id]').length===10);
  checks.push('history pagination renders at most ten runs per page');

  await page.locator('#qg-jobs-create-form').evaluate(node=>{node.open=false;});
  await page.locator('#qg-jobs-settings').scrollIntoViewIfNeeded();await page.screenshot({path:join(artifacts,'jobs-desktop.png')});
  await page.setViewportSize({width:390,height:844});await page.locator('#qg-jobs-settings').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'mobile jobs controls stay within viewport');
  await page.screenshot({path:join(artifacts,'jobs-mobile.png')});checks.push('390px mobile settings snapshot without overflow');

  const failedPage=await context.newPage();failedPage.on('pageerror',error=>errors.push(error.message));await failedPage.route('**/web/jobs.js',route=>route.abort('failed'));
  await failedPage.goto(origin);await failedPage.locator('.feed-card').first().waitFor();assert.equal(await failedPage.evaluate(()=>!!window.__app),true);await failedPage.close();
  checks.push('optional jobs module failure never blocks feed');

  // Same owner service through the real MCP bridge; all iframe network denied.
  const hostPage=await context.newPage();hostPage.setDefaultTimeout(12000);hostPage.on('pageerror',error=>errors.push(error.message));
  const network=[],hostCalls=[];
  await hostPage.exposeFunction('jobsToolProxy',async request=>{hostCalls.push(request.name);return rawCall(request.name,request.arguments||{});});
  await hostPage.goto(origin+'/health');await hostPage.route('**/*',route=>{network.push(route.request().url());return route.abort('blockedbyclient');});
  await hostPage.setContent('<!doctype html><html><body style="margin:0"></body></html>');
  await hostPage.evaluate(html=>{
    const frame=document.createElement('iframe');frame.id='jobs-host';frame.style.cssText='width:100%;height:940px;border:0';frame.setAttribute('sandbox','allow-scripts allow-same-origin');
    window.addEventListener('message',async event=>{
      if(event.source!==frame.contentWindow||event.data?.jsonrpc!=='2.0'||event.data.id==null)return;
      const request=event.data,reply=result=>event.source.postMessage({jsonrpc:'2.0',id:request.id,result},'*');
      if(request.method==='ui/initialize')reply({protocolVersion:request.params.protocolVersion,hostInfo:{name:'jobs-protocol-simulator',version:'1'},hostCapabilities:{serverTools:{}},hostContext:{theme:'light',platform:'web',displayMode:'inline',availableDisplayModes:['inline']}});
      else if(request.method==='tools/call')reply(await window.jobsToolProxy(request.params));else reply({});
    });document.body.appendChild(frame);frame.srcdoc=html;
  },await readFile(join(ROOT,'dist/host-app.html'),'utf8'));
  const frame=await (await hostPage.locator('#jobs-host').elementHandle()).contentFrame();await frame.locator('.feed-card').first().waitFor();await open(frame);
  assert.equal(await frame.locator('[data-job-id]').count(),2);await form('宿主只读摘要',frame);await frame.locator('#qg-job-kind').selectOption('data-quality-digest');
  await action(frame,'create').click();await created(frame);const hostJob=(await list()).jobs.find(job=>job.title==='宿主只读摘要');assert.ok(hostJob);assert.equal(hostJob.paused,true);
  now+=1000;await row(frame,hostJob.id).waitFor();await action(frame,'run',hostJob.id).click();await service.jobs.drain();
  await action(frame,'refresh').click();await frame.waitForFunction(()=>document.querySelector('#qg-jobs-history')?.textContent.includes('已完成'));
  assert.ok((await get(hostJob.id)).runs[0].result);assert.equal((await list()).workerEnabled,false);
  assert.deepEqual(network,[],'host jobs require no browser network or credentials');
  assert.ok(hostCalls.includes('qg_create_job')&&hostCalls.includes('qg_run_job')&&hostCalls.includes('qg_get_job'));
  checks.push('credential-free MCP host create/run/history uses same owner service and fixed operations');
  assert.deepEqual(errors,[]);assert.deepEqual(routeErrors,[]);
  await writeFile(join(artifacts,'jobs-browser.json'),JSON.stringify({status:'PASS',checks,pageErrors:errors,workerEnabled:false,host:'Protocol simulator only, not native-host certification'},null,2));
  console.log('PASS F09 registered jobs browser: '+checks.join('; '));
}catch(error){
  console.error('Jobs browser completed phases:',checks);console.error('Jobs fixture route errors:',routeErrors);throw error;
}finally{
  closing=true;for(const gate of requestGates)gate.release();await Promise.all([...requestGates].map(gate=>gate.remove()));
  runGate?.release();await browser?.close();await client.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await service.close();await rm(directory,{recursive:true,force:true});
}

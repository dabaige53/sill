/** F11 browser verification: real isolated HTTP/MCP services and synthetic data.
 * Run: npm run build:host && node tests/backups-browser.mjs
 * Host frame is a protocol simulator, never native-host/file-integration certification. */
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

const directory=await mkdtemp(join(tmpdir(),'qg-backups-browser-')),artifacts=join(ROOT,'tests/artifacts');
await mkdir(artifacts,{recursive:true});
const token='backups-browser-synthetic-only-012345678901234567890';
const fixtures=[],checks=[],errors=[],mutations=[],routeErrors=[],gates=new Set();
const storageKey='sill-backup-draft-v1:web';
let browser,page,closing=false;
async function fixture(name,{source=false}={}){
  const access={principals:[{id:'backup-reader',enabled:true,tokenEnv:'QG_BACKUP_FIXTURE_UNUSED',tools:['qg_search','qg_get_card','qg_read_annotation'],resources:{sourceIds:['backup-source','local-notes']}}]};
  const service=new Service(ConfigSchema.parse({dataDir:join(directory,name),access}));
  const cardId=service.ingest({sourceId:'backup-source',items:[{externalId:'common',title:source?'备份中的标题':'恢复前的标题',content:source?'备份中的正文 <img src="https://untrusted.invalid/backup" onerror="window.__BACKUP_XSS__=1">':'恢复前的正文'}]}).cardIds[0];
  service.updateAnnotation({cardId,set:{note:source?'备份备注':'原有备注',tags:[source?'备份':'原有']},expectedRevision:0});
  service.updateSettings({set:{sort:source?'time':'unread',recommendation:{interests:[source?'导入偏好':'原有偏好'],sourcePriorities:{},excludedSourceIds:[],includeRead:false}},expectedRevision:0});
  const newCard=source?service.createNote({title:'备份新增笔记',content:'仅存在于隔离测试源的笔记',tags:[],idempotencyKey:'source-note'}):null;
  const server=await startHttp(service,{port:0,token}),origin=`http://127.0.0.1:${server.address().port}`,client=new Client({name:'backups-browser-fixture',version:'1'});
  await client.connect(new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
  const raw=(name,args={})=>client.callTool({name,arguments:args});
  const call=async(name,args={})=>{const value=await raw(name,args);assert.notEqual(value.isError,true,JSON.stringify(value));return value.structuredContent;};
  const value={service,server,client,origin,cardId,newCard,call,raw};fixtures.push(value);return value;
}
const action=(target,name)=>target.locator(`[data-action="backups-${name}"]`);
async function login(target,fixture){await target.goto(fixture.origin);if(await target.locator('#qg-token').count()){await target.locator('#qg-token').fill(token);await target.locator('[data-qg-action="login"]').click();}await target.locator('.feed-card').first().waitFor();}
async function open(target=page){await target.evaluate(()=>window.__app.openPanel('settings'));await target.locator('#qg-backups-settings').waitFor();await target.locator('#qg-backups-settings').evaluate(node=>{node.open=true;});}
async function notice(pattern,target=page){await target.waitForFunction(pattern=>new RegExp(pattern).test(document.querySelector('#qg-backups-status')?.textContent||''),pattern);}
async function fill(value,target=page){await target.locator('#qg-backup-json').fill(typeof value==='string'?value:JSON.stringify(value));}
async function preview(target=page){await action(target,'preview').click();await target.waitForFunction(()=>document.querySelector('#qg-backup-preview')?.textContent.includes('预览已校验'));}
async function acknowledge(target=page){if(await target.locator('#qg-backup-visibility').isVisible())await target.locator('#qg-backup-visibility').check();}
async function hold(path,{after=false}={}){
  let entered,release;const started=new Promise(resolve=>entered=resolve),held=new Promise(resolve=>release=resolve);let count=0;
  const match=url=>new URL(url).pathname===path,active=new Set();
  const handler=route=>{const task=(async()=>{if(route.request().method()!=='POST')return route.continue();count++;const response=after?await route.fetch():null;entered();await held;return response?route.fulfill({response}):route.continue();})().catch(error=>{if(!closing)routeErrors.push(`${path}: ${error.message}`);});active.add(task);task.finally(()=>active.delete(task));return task;};
  await page.route(match,handler);const gate={started,release,count:()=>count,remove:async()=>{await Promise.all([...active]);await page.unroute(match,handler);gates.delete(gate);}};gates.add(gate);return gate;
}
try{
  const source=await fixture('source',{source:true}),destination=await fixture('destination'),backup=await source.call('qg_export_content_backup');
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  const context=await browser.newContext({viewport:{width:1280,height:980},reducedMotion:'reduce',acceptDownloads:true});
  page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/backups'))mutations.push({path:new URL(request.url()).pathname,method:request.method(),body:request.method()==='POST'?request.postDataJSON():null});});
  await login(page,destination);await open();assert.equal(mutations.length,0);
  assert.match(await page.locator('#qg-backups-settings').innerText(),/内容与设置备份（不含对话\/运行记录）/);
  assert.match(await page.locator('#qg-backups-settings').innerText(),/未加密|用户正文可能包含/);
  assert.match(await page.locator('#qg-backup-undo-caveat').innerText(),/新增卡片仍会保留/);
  await action(page,'export').click();await notice('导出已准备');const exported=JSON.parse(await page.locator('#qg-backup-export-text').inputValue());
  assert.equal(exported.format,'sill-content-backup');assert.equal(JSON.stringify(exported).includes(token),false);
  const downloadEvent=page.waitForEvent('download');await action(page,'download').click();const download=await downloadEvent;
  assert.equal(download.suggestedFilename(),'sill-content-backup.json');assert.deepEqual(JSON.parse(await readFile(await download.path(),'utf8')),exported);
  checks.push('explicit bounded export and actual Chromium JSON download; private plaintext scope/exclusions and manual host fallback explained');

  const beforeFile=mutations.length;
  await page.locator('#qg-backup-file').setInputFiles({name:'oversize.json',mimeType:'application/json',buffer:Buffer.alloc(256*1024+1,32)});await notice('文件超过 256 KiB');
  assert.equal(mutations.length,beforeFile);
  for(const invalid of ['null','[]','"not an envelope"','{']){await fill(invalid);await action(page,'preview').click();await notice('JSON');assert.equal(mutations.length,beforeFile);}
  await page.reload();await page.locator('.feed-card').first().waitFor();await open();assert.equal(await page.locator('#qg-backup-json').inputValue(),'{');assert.equal(mutations.length,beforeFile);
  await page.locator('#qg-backup-file').setInputFiles({name:'content.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await notice('文件已载入');
  assert.deepEqual(JSON.parse(await page.locator('#qg-backup-json').inputValue()),backup);assert.equal(mutations.length,beforeFile);
  const broken=structuredClone(backup);broken.payload.cards[0].title+=' checksum mismatch';await fill(broken);await action(page,'preview').click();await notice('预览未完成');
  assert.equal(await action(page,'commit').isDisabled(),true);assert.equal(destination.service.storedCard(destination.cardId).title,'恢复前的标题');
  checks.push('file byte rejection before parse, object-only JSON, invalid checksum fail closed; opening/file selection/reload never preview or commit');

  // An existing preference draft must survive a backup settings replacement.
  await page.locator('#qg-recommendation-settings').evaluate(node=>{node.open=true;});await page.locator('#qg-recommendation-interests').fill('未提交的浏览器偏好草稿');
  await fill(backup);await preview();assert.match(await page.locator('#qg-backup-preview').innerText(),/冲突/);assert.equal(await action(page,'commit').isDisabled(),true);
  const beforeRejected=mutations.length;await page.evaluate(()=>window.__app.action('backups-commit'));assert.equal(mutations.length,beforeRejected);
  await page.locator('#qg-backup-mode').selectOption('overwrite');assert.equal(await action(page,'commit').isDisabled(),true);await preview();
  assert.match(await page.locator('#qg-backup-preview').innerText(),/backup-reader|backup-source|local-notes/);assert.equal(await action(page,'commit').isDisabled(),true);await acknowledge();assert.equal(await action(page,'commit').isDisabled(),false);
  await fill(' '+JSON.stringify(backup));assert.equal(await action(page,'commit').isDisabled(),true);
  let gate=await hold('/api/backups/preview');await action(page,'preview').click();await gate.started;await fill(JSON.stringify(backup)+' ');gate.release();await gate.remove();
  await page.waitForFunction(()=>!document.querySelector('[data-action="backups-preview"]').disabled);assert.equal(await page.locator('#qg-backup-preview').innerText(),'');
  gate=await hold('/api/backups/preview');await action(page,'preview').click();await gate.started;await page.evaluate(()=>window.__app.openPanel('filter'));gate.release();await gate.remove();
  assert.equal(await page.evaluate(()=>window.__app.modalKind),'filter');await open();assert.equal(await action(page,'commit').isDisabled(),true);
  checks.push('additive conflicts reject entire operation; overwrite requires new preview and visibility acknowledgment; edits/navigation invalidate delayed previews');

  await preview();await acknowledge();
  await page.locator('#qg-backup-preview').evaluate(node=>node.scrollIntoView({block:'start'}));
  await page.screenshot({path:join(artifacts,'backups-preview-desktop.png')});
  gate=await hold('/api/backups/commit');
  await page.evaluate(()=>{window.__app.action('backups-commit');window.__app.action('backups-commit');});await gate.started;assert.equal(gate.count(),1);
  const attempted=mutations.at(-1).body,cached=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),storageKey);assert.deepEqual(cached.pending.request,attempted);
  assert.equal(await page.locator('#qg-backup-json').isDisabled(),true);gate.release();await notice('已确认恢复');await gate.remove();
  assert.equal(destination.service.storedCard(destination.cardId).title,'备份中的标题');assert.ok(destination.service.storedCard(source.newCard.id));
  assert.equal((await destination.call('qg_read_annotation',{cardId:destination.cardId})).values.note,'备份备注');
  await page.waitForFunction(()=>document.querySelector('#qg-recommendation-saved')?.textContent.includes('导入偏好'));
  assert.equal(await page.locator('#qg-recommendation-interests').inputValue(),'未提交的浏览器偏好草稿');assert.equal(await page.evaluate(()=>window.__BACKUP_XSS__),undefined);
  await page.locator('#qg-backup-result').evaluate(node=>node.scrollIntoView({block:'center'}));
  await page.screenshot({path:join(artifacts,'backups-result-desktop.png')});
  await action(page,'undo').click();await notice('已确认撤销覆盖');
  assert.equal(destination.service.storedCard(destination.cardId).title,'恢复前的标题');assert.ok(destination.service.storedCard(source.newCard.id),'immediate guarded undo never removes newly added cards');
  assert.equal((await destination.call('qg_read_annotation',{cardId:destination.cardId})).values.note,'原有备注');
  checks.push('duplicate commit submits once after durable attempt save; actual all-or-nothing restore and guarded undo preserve new cards and unsent preference draft');

  // Real accepted commit with a deliberately lost browser response.
  await preview();await acknowledge();let lost;
  await page.route('**/api/backups/commit',async route=>{lost=route.request().postDataJSON();await route.fetch();await route.abort('failed');});
  await action(page,'commit').click();await notice('恢复结果尚未确认');assert.equal(destination.service.storedCard(destination.cardId).title,'备份中的标题');
  await page.unroute('**/api/backups/commit');await page.reload();await page.locator('.feed-card').first().waitFor();await open();
  assert.equal(await action(page,'commit').innerText(),'重试原恢复请求');assert.equal(await page.locator('#qg-backup-json').isDisabled(),true);
  const beforeRetry=mutations.length;await page.waitForTimeout(2800);assert.equal(mutations.length,beforeRetry,'periodic refresh must never call backup endpoints');
  await page.route('**/api/backups/commit',route=>route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({code:'INVALID_INPUT',message:'合成重试前置错误'})}));
  await action(page,'commit').click();await notice('恢复结果尚未确认');assert.equal(await page.locator('#qg-backup-json').isDisabled(),true);
  await page.unroute('**/api/backups/commit');await action(page,'commit').click();await notice('已确认恢复');
  assert.deepEqual(mutations.filter(row=>row.path==='/api/backups/commit').at(-1).body,lost);
  await action(page,'status').click();await notice('已查询确认恢复状态');
  await destination.call('qg_create_note',{title:'恢复后的另一笔写入',content:'阻止旧版本撤销',idempotencyKey:'later-note'});
  await action(page,'undo').click();await notice('撤销被保护条件阻止');assert.equal(await action(page,'undo').isDisabled(),true);
  assert.equal(destination.service.storedCard(destination.cardId).title,'备份中的标题');assert.ok(destination.service.storedCard(source.newCard.id));
  checks.push('lost accepted response survives reload, never auto-replays and retains exact key through retry errors; explicit status and later-write guard prevent forced undo');

  // An offline request that never arrived can be released after an authoritative
  // exact-key retry rejects the now-stale plan (durable replay is checked first).
  await preview();await acknowledge();await page.route('**/api/backups/commit',route=>route.abort('internetdisconnected'));
  await action(page,'commit').click();await notice('恢复结果尚未确认');const neverArrived=mutations.at(-1).body;
  await page.unroute('**/api/backups/commit');await destination.call('qg_create_note',{title:'离线期间的写入',content:'精确重试应拒绝旧计划',idempotencyKey:'offline-later-write'});
  await page.reload();await page.locator('.feed-card').first().waitFor();await open();await action(page,'commit').click();await notice('恢复未提交');
  assert.deepEqual(mutations.filter(row=>row.path==='/api/backups/commit').at(-1).body,neverArrived);assert.equal(await page.locator('#qg-backup-json').isDisabled(),false);assert.equal(await action(page,'commit').isDisabled(),true);
  checks.push('offline never-arrived commit is unlocked after exact-key authoritative stale rejection, retaining the draft for explicit re-preview');

  // Stale plan cannot silently refresh/reapply; preserve draft for a new decision.
  await preview();await acknowledge();await destination.call('qg_create_note',{title:'预览后的另一写入',content:'旧计划必须失效',idempotencyKey:'stale-plan-note'});
  await action(page,'commit').click();await notice('恢复未提交');assert.equal(await action(page,'commit').isDisabled(),true);assert.ok((await page.locator('#qg-backup-json').inputValue()).includes('sill-content-backup'));
  await page.route('**/api/backups/preview',route=>route.abort('internetdisconnected'));await action(page,'preview').click();await notice('预览未完成');await page.unroute('**/api/backups/preview');
  const beforeReconnect=mutations.length;await page.reload();await page.locator('.feed-card').first().waitFor();await open();assert.equal(mutations.length,beforeReconnect);
  await preview();await acknowledge();gate=await hold('/api/backups/commit',{after:true});await action(page,'commit').click();await gate.started;
  await page.evaluate(()=>window.__app.openPanel('filter'));gate.release();await gate.remove();assert.equal(await page.evaluate(()=>window.__app.modalKind),'filter');
  await open();await notice('已确认恢复');
  checks.push('stale conflict/offline draft recovery requires explicit new preview; late committed response cannot reopen or replace a newer panel');

  await page.setViewportSize({width:390,height:844});await page.locator('#qg-backups-settings > summary').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.screenshot({path:join(artifacts,'backups-mobile.png')});
  await page.locator('#qg-backup-result').evaluate(node=>node.scrollIntoView({block:'center'}));
  await page.screenshot({path:join(artifacts,'backups-actions-mobile.png')});
  await page.setViewportSize({width:1280,height:980});await page.screenshot({path:join(artifacts,'backups-desktop.png')});
  const failed=await context.newPage();failed.on('pageerror',error=>errors.push(error.message));await failed.route('**/web/backups.js',route=>route.abort('failed'));
  await failed.goto(destination.origin);await failed.locator('.feed-card').first().waitFor();await failed.close();checks.push('mobile no-overflow and optional backup module failure leaves feed usable');

  const hostFixture=await fixture('host-destination'),hostCalls=[],hostPage=await context.newPage();hostPage.setDefaultTimeout(15000);hostPage.on('pageerror',error=>errors.push(error.message));
  await hostPage.exposeFunction('backupToolProxy',async request=>{hostCalls.push(request.name);return hostFixture.raw(request.name,request.arguments||{});});
  await hostPage.goto(destination.origin+'/health');const network=[];await hostPage.route('**/*',route=>{network.push(route.request().url());return route.abort('blockedbyclient');});
  await hostPage.setContent('<!doctype html><html><body style="margin:0"></body></html>');
  await hostPage.evaluate(html=>{
    const frame=document.createElement('iframe');frame.id='backup-host';frame.style.cssText='width:100%;height:960px;border:0';frame.setAttribute('sandbox','allow-scripts allow-same-origin');
    window.addEventListener('message',async event=>{
      if(event.source!==frame.contentWindow||event.data?.jsonrpc!=='2.0'||event.data.id==null)return;
      const request=event.data,reply=result=>event.source.postMessage({jsonrpc:'2.0',id:request.id,result},'*');
      if(request.method==='ui/initialize')reply({protocolVersion:request.params.protocolVersion,hostInfo:{name:'backup-protocol-simulator',version:'1'},hostCapabilities:{serverTools:{}},hostContext:{theme:'light',platform:'web',displayMode:'inline',availableDisplayModes:['inline']}});
      else if(request.method==='tools/call')reply(await window.backupToolProxy(request.params));else reply({});
    });document.body.appendChild(frame);frame.srcdoc=html;
  },await readFile(join(ROOT,'dist/host-app.html'),'utf8'));
  const frame=await (await hostPage.locator('#backup-host').elementHandle()).contentFrame();await frame.locator('.feed-card').first().waitFor();await open(frame);
  const callsBefore=hostCalls.filter(name=>name.includes('backup')||name.includes('restore')).length;await fill(backup,frame);assert.equal(hostCalls.filter(name=>name.includes('backup')||name.includes('restore')).length,callsBefore);
  await action(frame,'export').click();await notice('导出已准备',frame);assert.equal(JSON.parse(await frame.locator('#qg-backup-export-text').inputValue()).format,'sill-content-backup');
  assert.match(await frame.locator('#qg-backup-export').innerText(),/原生宿主文件能力尚未验证/);
  await frame.locator('#qg-backup-mode').selectOption('overwrite');await preview(frame);await acknowledge(frame);await action(frame,'commit').click();await notice('已确认恢复',frame);
  assert.equal(hostFixture.service.storedCard(hostFixture.cardId).title,'备份中的标题');await action(frame,'status').click();await notice('已查询确认恢复状态',frame);
  await action(frame,'undo').click();await notice('已确认撤销覆盖',frame);assert.equal(hostFixture.service.storedCard(hostFixture.cardId).title,'恢复前的标题');assert.ok(hostFixture.service.storedCard(source.newCard.id));
  for(const name of ['qg_export_content_backup','qg_preview_content_restore','qg_commit_content_restore','qg_get_content_restore','qg_undo_content_restore'])assert.ok(hostCalls.includes(name),name);
  assert.deepEqual(network,[],'host backup path uses MCP without browser network or credentials');checks.push('all five owner backup tools in credential-free MCP host simulator; paste/manual-copy path works, native-host file integration remains unverified');
  assert.deepEqual(errors,[]);assert.deepEqual(routeErrors,[]);
  await writeFile(join(artifacts,'backups-browser.json'),JSON.stringify({status:'PASS',checks,pageErrors:errors,host:'MCP protocol simulator only; native host and host file capabilities unverified'},null,2));
  console.log('PASS F11 content backup browser: '+checks.join('; '));
}catch(error){console.error('Backup browser completed phases:',checks);console.error('Fixture route errors:',routeErrors);throw error;}
finally{
  closing=true;for(const gate of gates)gate.release();await Promise.all([...gates].map(gate=>gate.remove()));await browser?.close();
  for(const fixture of fixtures){await fixture.client.close();fixture.server.closeAllConnections();await new Promise(resolve=>fixture.server.close(resolve));await fixture.service.close();}
  await rm(directory,{recursive:true,force:true});
}

/** One isolated real-browser journey for local notes and source-safe annotations. */
import assert from 'node:assert/strict';
import { mkdtemp,rm,mkdir,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ConfigSchema,ROOT } from '../server/config.mjs';
import { Service } from '../server/service.mjs';
import { startHttp } from '../server/http.mjs';

const directory=await mkdtemp(join(tmpdir(),'qg-content-browser-'));
const service=new Service(ConfigSchema.parse({dataDir:directory}));
const source=service.ingest({sourceId:'upstream',items:[{externalId:'one',title:'保留来源的原始笔记',content:'上游原始正文不得被本地编辑覆盖',tags:['来源标签'],url:'https://example.com/original'}]}).cardIds[0];
const token='local-content-test-only-012345678901234567890';
const server=await startHttp(service,{port:0,token}),origin=`http://127.0.0.1:${server.address().port}`;
const client=new Client({name:'content-browser-test',version:'1'});
const artifacts=join(ROOT,'tests/artifacts');await mkdir(artifacts,{recursive:true});
let browser;
async function call(name,args={}){const response=await client.callTool({name,arguments:args});assert.notEqual(response.isError,true,JSON.stringify(response));return response.structuredContent;}
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
  await call('qg_update_annotation',{cardId:source,set:{note:'服务中已有的备注',tags:['个人标签']},expectedRevision:0});
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(source=>{
    if(!localStorage.getItem('content-test-seeded')){
      localStorage.setItem('quiet-glass-live-v1',JSON.stringify({version:2,items:{[source]:{note:'旧版浏览器的备注',tags:['旧标签'],tagsEdited:true}}}));
      localStorage.setItem('content-test-seeded','1');
    }
  },source);
  await page.goto(origin);await page.locator('#qg-token').fill(token);await page.locator('[data-qg-action="login"]').click();await page.locator('.feed-card').waitFor();
  assert.equal(await page.evaluate(id=>window.__quietGlass.store.item(id).note,source),'服务中已有的备注');
  assert.equal((await call('qg_read_annotation',{cardId:source})).revision,1,'legacy browser state is never uploaded automatically');
  await page.evaluate(id=>window.__app.openPanel('editor',id),source);
  await page.locator('#note-editor').fill('保留的网页草稿');
  await call('qg_update_annotation',{cardId:source,set:{note:'另一入口的新备注'},expectedRevision:1});
  await page.locator('[data-action="save-note"]').click();await page.locator('[data-action="annotation-retry"]').waitFor();
  assert.equal(await page.locator('#note-editor').inputValue(),'保留的网页草稿');
  await page.reload();await page.locator('.feed-card').waitFor();await page.evaluate(id=>window.__app.openPanel('editor',id),source);
  await page.locator('#note-editor').waitFor();assert.equal(await page.locator('#note-editor').inputValue(),'保留的网页草稿','conflicting draft survives reload');
  await page.locator('[data-action="save-note"]').click();await page.locator('[data-action="annotation-retry"]').click();
  await page.waitForFunction(id=>window.__quietGlass.store.item(id).note==='保留的网页草稿',source);
  assert.equal((await call('qg_read_annotation',{cardId:source})).values.note,'保留的网页草稿');
  await page.evaluate(id=>window.__app.openPanel('editor',id),source);await page.locator('[data-action="annotation-import"]').click();
  assert.equal(await page.locator('#note-editor').inputValue(),'旧版浏览器的备注');
  assert.equal((await call('qg_read_annotation',{cardId:source})).values.note,'保留的网页草稿','import only changes the local draft');
  await page.locator('[data-action="save-note"]').click();
  await page.waitForFunction(id=>window.__quietGlass.store.item(id).note==='旧版浏览器的备注',source);
  const original=await call('qg_get_card',{cardId:source});
  assert.equal(original.content,'上游原始正文不得被本地编辑覆盖');assert.deepEqual(original.tags,['来源标签']);assert.equal(original.url,'https://example.com/original');
  assert.deepEqual(original.annotation.values.tags,['旧标签']);
  await page.evaluate(id=>window.__app.openPanel('editor',id),source);
  await page.locator('#note-editor').fill('注释提交版本 A');
  let releaseAnnotation,annotationStarted;const annotationReady=new Promise(resolve=>annotationStarted=resolve);
  await page.route(`**/api/cards/${source}/annotation`,async route=>{
    if(route.request().method()!=='PATCH')return route.continue();
    const response=await route.fetch();annotationStarted();await new Promise(resolve=>releaseAnnotation=resolve);await route.fulfill({response});
  });
  await page.locator('[data-action="save-note"]').click();await annotationReady;
  await page.locator('#note-editor').fill('提交后继续输入的注释 B');releaseAnnotation();
  await page.waitForFunction(()=>document.getElementById('toast-text').textContent.includes('之后的编辑仍在草稿'));
  assert.equal(await page.locator('#note-editor').inputValue(),'提交后继续输入的注释 B');
  assert.equal((await call('qg_read_annotation',{cardId:source})).values.note,'注释提交版本 A');
  await page.unroute(`**/api/cards/${source}/annotation`);
  await page.locator('[data-action="save-note"]').click();
  await page.waitForFunction(id=>window.__quietGlass.store.item(id).note==='提交后继续输入的注释 B',source);
  await page.evaluate(()=>window.__app.openPanel('settings'));await page.locator('[data-action="local-note-new"]').click();
  await page.locator('[data-action="local-note-save"]').click();
  await page.waitForFunction(()=>document.getElementById('toast-text').textContent.includes('笔记未保存'));
  assert.equal(service.store.list('card').filter(card=>card.local).length,0,'invalid draft cannot create a note');
  await page.locator('#local-note-title').fill('第一张本地笔记');await page.locator('#local-note-content').fill('由网页创建的本地正文');await page.locator('#local-note-tags').fill('想法，项目');
  // Lose the response after the service commits. Repeated save must reuse the key.
  let dropped=false;
  await page.route('**/api/notes',async route=>{
    if(route.request().method()==='POST'&&!dropped){dropped=true;await route.fetch();return route.abort();}
    return route.continue();
  });
  await page.locator('[data-action="local-note-save"]').click();
  await page.waitForFunction(()=>document.getElementById('toast-text').textContent.includes('笔记未保存'));
  assert.equal(service.store.list('card').filter(card=>card.local).length,1);
  await page.locator('#local-note-content').fill('响应丢失后继续修改的正文');
  await page.reload();await page.locator('.feed-card').first().waitFor();
  await page.evaluate(()=>window.__app.openPanel('settings'));await page.locator('[data-action="local-note-new"]').click();
  assert.equal(await page.locator('#local-note-content').inputValue(),'响应丢失后继续修改的正文');
  await page.locator('[data-action="local-note-save"]').click();
  await page.waitForFunction(()=>document.getElementById('toast-text').textContent.includes('之后的编辑仍在草稿'));
  assert.equal(await page.locator('#local-note-content').inputValue(),'响应丢失后继续修改的正文');
  assert.equal(service.store.list('card').filter(card=>card.local).length,1);
  await page.locator('[data-action="local-note-save"]').click();
  await page.getByRole('button',{name:'第一张本地笔记',exact:true}).waitFor();await page.unroute('**/api/notes');
  assert.equal(service.store.list('card').filter(card=>card.local).length,1,'retry after unknown response creates no duplicate');
  const local=service.store.list('card').find(card=>card.local);
  assert.equal(local.content,'响应丢失后继续修改的正文');assert.deepEqual(local.tags,['想法','项目']);
  await page.locator(`[data-card="${local.id}"] .card-title-button`).click();await page.locator('[data-action="local-note-edit"]').click();
  await page.locator('#local-note-content').fill('暂存的本地笔记编辑');
  await call('qg_update_note',{cardId:local.id,set:{title:'MCP 修改的标题'},expectedRevision:local.revision});
  await page.locator('[data-action="local-note-save"]').click();await page.locator('[data-action="local-note-retry"]').waitFor();
  assert.equal(await page.locator('#local-note-content').inputValue(),'暂存的本地笔记编辑');
  await page.locator('[data-action="local-note-latest"]').click();
  await page.waitForFunction(()=>document.getElementById('local-note-title').value==='MCP 修改的标题');
  assert.equal(await page.locator('#local-note-content').inputValue(),'响应丢失后继续修改的正文');
  await page.locator('#local-note-content').fill('确认后的本地正文');await page.locator('[data-action="local-note-save"]').click();
  await page.waitForFunction(()=>document.getElementById('toast-text').textContent==='本地笔记已保存');
  const edited=await call('qg_get_card',{cardId:local.id});assert.equal(edited.revision,local.revision+2);assert.equal(edited.content,'确认后的本地正文');
  await page.evaluate(()=>window.__app.navigate('#feed'));
  await call('qg_update_note',{cardId:local.id,set:{title:'跨入口同步后的笔记'},expectedRevision:edited.revision});
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByRole('button',{name:'跨入口同步后的笔记',exact:true}).waitFor();
  await page.reload();await page.getByRole('button',{name:'跨入口同步后的笔记',exact:true}).waitFor();
  await page.evaluate(id=>window.__app.action('local-note-edit',id),local.id);
  await page.locator('#local-note-content').fill('笔记提交版本 A');
  let releaseNote,noteStarted;const noteReady=new Promise(resolve=>noteStarted=resolve);
  await page.route(`**/api/notes/${local.id}`,async route=>{const response=await route.fetch();noteStarted();await new Promise(resolve=>releaseNote=resolve);await route.fulfill({response});});
  await page.locator('[data-action="local-note-save"]').click();await noteReady;
  await page.locator('#local-note-content').fill('等待回应时输入的笔记 B');
  await page.evaluate(()=>window.__app.closeNative(false));
  await page.evaluate(id=>window.__app.action('local-note-edit',id),local.id);
  await page.locator('#local-note-content').waitFor();releaseNote();
  await page.waitForFunction(()=>document.getElementById('toast-text').textContent.includes('之后的编辑仍在草稿'));
  assert.equal(await page.locator('#local-note-content').inputValue(),'等待回应时输入的笔记 B');
  assert.equal((await call('qg_get_card',{cardId:local.id})).content,'笔记提交版本 A');
  await page.unroute(`**/api/notes/${local.id}`);
  await page.reload();await page.locator('.feed-card').first().waitFor();
  await page.evaluate(id=>window.__app.action('local-note-edit',id),local.id);await page.locator('#local-note-content').waitFor();
  assert.equal(await page.locator('#local-note-content').inputValue(),'等待回应时输入的笔记 B');
  await page.locator('[data-action="local-note-save"]').click();
  await page.waitForFunction(()=>document.getElementById('toast-text').textContent==='本地笔记已保存');
  assert.equal((await call('qg_get_card',{cardId:local.id})).content,'等待回应时输入的笔记 B');
  await page.evaluate(()=>window.__app.navigate('#feed'));
  assert.equal((await call('qg_get_card',{cardId:source})).content,original.content);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:join(artifacts,'local-content-feed.png'),fullPage:true,animations:'disabled'});
  await page.evaluate(id=>window.__app.openPanel('editor',id),source);await page.locator('#note-editor').waitFor();
  await page.screenshot({path:join(artifacts,'source-safe-annotation.png'),animations:'disabled'});
  await page.evaluate(id=>window.__app.action('local-note-edit',id),local.id);await page.locator('#local-note-title').waitFor();
  await page.screenshot({path:join(artifacts,'local-note-editor.png'),animations:'disabled'});
  // Hold the JS reflow to cover the interval before resize/RAF delivery deterministically.
  await page.evaluate(()=>{const layout=window.__app.layout;cancelAnimationFrame(layout.frame);window.removeEventListener('resize',layout.onResize);});
  try{
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    for(const width of [390,320]){
      await page.setViewportSize({width,height:844});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      assert.equal(await page.locator('#feed-grid').getAttribute('data-columns'),'3','desktop reflow remains delayed');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'feed stays contained while its desktop reflow is delayed');
    }
  }finally{
    await page.evaluate(()=>{const layout=window.__app.layout;window.addEventListener('resize',layout.onResize,{passive:true});layout.layout(false);});
  }
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:join(artifacts,'local-note-editor-mobile.png'),animations:'disabled'});
  await writeFile(join(artifacts,'content-browser.json'),JSON.stringify({status:'PASS',checks:['server annotations win without legacy upload','invalid create draft can be corrected','390px local note editor','390px and 320px feed stay contained before deferred reflow','CAS conflict preserves draft through reload','explicit legacy import only','source content/provenance remain unchanged','local note create with lost-response idempotency','local note edit conflict and latest reload','MCP edit reaches open feed','reload persistence','typing or reopening during save preserves newer drafts','lost-create response reconciles immutable request after edited draft reload'],pageErrors:errors},null,2));
  console.log('PASS local content browser + HTTP + MCP journey');
}finally{
  await browser?.close();await client.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await service.close();await rm(directory,{recursive:true,force:true});
}

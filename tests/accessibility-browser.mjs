import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {startLocal} from '../server/local.mjs';
const require=createRequire(import.meta.url);
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
let failed=0;
async function scenario(name,run,options={}){
 const dir=await mkdtemp(join(tmpdir(),'sill-accessibility-')),server=await startLocal({port:0,file:join(dir,'cards.json')});
 const origin='http://127.0.0.1:'+server.address().port;
 const context=await browser.newContext({viewport:{width:1440,height:1000},...options}),page=await context.newPage();page.setDefaultTimeout(6000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 const apply=async operations=>{const response=await fetch(origin+'/api/local/operations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operations})});assert.equal(response.status,200);return response.json();};
 try{await page.goto(origin);await page.waitForFunction(()=>document.querySelector('#feed-grid')?.dataset.sync==='saved');await run(page,apply,origin);assert.deepEqual(errors,[]);console.log('PASS '+name);}
 catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack);}
 finally{await context.close();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
}
const settle=page=>page.waitForTimeout(600);
const close=async page=>{await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('dialog').open);};
const open=async(page,id)=>{await page.locator(`[data-card="${id}"] .card-title-button`).click();await settle(page);};
try{
 await scenario('Offline draft survives reload and synchronizes; conflict never overwrites newer state',async(page,apply,origin)=>{
  await page.route('**/api/local/operations',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"fixture offline"}'}));
  await page.keyboard.press('n');await page.locator('#capture-text').fill('恢复验收笔记');await page.locator('[data-action=capture-save]').click();
  await page.waitForFunction(()=>document.querySelector('#feed-grid').dataset.sync==='error');
  await page.unroute('**/api/local/operations');await page.reload();await page.waitForFunction(()=>document.querySelector('#feed-grid')?.dataset.sync==='saved'&&!localStorage.getItem('quiet-glass-unsynced'));
  assert.ok(await page.getByRole('button',{name:'恢复验收笔记',exact:true}).count());
  await page.route('**/api/local/operations',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"fixture offline"}'}));
  await page.evaluate(()=>__store.patch('article-01',{note:'未同步的本机备注'}));await page.waitForFunction(()=>document.querySelector('#feed-grid').dataset.sync==='error');
  await apply([{op:'item.patch',id:'article-01',values:{note:'更新的服务端备注'}}]);
  await page.unroute('**/api/local/operations');await page.reload();await page.waitForFunction(()=>document.querySelector('#feed-grid')?.dataset.sync==='error');
  assert.equal(await page.evaluate(()=>__store.item('article-01').note),'未同步的本机备注');
  assert.equal((await fetch(origin+'/api/local/state').then(r=>r.json())).state.items['article-01'].note,'更新的服务端备注');
  assert.ok(await page.locator('#sync-status').isVisible());
  const download=page.waitForEvent('download');await page.locator('[data-action=sync-export]').click();assert.match((await download).suggestedFilename(),/sill.*json/);
 });
 await scenario('Remote updates preserve preview scroll, focus, full sheet and renewed scroll behavior',async(page,apply)=>{
  await open(page,'article-01');await page.evaluate(()=>{window.originalScroll=document.querySelector('.sheet-scroll');originalScroll.scrollTop=160;document.querySelector('[data-action=bookmark]').focus();});
  await apply([{op:'item.patch',id:'note-01',values:{note:'无关更新'}}]);await page.waitForFunction(()=>__store.item('note-01').note==='无关更新');
  assert.equal(await page.evaluate(()=>document.querySelector('.sheet-scroll')===originalScroll),true);
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.action),'bookmark');assert.ok(await page.locator('.sheet-scroll').evaluate(n=>n.scrollTop)>100);
  await apply([{op:'item.patch',id:'article-01',values:{note:'相关更新'}}]);await page.getByText('相关更新',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.action),'bookmark');assert.ok(await page.locator('.sheet-scroll').evaluate(n=>n.scrollTop)>100);
  await page.locator('.sheet-scroll').evaluate(n=>{n.scrollTop=200;n.dispatchEvent(new Event('scroll'));});assert.ok(await page.locator('.preview-sheet').evaluate(n=>n.classList.contains('is-full')));
 },{viewport:{width:390,height:844}});
 await scenario('Keyboard task and source changes retain focus; radio arrows and shortcut opt-out work',async page=>{
  await open(page,'task-01');const task=page.locator('#modal [data-action=task][data-extra=t2]');await task.focus();const before=await task.getAttribute('aria-checked');await page.keyboard.press('Space');assert.notEqual(await task.getAttribute('aria-checked'),before);assert.equal(await page.evaluate(()=>document.activeElement.dataset.extra),'t2');await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.dataset.extra),'t3');await close(page);
  await page.evaluate(()=>__app.openPanel('sources'));await settle(page);const source=page.locator('[data-action=source-toggle]').first();await source.focus();const id=await source.getAttribute('data-id');await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>document.activeElement.dataset.id),id);await close(page);
  await page.evaluate(()=>__app.action('settings'));await page.locator('[data-action=settings-group][data-extra=look]').click();const radios=page.getByRole('radiogroup',{name:'主题'});await radios.locator('[tabindex="0"]').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>__store.pref('theme')),'light');assert.equal(await radios.locator('[tabindex="0"]').count(),1);
  await page.getByRole('switch',{name:'减少动态效果',exact:true}).click();assert.ok(await page.locator('.feed-card').first().evaluate(n=>getComputedStyle(n).transitionDuration.split(',').every(t=>parseFloat(t)<=0.001)));
  await page.locator('[data-action=settings-group][data-extra=keys]').click();await page.getByRole('switch',{name:'单键快捷键 N / R / T'}).click();await close(page);await page.keyboard.press('n');assert.equal(await page.locator('dialog').evaluate(n=>n.open),false);await page.keyboard.press('Control+k');assert.equal(await page.getByRole('dialog',{name:'搜索与筛选'}).count(),1);
 });
 await scenario('All import entries are reviewable; mixed input is explicitly accounted for',async page=>{
  const csv='title,url\n'+Array.from({length:8},(_,i)=>`同名验收,https://example.com/${i}`).join('\n');
  await page.locator('#file-input').setInputFiles([{name:'audit.csv',mimeType:'text/csv',buffer:Buffer.from(csv)},{name:'audit.md',mimeType:'text/markdown',buffer:Buffer.from('# 单独导入\n正文')}]);
  await page.locator('#modal [role=checkbox]').nth(7).waitFor();assert.equal(await page.locator('#modal [role=checkbox]').count(),8);assert.match(await page.locator('#modal').innerText(),/未纳入：audit.md/);
  await page.locator('[data-action=import-toggle][data-extra="7"]').click();assert.equal(await page.locator('[data-action=import-toggle][data-extra="7"]').getAttribute('aria-checked'),'false');await page.locator('[data-action=import-run]').click();await page.getByText('导入 7 张',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>__store.state.cards.filter(c=>c.url?.startsWith('https://example.com/')).length),7);
 });
 await scenario('Empty desk retains an actionable archive',async(page,apply,origin)=>{
  const state=(await fetch(origin+'/api/local/state').then(r=>r.json())).state;
  await apply([...state.cards.filter(c=>c.id!=='article-01').map(c=>({op:'card.delete',id:c.id})),{op:'item.patch',id:'article-01',values:{read:true,readAt:Date.now()-10*86400000}}]);
  await page.getByText('桌面上都处理完了',{exact:true}).waitFor();await page.locator('[data-action=archive]').click();await page.locator('[data-action=restore-card]').click();await page.keyboard.press('Escape');await page.locator('[data-card=article-01]').waitFor();
 });
 for(const width of [320,390,768,1440])await scenario(`${width}px keyboard search, panel reachability, light/dark axe and reduced motion`,async page=>{
  for(const theme of ['light','dark']){
   await page.evaluate(t=>{__store.setPref('theme',t);__app.applyPreferences();},theme);await settle(page);
   await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
   for(const panel of ['feed','search','preview','settings']){
    if(panel==='search'){await page.keyboard.press('Control+k');await page.locator('#filter-search').fill('无匹配999');assert.equal(await page.locator('#filter-result').getAttribute('role'),'status');assert.equal(await page.getByRole('dialog',{name:'搜索与筛选'}).count(),1);assert.notEqual(await page.locator('.search-pill').evaluate(n=>getComputedStyle(n).outlineStyle),'none');}
    if(panel==='preview')await open(page,'article-01');
    if(panel==='settings'){await page.evaluate(()=>__app.action('settings'));await page.locator('[data-action=settings-group][data-extra=look]').click();}
    await settle(page);const violations=await page.evaluate(async()=>{const r=await axe.run({runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});return r.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}));});assert.deepEqual(violations,[],theme+' '+panel);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    if(panel!=='feed')await close(page);
    if(panel==='search')await page.evaluate(()=>{__app.filter.query='';__app.renderCurrent(false);});
   }
  }
  await page.emulateMedia({reducedMotion:'reduce'});await page.keyboard.press('n');await page.waitForTimeout(150);assert.equal(await page.locator('dialog').evaluate(n=>n.open),true);await close(page);
 },{viewport:{width,height:900}});
 await scenario('Short viewport can scroll capture save into view and submit by keyboard',async page=>{
  await page.keyboard.press('n');await page.locator('#capture-text').fill('短窗口验收');const save=page.locator('[data-action=capture-save]');await save.focus();await settle(page);const rect=await save.boundingBox();assert.ok(rect.y>=0&&rect.y+rect.height<=225,JSON.stringify(rect));await page.keyboard.press('Enter');await page.waitForFunction(()=>!document.querySelector('dialog').open);assert.ok(await page.getByRole('button',{name:'短窗口验收',exact:true}).count());
 },{viewport:{width:320,height:225}});
}finally{await browser.close();}
if(failed)throw new Error(`${failed} accessibility/recovery scenarios failed`);

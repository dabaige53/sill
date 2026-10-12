import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startLocal } from '../server/local.mjs';

const dir=await mkdtemp(join(tmpdir(),'qg-browser-')),file=join(dir,'cards.json');
const artifacts=join(import.meta.dirname,'artifacts');await mkdir(artifacts,{recursive:true});
let server=await startLocal({port:0,file}),browser;
const errors=[];
try{
  const port=server.address().port,origin='http://127.0.0.1:'+port;
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(8000);
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    if(!localStorage.getItem('quiet-glass-v1'))localStorage.setItem('quiet-glass-v1',JSON.stringify({version:2,items:{'note-01':{note:'旧备注',bookmarked:true},'task-01':{taskDone:['t1','t2']}},seconds:37,sort:'time'}));
  });
  await page.goto(origin);await page.waitForFunction(()=>document.querySelector('#feed-grid')?.dataset.sync==='saved');
  let value=await fetch(origin+'/api/local/state').then(r=>r.json());
  assert.equal(value.state.items['note-01'].note,'旧备注');assert.equal(value.state.items['note-01'].bookmarked,true);
  assert.deepEqual(value.state.items['task-01'].taskDone,['t1','t2']);assert.equal(value.state.seconds,37);
  assert.equal(await page.locator('#ai-panel,[data-action="applications"],[data-action="card-ai"]').count(),0);
  const apply=async operations=>{
    const response=await fetch(origin+'/api/local/operations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operations})});
    const value=await response.json();assert.equal(response.status,200,JSON.stringify(value));return value;
  };
  await apply([{op:'card.upsert',card:{id:'agent-test',type:'note',title:'AI 同步验收',body:['AI 写入本地'],url:'https://example.com'}},{op:'item.patch',id:'agent-test',values:{note:'AI 备注',bookmarked:true}}]);
  await page.locator('[data-card="agent-test"]').waitFor();
  await page.locator('[data-card="agent-test"] .card-title-button').click();
  await page.getByRole('button',{name:'取消收藏',exact:false}).click();
  await page.waitForFunction(()=>document.querySelector('#feed-grid').dataset.sync==='saved');
  value=await fetch(origin+'/api/local/state').then(r=>r.json());assert.equal(value.state.items['agent-test'].bookmarked,false);
  await apply([{op:'item.patch',id:'agent-test',values:{note:'新 AI 备注'}},{op:'preferences.patch',values:{reduceTransparency:true}}]);
  await page.getByText('新 AI 备注',{exact:true}).waitFor();assert.equal(await page.locator('body').evaluate(n=>n.classList.contains('opaque')),true);
  await page.getByRole('button',{name:'编辑标签与备注',exact:true}).click();
  await page.locator('#note-editor').fill('页面写回给 AI');
  await page.locator('[data-action="save-note"]').click();
  await page.waitForFunction(()=>document.querySelector('#feed-grid').dataset.sync==='saved');
  value=await fetch(origin+'/api/local/state').then(r=>r.json());assert.equal(value.state.items['agent-test'].note,'页面写回给 AI');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('dialog').open);
  await page.locator('#orb').click();await page.getByRole('button',{name:'刷新卡片',exact:true}).click();
  await page.getByText('卡片已刷新',{exact:true}).waitFor();assert.equal(value.state.cards.length,17);
  const box=await page.locator('[data-card="agent-test"]').boundingBox();assert.ok(box.width<300);
  await page.screenshot({path:join(artifacts,'local-cards.png'),animations:'disabled'});
  // A second page sees the same data; a restart reloads the persisted repository.
  const second=await browser.newPage();await second.goto(origin);await second.waitForFunction(()=>document.querySelector('#feed-grid')?.dataset.sync==='saved');
  assert.equal(await second.locator('[data-card="agent-test"]').count(),1);
  await apply([{op:'card.delete',id:'agent-test'}]);await page.locator('[data-card="agent-test"]').waitFor({state:'detached'});await second.locator('[data-card="agent-test"]').waitFor({state:'detached'});
  await page.reload();await page.waitForFunction(()=>document.querySelector('#feed-grid')?.dataset.sync==='saved');
  assert.equal(await page.locator('[data-card="agent-test"]').count(),0);
  await new Promise(resolve=>server.close(resolve));server=await startLocal({port,file});
  await page.reload();await page.waitForFunction(()=>document.querySelector('#feed-grid')?.dataset.sync==='saved');
  value=await fetch(origin+'/api/local/state').then(r=>r.json());assert.equal(value.state.cards.length,16);assert.equal(value.state.items['note-01'].note,'旧备注');
  assert.deepEqual(errors,[]);
  await writeFile(join(artifacts,'local-browser.json'),JSON.stringify({status:'passed',checks:['旧数据迁移','AI 写入自动显示','页面操作写回','打开预览同步','设置同步','刷新无假数据','双页面同步','删除与重启持久化'],errors},null,2));
  console.log('PASS local card UI and agent operations share persistent state');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}

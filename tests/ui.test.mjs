import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM,VirtualConsole } from 'jsdom';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigSchema } from '../server/config.mjs';
import { Service } from '../server/service.mjs';
import { startHttp } from '../server/http.mjs';

async function until(predicate) {for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw new Error('DOM condition timed out');}
test('live UI connects, shows actual cards, preserves attach-before-send and queues a real question',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'qg-ui-'));
  const service=new Service(ConfigSchema.parse({dataDir:dir}));
  const id=service.ingest({sourceId:'test',items:[{externalId:'live',title:'真实测试笔记',content:'MCP 联调内容',kind:'note'}]}).cardIds[0];
  const token='ui-test-access-key-012345678901234567890';
  const server=await startHttp(service,{port:0,token}),origin=`http://127.0.0.1:${server.address().port}`;
  let cookie='';const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
  const html=await (await fetch(origin)).text();
  const dom=new JSDOM(html,{url:origin,runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc,beforeParse(window){
    window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
    window.scrollTo=()=>{};window.scrollBy=()=>{};window.CSS={escape:x=>x};
    window.HTMLElement.prototype.animate=()=>({finished:Promise.resolve(),cancel(){}});
    window.HTMLElement.prototype.scrollIntoView=()=>{};
    window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
    window.HTMLDialogElement.prototype.close=function(){this.open=false;};
    window.fetch=async(path,init={})=>{const response=await fetch(new URL(path,origin),{...init,headers:{...init.headers,...(cookie?{Cookie:cookie}:{})}});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return response;};
  }});
  t.after(async()=>{dom.window.close();server.closeAllConnections();await new Promise(r=>server.close(r));await service.close();await rm(dir,{recursive:true,force:true});});
  await until(()=>dom.window.document.querySelector('#qg-token'));
  const doc=dom.window.document;
  assert.equal(doc.querySelectorAll('.feed-card').length,0,'live mode must not show demo data');
  doc.querySelector('#qg-token').value=token;doc.querySelector('[data-qg-action="login"]').click();
  await until(()=>doc.querySelector(`[data-card="${id}"]`));
  assert.ok(doc.body.textContent.includes('真实测试笔记'));
  dom.window.__app.attach([id]);assert.equal(service.store.list('request').length,0,'attaching a card must never submit');
  doc.querySelector('#ai-input').value='请总结这张笔记';await dom.window.__app.sendAI();
  assert.equal(service.store.list('request').length,1);assert.equal(service.store.list('request')[0].cardIds[0],id);
  assert.ok(doc.querySelector('#ai-messages').textContent.includes('Codex'));
  assert.equal(dom.window.localStorage.getItem('QG_AUTH_TOKEN'),null);
  assert.deepEqual(errors,[]);
});

import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createSillRuntime} from '../server/cloud/http.mjs';
import {cloudFixture} from './helpers/cloud-fixture.mjs';

// Real browser -> HTTP runtime -> official SDK -> synthetic auth transport -> actual SQL.
// No email, production credentials, cloud database, or deployment is involved.
const fixture=await cloudFixture();let runtime,browser,dropResponse=false;
const server=createServer(async(req,res)=>{
 try{
  const chunks=[];for await(const c of req)chunks.push(c);
  const body=Buffer.concat(chunks),request=new Request(fixture.config.appOrigin+req.url,{method:req.method,headers:req.headers,...(body.length?{body}: {})});
  const response=await runtime(request);
  if(dropResponse&&req.method==='POST'&&req.url==='/api/v1/contents'){
   dropResponse=false;res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:'unavailable'}}));return;
  }
  res.writeHead(response.status,{...Object.fromEntries(response.headers),'set-cookie':response.headers.getSetCookie()});res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){res.writeHead(500);res.end('Test harness failure');console.error(error);}
});
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));fixture.config.appOrigin=`http://127.0.0.1:${server.address().port}`;
 runtime=createSillRuntime(fixture.config,{clientFactory:fixture.factory,html:await readFile(new URL('../dist/cloud/index.html',import.meta.url),'utf8')});
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(fixture.config.appOrigin);await page.locator('#cloud-login').waitFor();
 assert.equal(await page.locator('[data-card]').count(),0);
 await page.locator('[name=email]').fill('synthetic@example.com');await page.locator('#cloud-login button').click();
 await page.waitForFunction(()=>document.querySelector('#cloud-login-status').textContent.includes('发送到邮箱'));
 const callback=new URL(fixture.redirect);callback.searchParams.set('code','synthetic-code');await page.goto(callback.href);
 await page.locator('#cloud-new').waitFor();await page.locator('#cloud-new').click();
 await page.locator('#cloud-title').fill('Browser persisted note');await page.locator('#cloud-body').fill('Synthetic browser data');
 dropResponse=true;await page.locator('#cloud-editor [type=submit]').click();
 await page.waitForFunction(()=>document.querySelector('#cloud-save-status')?.textContent.includes('同一请求'));
 await page.keyboard.press('Escape');assert.equal(await page.locator('#cloud-editor').count(),1,'uncertain request retains editor');
 await page.locator('#cloud-editor [type=submit]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);
 await page.reload();await page.locator('#cloud-new').waitFor();
 const records=await page.evaluate(()=>window.__store.state.cards);assert.equal(records.length,1,'same idempotency key creates once');assert.equal(records[0].title,'Browser persisted note');const id=records[0].id;
 await page.evaluate(id=>window.__app.action('edit',id),id);await page.locator('#cloud-title').fill('My retained draft');
 const external=await page.evaluate(async id=>{const r=await fetch('/api/v1/contents/'+id,{method:'PATCH',headers:{'Content-Type':'application/json','Idempotency-Key':'external_editor1'},body:JSON.stringify({expectedRevision:1,changes:{title:'Other editor'}})});return r.status;},id);assert.equal(external,200);
 await page.locator('#cloud-editor [type=submit]').click();await page.waitForFunction(()=>document.querySelector('#cloud-save-status')?.textContent.includes('另一处修改'));assert.equal(await page.locator('#cloud-title').inputValue(),'My retained draft');
 await page.locator('#cloud-editor [data-action=close]').click();await page.locator('#cloud-refresh').click();await page.waitForFunction(()=>window.__store.state.cards[0]?.title==='Other editor');
 await page.evaluate(id=>window.__app.action('edit',id),id);await page.locator('#cloud-title').fill('Confirmed update');await page.locator('#cloud-editor [type=submit]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);
 await mkdir('tests/artifacts',{recursive:true});await page.screenshot({path:'tests/artifacts/cloud-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.locator('#cloud-new').click();await page.locator('#cloud-title').fill('Mobile draft');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile does not overflow');await page.screenshot({path:'tests/artifacts/cloud-mobile.png'});await page.locator('#cloud-editor [data-action=close]').click();
 assert.equal(await page.evaluate(()=>localStorage.length),0,'no token or private data persisted');
 assert.ok((await context.cookies()).filter(c=>c.name==='__Host-sill-access').every(c=>c.httpOnly&&c.secure));
 await page.locator('#cloud-logout').click();await page.locator('#cloud-login').waitFor();assert.equal(await page.locator('[data-card]').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS cloud browser: PKCE, CRUD, lost-response replay, CAS draft, logout, 1440/390, no localStorage');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));await fixture.close();}

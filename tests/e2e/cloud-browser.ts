import {waitCloud,cloudTool,cloudLogout} from '../server/helpers/cloud-ui.ts';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {token} from '../server/helpers/signed-auth.ts';
import {A} from '../server/helpers/boundary-fixture.ts';
import {createSillRuntime} from '../../server/cloud/http.ts';
import {cloudFixture} from '../server/helpers/cloud-fixture.ts';
const require=createRequire(import.meta.url);

// Real browser -> HTTP runtime -> official SDK -> synthetic auth transport -> actual SQL.
// No email, production credentials, cloud database, or deployment is involved.
const fixture=await cloudFixture();let runtime: any,browser: any,mcpClient: any,dropResponse=false;
const server=createServer(async(req?: any,res?: any)=>{
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
 await new Promise((resolve?: any)=>server.listen(0,'127.0.0.1',resolve));fixture.config.appOrigin=`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
 fixture.config.mcpEnabled=true;fixture.config.agentAudience=fixture.config.appOrigin+'/mcp';
 await fixture.db.query("insert into sill_private.caller_grants values($1,'oauth:browser-agent',array['content:read','content:write'],array['*'],$2)",[A,fixture.config.agentAudience]);
 runtime=createSillRuntime(fixture.config,{clientFactory:fixture.factory,html:await readFile(new URL('../../dist/cloud/index.html',import.meta.url),'utf8')});
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',(e?: any)=>errors.push(e.message));
 await page.goto(fixture.config.appOrigin+'/#access_token=synthetic-invitation&refresh_token=synthetic');await page.locator('#cloud-login').waitFor();assert.ok(!page.url().includes('token='),'implicit invitation fragment is removed, never treated as a login');
 assert.equal(await page.locator('[data-card]').count(),0);
 await page.locator('[name=email]').fill('synthetic@example.com');await page.locator('#cloud-login button').click();
 await page.waitForFunction(()=>document.querySelector('#cloud-login-status').textContent.includes('发送到邮箱'));
 const callback=new URL(fixture.redirect);callback.searchParams.set('code','synthetic-code');await page.goto(callback.href);
 await waitCloud(page);
 const signedInCookies=await context.cookies();
 assert.ok(signedInCookies.some((c?: any)=>c.name==='__Host-sill-refresh'&&c.httpOnly&&c.secure&&c.expires>Date.now()/1000),'login persists a protected refresh cookie');
 await context.addCookies([{...signedInCookies.find((c?: any)=>c.name==='__Host-sill-access'),value:token({exp:Math.floor(Date.now()/1000)-60})}]);
 await page.reload();await waitCloud(page);
 assert.ok(fixture.sessionState.refreshCalls>0,'expired login refreshes without email or user action');
 assert.ok((await context.cookies()).some((c?: any)=>c.name==='__Host-sill-refresh'&&c.value==='synthetic-rotated-refresh'));
 assert.equal(await page.locator('#cloud-login').count(),0);
 await cloudTool(page,'capture');
 assert.equal(await page.locator('#cloud-title').evaluate((e?: any)=>e===document.activeElement),true,'editor opens with title focus');
 await page.locator('#cloud-title').fill('Draft before closing');await page.locator('#cloud-body').fill('Keep this text');
 await page.keyboard.press('Escape');await cloudTool(page,'capture');
 assert.equal(await page.locator('#cloud-title').inputValue(),'Draft before closing');assert.equal(await page.locator('#cloud-body').inputValue(),'Keep this text');
 assert.equal(await page.evaluate(()=>localStorage.length),0,'retained cloud drafts stay in memory');
 await page.locator('#cloud-title').fill('Browser persisted note');await page.locator('#cloud-body').fill('Synthetic browser data');
 dropResponse=true;await page.locator('#cloud-editor [type=submit]').click();
 await page.waitForFunction(()=>document.querySelector('#cloud-save-status')?.textContent.includes('同一请求'));
 await page.keyboard.press('Escape');assert.equal(await page.locator('#cloud-editor').count(),1,'uncertain request retains editor');
 await page.keyboard.press('Control+k');assert.equal(await page.locator('#cloud-editor').count(),1,'search shortcut cannot replace uncertain draft');
 await page.locator('#cloud-editor [type=submit]').click();await page.waitForFunction(()=>!(document.querySelector('#modal') as HTMLDialogElement).open);
 await page.reload();await waitCloud(page);
 const records=await page.evaluate(()=>window.__store.state.cards);assert.equal(records.length,1,'same idempotency key creates once');assert.equal(records[0].title,'Browser persisted note');const id=records[0].id;
 await page.evaluate((id?: any)=>window.__app.action('edit',id),id);await page.locator('#cloud-title').fill('My retained draft');
 const external=await page.evaluate(async (id?: any)=>{const r=await fetch('/api/v1/contents/'+id,{method:'PATCH',headers:{'Content-Type':'application/json','Idempotency-Key':'external_editor1'},body:JSON.stringify({expectedRevision:1,changes:{title:'Other editor'}})});return r.status;},id);assert.equal(external,200);
 await page.locator('#cloud-editor [type=submit]').click();await page.waitForFunction(()=>document.querySelector('#cloud-save-status')?.textContent.includes('另一处修改'));assert.equal(await page.locator('#cloud-title').inputValue(),'My retained draft');
 await page.locator('#cloud-editor [data-action=close]').click();
 await page.evaluate((id?: any)=>window.__app.action('edit',id),id);assert.equal(await page.locator('#cloud-title').inputValue(),'My retained draft','closing an editor retains its draft and original revision');
 await page.locator('#cloud-discard').click();await page.locator('#cloud-confirm').click();
 await cloudTool(page,'refresh');await page.waitForFunction(()=>window.__store.state.cards[0]?.title==='Other editor');
 await page.evaluate((id?: any)=>window.__app.action('edit',id),id);await page.locator('#cloud-title').fill('Confirmed update');await page.keyboard.press('Control+Enter');await page.waitForFunction(()=>!(document.querySelector('#modal') as HTMLDialogElement).open);
 mcpClient=new Client({name:'synthetic-agent',version:'1.0.0'});
 await mcpClient.connect(new StreamableHTTPClientTransport(new URL(fixture.config.agentAudience),{requestInit:{headers:{Authorization:'Bearer '+token({client_id:'browser-agent',aud:fixture.config.agentAudience})}}}));
 const mcpCreated=await mcpClient.callTool({name:'sill_createContent',arguments:{idempotency_key:'browser_mcp_1',body:{type:'note',title:'Agent wrote this',body:['Visible in the same web workspace']}}});assert.ok(!mcpCreated.isError);
 await cloudTool(page,'refresh');await page.waitForFunction((id?: any)=>window.__store.state.cards.some((c?: any)=>c.id===id&&c.title==='Agent wrote this'),mcpCreated.structuredContent.id);
 const mcpUpdated=await mcpClient.callTool({name:'sill_updateContent',arguments:{id:mcpCreated.structuredContent.id,idempotency_key:'browser_mcp_2',body:{expectedRevision:1,changes:{title:'Agent updated this',body:['Updated in the same workspace']}}}});assert.equal(mcpUpdated.structuredContent.revision,2);
 await cloudTool(page,'refresh');await page.waitForFunction((id?: any)=>window.__store.state.cards.some((c?: any)=>c.id===id&&c.revision===2&&c.title==='Agent updated this'),mcpCreated.structuredContent.id);
 await mkdir('tests/artifacts',{recursive:true});await page.screenshot({path:'tests/artifacts/cloud-desktop.png',animations:'disabled'});
 await page.setViewportSize({width:390,height:844});await cloudTool(page,'capture');await page.locator('#cloud-title').fill('Mobile draft');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile does not overflow');await page.screenshot({path:'tests/artifacts/cloud-mobile.png',animations:'disabled'});await page.locator('#cloud-editor [data-action=close]').click();
 await cloudTool(page,'capture');await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
 for(const theme of ['light','dark'])for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:320,height:225}]){
  await page.setViewportSize(viewport);await page.evaluate((theme?: any)=>{__store.setPref('theme',theme);__app.applyPreferences();},theme);
  await page.evaluate(()=>new Promise((resolve?: any)=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.evaluate(()=>Promise.allSettled(document.getAnimations().filter((a?: any)=>Number.isFinite(a.effect?.getTiming().iterations)).map((a?: any)=>a.finished)));
  const violations=await page.evaluate(async()=>{const result=await (window as Window & {axe?: typeof import('axe-core')}).axe!.run({runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});return result.violations.map((v?: any)=>({id:v.id,nodes:v.nodes.map((n?: any)=>n.target)}));});
  assert.deepEqual(violations,[],`${theme} cloud editor ${viewport.width}x${viewport.height}`);
  const overflow=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,nodes:[...document.querySelectorAll('body *')].filter((e?: any)=>{const r=e.getBoundingClientRect();return r.width&&r.right>innerWidth+1}).map((e?: any)=>({tag:e.tagName,class:e.className,id:e.id,right:e.getBoundingClientRect().right})).slice(0,12)}));
  assert.ok(overflow.scrollWidth<=viewport.width,`editor does not overflow ${theme} ${JSON.stringify(viewport)} ${JSON.stringify(overflow)}`);
  const save=await page.locator('#cloud-save').boundingBox();assert.ok(save.y>=0&&save.y+save.height<=viewport.height,'save remains visible in a short window');
 }
 await page.locator('#cloud-editor [data-action=close]').click();await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>localStorage.length),0,'no token or private data persisted');
 assert.ok((await context.cookies()).filter((c?: any)=>c.name==='__Host-sill-access').every((c?: any)=>c.httpOnly&&c.secure));
 await cloudLogout(page);await page.locator('#cloud-confirm').click();await page.locator('#cloud-login').waitFor();assert.equal(await page.locator('[data-card]').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS cloud browser: PKCE, CRUD, lost-response replay, CAS draft, MCP write visible in web, logout, 1440/390, no localStorage');
}finally{await mcpClient?.close();await browser?.close();await new Promise((resolve?: any)=>server.close(resolve));await fixture.close();}

// A protocol-host simulator with real MCP/SQL, not actual Codex authorization.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createSillRuntime} from '../server/cloud/http.mjs';
import {cloudFixture} from './helpers/cloud-fixture.mjs';
import {A,resource} from './helpers/boundary-fixture.mjs';
import {token} from './helpers/signed-auth.mjs';
import {cloudTool} from './helpers/cloud-ui.mjs';
const f=await cloudFixture();let client,browser;
const server=createServer((_req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Sill protocol-host simulator</title><body style="margin:0"></body>');});
try{
 const html=await readFile('dist/cloud/app.html','utf8');
 await f.db.exec(`insert into sill_private.caller_grants values('${A}','oauth:app-browser',array['content:read','content:write','content:delete'],array['*'],'${resource}');`);
 const runtime=createSillRuntime({...f.config,mcpEnabled:true},{clientFactory:f.factory,appHtml:html});
 client=new Client({name:'synthetic-cloud-app-host',version:'1'});
 await client.connect(new StreamableHTTPClientTransport(new URL(resource),{requestInit:{headers:{Authorization:'Bearer '+token({client_id:'app-browser',aud:resource})}},fetch:(url,init)=>runtime(new Request(url,init))}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 const toolResults=[];
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],network=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.exposeBinding('sillTool',async({frame},params)=>{assert.equal(frame,page.mainFrame());const result=await client.callTool(params);toolResults.push({name:params.name,result});return result;});
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.route('**/*',route=>{network.push(route.request().url());return route.abort();});
 await page.evaluate(html=>{
  const iframe=document.createElement('iframe');iframe.id='sill';iframe.style.cssText='width:100%;height:100vh;border:0';iframe.sandbox='allow-scripts allow-same-origin';
  window.addEventListener('message',async event=>{
   const q=event.data;if(event.source!==iframe.contentWindow||q?.jsonrpc!=='2.0'||q.id==null)return;
   const reply=(result,error)=>event.source.postMessage({jsonrpc:'2.0',id:q.id,...(error?{error}:{result})},'*');
   try{
    if(q.method==='ui/initialize')reply({protocolVersion:q.params.protocolVersion,hostInfo:{name:'Sill simulator',version:'26.1015.1'},hostCapabilities:{serverTools:{},openLinks:{}},hostContext:{theme:'light',platform:'desktop',displayMode:'fullscreen',availableDisplayModes:['fullscreen']}});
    else if(q.method==='tools/call')reply(await window.sillTool(q.params));
    else reply({});
   }catch{reply(null,{code:-32603,message:'Synthetic host request failed'});}
  });document.body.appendChild(iframe);iframe.srcdoc=html;
 },html);
 const frame=await (await page.locator('#sill').elementHandle()).contentFrame();
 await frame.locator('body.cloud-signed-in').waitFor();
 await frame.getByRole('button',{name:'记下第一条内容'}).click();
 await frame.locator('#cloud-title').fill('Cloud plugin fixture');await frame.locator('#cloud-body').fill('Stored through the real MCP and SQL boundary');
 await frame.locator('#cloud-save').click();await frame.locator('[data-card]').waitFor({timeout:10000}).catch(async error=>{console.log(JSON.stringify({toolResults,errors,body:await frame.locator('body').innerText(),title:await frame.locator('#cloud-title').inputValue(),status:await frame.locator('#cloud-save-status').innerText()}));throw error;});
 const created=(await client.callTool({name:'sill_listContents',arguments:{}})).structuredContent.items[0];assert.equal(created.title,'Cloud plugin fixture');
 await mkdir('tests/artifacts',{recursive:true});await page.screenshot({path:'tests/artifacts/cloud-app-desktop.png',animations:'disabled'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'tests/artifacts/cloud-app-mobile.png',animations:'disabled'});
 assert.ok(await frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await frame.locator('[data-card] .card-more-trigger').click();
 await frame.locator('#cloud-title').fill('Updated in plugin');await frame.locator('#cloud-save').click();
 await frame.waitForFunction(()=>!document.querySelector('#modal').open);
 assert.equal((await client.callTool({name:'sill_getContent',arguments:{id:created.id}})).structuredContent.title,'Updated in plugin');
 await cloudTool(frame,'settings');await frame.locator('[data-action=settings-group][data-extra=data]').click();assert.equal(await frame.locator('#cloud-logout').innerText(),'管理插件授权');
 assert.equal(await frame.evaluate(()=>localStorage.length),0);assert.deepEqual(network,[]);assert.deepEqual(errors,[]);
 console.log('PASS cloud MCP App: real bridge handshake, create/edit, 1280/390, no direct network or browser storage (synthetic identity)');
}finally{await browser?.close();await client?.close();await f.close();await new Promise(r=>server.close(r));}

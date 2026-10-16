// UI recovery against a deterministic HTTP fixture. Real SQL/MCP coverage lives
// in cloud-browser.mjs and cloud-app-browser.mjs; no production account is used.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const html=await readFile('dist/cloud/index.html','utf8');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
const seed: Record<string, any>={id:'recovery-note',revision:1,type:'note',title:'保留原始正文',body:['第一段\n段内换行','','最后一段'],state:{read:false},updated_at:new Date().toISOString()};
async function scenario(name?: any,run?: any){
 const fixture: Record<string, any>={user:'owner-a',denied:0,records:new Map<any, any>([[seed.id,structuredClone(seed)]]),receipts:new Map<any, any>(),writes:[],holdNext:false,release:null};
 const server=createServer(async(req?: any,res?: any)=>{
  const reply=(status?: any,value?: any)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end(html);return;}
  if(req.url==='/auth/session'){reply(fixture.user?200:401,fixture.user?{userId:fixture.user,scopes:['content:read','content:write','content:delete']}:{error:{code:'unauthenticated'}});return;}
  if(req.method==='GET'){reply(200,{items:[...fixture.records.values()],next_cursor:null});return;}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const body=JSON.parse(Buffer.concat(chunks).toString('utf8')),key=req.headers['idempotency-key'];fixture.writes.push({key,body});
  if(fixture.denied){reply(fixture.denied,{error:{code:fixture.denied===401?'unauthenticated':'forbidden'}});return;}
  let record=fixture.receipts.get(key);
  if(!record){
   const id=req.url.split('/').pop(),existing=fixture.records.get(id);
   if(existing&&body.expectedRevision!==existing.revision){reply(409,{error:{code:'revision_conflict'}});return;}
   record=existing?{...existing,...body.changes,revision:existing.revision+1}:{...body,id:'created-'+fixture.records.size,revision:1,updated_at:new Date().toISOString()};
   fixture.records.set(record.id,record);fixture.receipts.set(key,record);
  }
  if(fixture.holdNext){fixture.holdNext=false;await new Promise((resolve?: any)=>fixture.release=resolve);}
  reply(200,record);
 });
 await new Promise((resolve?: any)=>server.listen(0,'127.0.0.1',resolve));
 const context=await browser.newContext({viewport:{width:1200,height:900}}),page=await context.newPage(),errors=[];
 page.on('pageerror',(error?: any)=>errors.push(error.message));
 try{
  await page.goto('http://127.0.0.1:'+(server.address() as import('node:net').AddressInfo).port);await page.locator('body.cloud-signed-in').waitFor();
  await run(page,fixture);assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>localStorage.length),0);
  console.log('PASS '+name);
 }finally{fixture.release?.();await context.close();server.closeAllConnections();await new Promise((resolve?: any)=>server.close(resolve));}
}
const edit=(page?: any,id: any=seed.id)=>page.evaluate((id?: any)=>__app.action(id?'edit':'capture',id),id);
try{
 await scenario('title-only edit preserves paragraph boundaries and blank paragraphs',async(page?: any,fixture?: any)=>{
  await edit(page);await page.locator('#cloud-title').fill('只改标题');await page.keyboard.press('Control+Enter');
  await page.waitForFunction(()=>!document.querySelector('dialog').open);
  assert.deepEqual(fixture.records.get(seed.id).body,seed.body);
 });
 await scenario('stalled save times out, ignores late response, and replays the same request once',async(page?: any,fixture?: any)=>{
  await page.clock.install();await edit(page,null);await page.locator('#cloud-title').fill('不能重复创建');
  fixture.holdNext=true;await page.locator('#cloud-save').click();
  await page.waitForFunction(()=>(document.getElementById('cloud-save') as HTMLInputElement).disabled);
  await page.clock.fastForward(20001);
  await page.locator('#cloud-save').filter({hasText:'核对上次保存'}).waitFor();
  assert.ok(await page.locator('#cloud-body').isDisabled());
  await page.keyboard.press('Escape');assert.ok(await page.locator('dialog').evaluate((e?: any)=>e.open));
  fixture.release();await page.locator('#cloud-save').click();
  await page.waitForFunction(()=>!document.querySelector('dialog').open);
  assert.equal(fixture.writes.length,2);assert.equal(fixture.writes[0].key,fixture.writes[1].key);
  assert.equal(fixture.records.size,2,'one seed plus one created note');
 });
 for(const status of [401,403])await scenario(`${status} preserves editable draft, recovery entry and account boundary`,async(page?: any,fixture?: any)=>{
  await edit(page);await page.locator('#cloud-title').fill('登录中断前的草稿');await page.locator('#cloud-body').fill('这段文字不能丢失。');
  fixture.denied=status;fixture.user=null;await page.locator('#cloud-save').click();
  await page.waitForFunction(()=>document.getElementById('cloud-save-status').textContent.includes('草稿没有丢失'));
  assert.equal(await page.locator('#cloud-title').inputValue(),'登录中断前的草稿');assert.equal(await page.locator('#cloud-body').inputValue(),'这段文字不能丢失。');
  assert.ok(await page.locator('#cloud-save').isDisabled());assert.equal(await page.locator('#cloud-body').isDisabled(),false);
  assert.equal(await page.locator('main [data-card]').count(),0,'authorized records are cleared');
  await page.keyboard.press('Control+Enter');assert.equal(fixture.writes.length,1,'blocked drafts cannot submit');
  await page.locator('#cloud-editor [data-action=close]').click();await page.locator('#cloud-login').waitFor();
  await page.locator('[data-action=resume-draft]').click();assert.equal(await page.locator('#cloud-body').inputValue(),'这段文字不能丢失。');
  await page.locator('#cloud-editor [data-action=close]').click();fixture.user='owner-b';fixture.denied=0;fixture.records.clear();
  await page.evaluate(()=>__app.refresh());await page.locator('[data-action=resume-draft]').click();
  assert.ok(await page.locator('#cloud-save').isDisabled(),'a different account cannot receive a recovered draft');
  await page.keyboard.press('Control+Enter');assert.equal(fixture.writes.length,1);
  await page.locator('#cloud-editor [data-action=close]').click();fixture.user='owner-a';fixture.records.set(seed.id,structuredClone(seed));
  await page.evaluate(()=>__app.refresh());await edit(page);
  assert.equal(await page.locator('#cloud-save').isDisabled(),false,'verified original web account can resume explicitly');
  await page.keyboard.press('Control+Enter');await page.waitForFunction(()=>!document.querySelector('dialog').open);
  assert.equal(fixture.records.get(seed.id).title,'登录中断前的草稿');
 });
}finally{await browser.close();}

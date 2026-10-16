import {waitCloud,cloudTool,cloudLogout} from '../server/helpers/cloud-ui.ts';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium,devices} from 'playwright';
const html=await readFile('dist/cloud/index.html','utf8');
const server=createServer((req?: any,res?: any)=>{res.setHeader('Content-Type','text/html');res.end(html);});
await new Promise((r?: any)=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
await mkdir('tests/artifacts/cloud-recovery',{recursive:true});
try{
 for(const mobile of [false,true]){
  const context=await browser.newContext({...(mobile?{...devices['iPhone 12'],viewport:{width:390,height:844}}:{viewport:{width:1440,height:1000}}),recordVideo:{dir:'tests/artifacts/cloud-recovery',size:mobile?{width:390,height:844}:{width:1440,height:1000}}});
  const page=await context.newPage(),errors=[];page.on('pageerror',(e?: any)=>errors.push(e.message));
  let signedIn=false,sessionStatus=401,loginRequests=0;
  let cards=[],holdListing=false,heldRoute=null;
  await page.route('**/auth/**',(route?: any)=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/auth/login'){loginRequests++;return route.fulfill({status:202,json:{message:'如果该账号可登录，登录链接将发送到邮箱。'}});}
   if(path==='/auth/logout'){signedIn=false;return route.fulfill({json:{revoked:true}});}
   return route.fulfill({status:signedIn?200:sessionStatus,json:signedIn?{userId:'synthetic-owner'}:{error:{code:sessionStatus===401?'unauthenticated':sessionStatus===403?'forbidden':'unavailable'}}});
  });
  await page.route('**/api/v1/contents**',(route?: any)=>{if(holdListing){heldRoute=route;return;}return route.fulfill({json:{items:cards,next_cursor:null}});});
  await page.goto(base);assert.deepEqual(await page.evaluate(()=>[innerWidth,innerHeight]),mobile?[390,844]:[1440,1000]);await page.locator('#cloud-login').waitFor();await page.waitForTimeout(150);
  assert.equal(await page.locator('.welcome #welcome-title').textContent(),'Sill');
  assert.equal(await page.locator('#cloud-account').count(),0);
  assert.equal(await page.locator('[data-card]').count(),0);assert.equal(await page.locator('#toast').isVisible(),false);
  await page.waitForTimeout(400);await page.screenshot({animations:'disabled',scale:'css',path:`tests/artifacts/cloud-recovery/${mobile?'mobile':'desktop'}-welcome.png`});
  await page.locator('#cloud-email').fill('synthetic@example.com');await page.locator('#cloud-login button').click();
  await page.waitForFunction(()=>document.querySelector('#cloud-login-status').textContent.includes('发送到邮箱'));
  assert.equal(await page.locator('#cloud-login button').isDisabled(),true);
  await page.locator('#cloud-login').evaluate((f?: any)=>f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(loginRequests,1);
  await page.goto(base+'/?login_error=1');await page.waitForFunction(()=>document.querySelector('#cloud-login-status')?.textContent.includes('未能完成验证'));assert.ok(!page.url().includes('login_error'));
  signedIn=true;await page.reload();await waitCloud(page);
  await page.locator('.welcome [data-action=capture]').click();await page.locator('#cloud-editor').waitFor();
  await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.querySelector('#modal').contains(document.activeElement)));
  await page.locator('#cloud-title').fill('验收测试笔记（合成数据）');await page.locator('#cloud-body').fill('这是隔离测试内容，不是真实云端数据。\n'.repeat(30));
  if(mobile){await page.setViewportSize({width:390,height:450});await page.locator('#cloud-editor [data-action=close]').scrollIntoViewIfNeeded();assert.ok(await page.locator('#cloud-editor [data-action=close]').isVisible());await page.setViewportSize({width:390,height:844});}
  await page.waitForTimeout(400);await page.screenshot({animations:'disabled',scale:'css',path:`tests/artifacts/cloud-recovery/${mobile?'mobile':'desktop'}-editor.png`});
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!(document.querySelector('#modal') as HTMLDialogElement).open);
  assert.equal(await page.evaluate(()=>(document.activeElement as HTMLElement).dataset.action),'capture');
  cards=Array.from({length:24},(_?: any,i?: any)=>({id:'test-'+i,type:'note',title:'测试笔记 '+(i+1),body:['隔离验收数据，不是真实账号内容。'],state:{read:false},revision:1,updated_at:new Date().toISOString()}));
  await cloudTool(page,'refresh');await page.waitForFunction(()=>window.__store.state.cards.length===24);
  await page.evaluate(()=>window.__store.setPref('stack',false));await page.evaluate(()=>window.__app.renderCurrent(true));
  await page.locator('main').click({position:{x:5,y:5}});await page.mouse.move(0,0);await page.waitForTimeout(600);await page.screenshot({animations:'disabled',scale:'css',path:`tests/artifacts/cloud-recovery/${mobile?'mobile':'desktop'}-cards.png`});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));assert.ok(await page.evaluate(()=>scrollY>0));await page.evaluate(()=>window.scrollTo(0,0));
  await page.locator('.card-title-button').first().click();await page.waitForFunction(()=>(document.querySelector('#modal') as HTMLDialogElement).open);await page.keyboard.press('Escape');await page.waitForFunction(()=>!(document.querySelector('#modal') as HTMLDialogElement).open);
  await page.locator('#orb').click();await page.locator('[data-action=settings]').click();await page.locator('[data-action=settings-group][data-extra=data]').click();assert.match(await page.locator('.settings-main').textContent(),/云端工作区/);
  await page.locator('[data-action=settings-group][data-extra=sources]').click();assert.match(await page.locator('.settings-main').textContent(),/尚未连接/);
  await page.keyboard.press('Escape');holdListing=true;await cloudTool(page,'refresh');while(!heldRoute)await page.waitForTimeout(10);await cloudLogout(page);await page.locator('#cloud-login').waitFor();assert.equal(await page.locator('[data-card]').count(),0);await heldRoute.fulfill({json:{items:cards,next_cursor:null}});await page.waitForTimeout(150);assert.equal(await page.locator('[data-card]').count(),0,'late refresh cannot revive signed-out content');
  assert.equal(await page.evaluate(()=>localStorage.length),0);
  for(const code of [403,503]){sessionStatus=code;await page.reload();await page.locator('#toast').waitFor({state:'visible'});assert.equal(await page.locator('[data-card]').count(),0);assert.match(await page.locator('#toast').textContent(),code===403?/权限/:/连接暂时/);}
  assert.deepEqual(errors,[]);
  await context.close();await page.video().saveAs(`tests/artifacts/cloud-recovery/${mobile?'mobile':'desktop'}-walkthrough.webm`);console.log(`PASS welcome/editor/keyboard/focus/scroll/privacy/cooldown ${mobile?'iPhone12 390x844':'desktop 1440x1000'}`);
 }
}finally{await browser.close();await new Promise((r?: any)=>server.close(r));}

import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {oauthFixture,AUTH} from './helpers/oauth-fixture.mjs';
import {token} from './helpers/signed-auth.mjs';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
await mkdir('tests/artifacts',{recursive:true});
try{
 for(const [name,viewport] of [['desktop',{width:1440,height:1000}],['iphone12',{width:390,height:844}]]){
  const f=await oauthFixture(),context=await browser.newContext({viewport});
  try{
   await context.addCookies([{name:'__Host-sill-access',value:token(),url:f.config.appOrigin,secure:true,httpOnly:true,sameSite:'Lax'}]);
   await context.route(f.config.appOrigin+'/**',async route=>{const req=route.request();const response=await f.runtime(new Request(req.url(),{method:req.method(),headers:await req.allHeaders(),...(req.postData()?{body:req.postData()}:{})}));const headers=Object.fromEntries(response.headers);if(response.headers.getSetCookie().length)headers['set-cookie']=response.headers.getSetCookie().join('\n');await route.fulfill({status:response.status,headers,body:Buffer.from(await response.arrayBuffer())});});
   await context.route('http://127.0.0.1:5876/**',route=>route.fulfill({body:'<h1>Synthetic callback · not a real Codex connection</h1>',contentType:'text/html'}));
   const page=await context.newPage(),errors=[];page.setDefaultNavigationTimeout(15000);page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
   await page.goto(f.config.appOrigin+'/oauth/consent?authorization_id='+AUTH);
   assert.match(await page.locator('main').innerText(),/读取、创建与修改/);assert.match(await page.locator('main').innerText(),/openid/);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.getByRole('button',{name:'允许上述访问'}).focus();assert.equal(await page.evaluate(()=>document.activeElement.value),'approve');
   await page.screenshot({path:`tests/artifacts/oauth-${name}-review.png`,fullPage:true});
   await page.getByRole('button',{name:'拒绝',exact:true}).click();await page.waitForURL('http://127.0.0.1:5876/**');assert.equal(await f.grant(),undefined);
   await page.goto(f.config.appOrigin+'/oauth/consent?authorization_id='+AUTH);await page.getByRole('button',{name:'允许上述访问'}).click();await page.waitForURL('http://127.0.0.1:5876/**');assert.ok(await f.grant());
   await page.goto(f.config.appOrigin+'/oauth/grants');await page.getByRole('button',{name:'撤销此客户端'}).click();await page.getByRole('heading',{name:'Sill 访问已撤销'}).waitFor();assert.equal(await f.grant(),undefined);
   assert.ok((await context.cookies()).some(c=>c.name==='__Host-sill-access'));assert.deepEqual(errors,[]);
   console.log(name+': consent review, keyboard focus, deny, approve, revoke, session preservation passed (synthetic provider)');
  }finally{await context.close();await f.close();}
 }
}finally{await browser.close();}

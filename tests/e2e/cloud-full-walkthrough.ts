import {waitCloud,cloudTool,cloudLogout} from './helpers/cloud-ui.mjs';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium,devices} from 'playwright';
import {createSillRuntime} from '../server/cloud/http.mjs';
import {cloudFixture} from './helpers/cloud-fixture.mjs';
// Recorded pacing is for readable evidence. All auth/provider traffic is synthetic;
// real browser and SDK interact with actual SQL in a disposable local database.
const out='tests/artifacts/cloud-full';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const reports=[];
try{for(const mobile of [false,true]){
 const fixture=await cloudFixture(),name=mobile?'mobile':'desktop';let runtime;
 const server=createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);const r=await runtime(new Request(fixture.config.appOrigin+req.url,{method:req.method,headers:req.headers,...(body.length?{body}:{})}));res.writeHead(r.status,{...Object.fromEntries(r.headers),'set-cookie':r.headers.getSetCookie()});res.end(Buffer.from(await r.arrayBuffer()));}catch(e){res.writeHead(500);res.end('Isolated fixture error');console.error(e);}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));fixture.config.appOrigin=`http://127.0.0.1:${server.address().port}`;
 runtime=createSillRuntime(fixture.config,{clientFactory:fixture.factory,html:await readFile('dist/cloud/index.html','utf8')});
 const size=mobile?{width:390,height:844}:{width:1440,height:1000};
 const context=await browser.newContext({...(mobile?devices['iPhone 12']:{}),viewport:size,recordVideo:{dir:out,size}});
 const page=await context.newPage(),errors=[],steps=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{addEventListener('DOMContentLoaded',()=>{const label=document.createElement('div');label.id='evidence-label';label.textContent='隔离模拟 API · 非生产 · 合成数据';label.style.cssText='position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:7px 10px;background:#173849;color:#fff;font:12px/1.5 system-ui;text-align:center;pointer-events:none';document.body.append(label);});});
 const step=async(text)=>{steps.push(text);await page.evaluate(text=>document.querySelector('#evidence-label').textContent='隔离模拟 API · 非生产 · '+text,text);};
 const pause=()=>page.waitForTimeout(4500);
 try{
  await page.goto(fixture.config.appOrigin);await page.locator('#cloud-login').waitFor();await step('1 / 12 原始欢迎页与登录');await pause();
  await page.locator('#cloud-email').fill('not-an-email');await page.locator('#cloud-login button').click();assert.equal(await page.locator('#cloud-email').evaluate(e=>e.validity.valid),false);await step('2 / 12 邮箱格式检查');await pause();
  await page.locator('#cloud-email').fill('synthetic@example.com');await page.locator('#cloud-login button').click();await page.waitForFunction(()=>document.querySelector('#cloud-login-status').textContent.includes('发送到邮箱'));assert.equal(await page.locator('#cloud-login button').isDisabled(),true);await step('3 / 12 模拟发送成功 · 60 秒重发保护');await pause();
  await page.goto(fixture.config.appOrigin+'/auth/callback?code=bad-code');await page.waitForFunction(()=>document.querySelector('#cloud-login-status')?.textContent.includes('未能完成验证'));await step('4 / 12 回调失败提示与恢复');await pause();
  await page.goto(fixture.config.appOrigin);await page.locator('#cloud-email').fill('synthetic@example.com');await page.locator('#cloud-login button').click();await page.waitForFunction(()=>document.querySelector('#cloud-login-status').textContent.includes('发送到邮箱'));const callback=new URL(fixture.redirect);callback.searchParams.set('code','synthetic-code');await page.goto(callback.href);await waitCloud(page);assert.equal(await page.locator('[data-card]').count(),0);await step('5 / 12 模拟 PKCE 登录 · 空工作区');await pause();
  await page.locator('.welcome [data-action=capture]').click();await page.locator('#cloud-title').fill('验收笔记 · 合成内容');await page.locator('#cloud-body').pressSequentially('A quiet place to think.',{delay:90});await page.locator('#cloud-body').fill('这是隔离数据库中的合成验收笔记。\n不会读取或改变真实账号。\n\n今天的记录：\n整理想法，保留上下文。\n下一步：补充一段观察。');await step('6 / 12 新建笔记 · 焦点与输入');await pause();
  if(mobile){await page.setViewportSize({width:390,height:450});await page.locator('#cloud-editor [type=submit]').scrollIntoViewIfNeeded();assert.ok(await page.locator('#cloud-editor [type=submit]').isVisible());await step('键盘占位模拟：缩小视口仍可滚动保存');await pause();await page.setViewportSize(size);}
  await page.locator('#cloud-editor [type=submit]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);await page.locator('[data-card]').first().waitFor();await step('7 / 12 保存成功 · 卡片呈现');await pause();
  await page.locator('.card-title-button').first().click();await page.waitForFunction(()=>document.querySelector('#modal').open);await step('8 / 12 打开阅读 · Escape 返回');await pause();await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#modal').open);
  const edit=page.locator('[data-action=card-more]').first();await edit.click();await page.locator('#cloud-title').fill('验收笔记 · 已修改');await page.locator('#cloud-body').fill('这是隔离数据库中的合成验收笔记。\n修改已通过真实运行时保存到隔离 SQL。');await step('9 / 12 修改内容并保存');await pause();await page.locator('#cloud-editor [type=submit]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);
  await cloudTool(page,'refresh');await page.waitForFunction(()=>window.__store.state.cards[0]?.title==='验收笔记 · 已修改');await page.reload();await waitCloud(page);assert.equal(await page.locator('[data-card]').count(),1);assert.equal(await page.evaluate(()=>window.__store.state.cards[0].title),'验收笔记 · 已修改');await step('10 / 12 刷新与重载 · 保存结果保留');await pause();
  await cloudTool(page,'capture');await page.locator('#cloud-title').fill('未保存的测试草稿');await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.querySelector('#modal').contains(document.activeElement)));await step('11 / 12 弹窗键盘焦点 · 关闭未保存草稿');await pause();await page.locator('#cloud-editor [data-action=close]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);assert.equal(await page.locator('[data-card]').count(),1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:out+'/'+name+'-final.png',scale:'css'});
  await cloudLogout(page);await page.locator('#cloud-login').waitFor();assert.equal(await page.locator('[data-card]').count(),0);assert.equal(await page.evaluate(()=>localStorage.length),0);await step('12 / 12 退出 · 清除卡片并返回欢迎页');await pause();assert.deepEqual(errors,[]);
  reports.push({name,viewport:size,steps,passed:true,limitations:['Synthetic provider; no real email or cloud account','Chromium iPhone12 emulation, not physical iOS Safari','Mobile keyboard space simulated by viewport reduction; no native keyboard recording']});
 }finally{await context.close();await page.video().saveAs(out+'/'+name+'-full.webm');await new Promise(r=>server.close(r));await fixture.close();}
 console.log('PASS full walkthrough '+name);
}}finally{await browser.close();await writeFile(out+'/steps.json',JSON.stringify(reports,null,2)+'\n');}

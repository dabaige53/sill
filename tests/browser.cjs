/** Real browser regression checks. Run against an isolated localhost origin. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'..');
const load=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?createRequire(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright','package.json')):require;
const {chromium}=load('playwright');
const artifacts=path.join(__dirname,'artifacts');fs.mkdirSync(artifacts,{recursive:true});
const pages=new Set(['/index.html','/components.html','/research.html']);
const server=http.createServer((req,res)=>{
 const file=(req.url||'').split('?')[0];
 if(!pages.has(file)){res.writeHead(404);return res.end();}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
 res.end(fs.readFileSync(path.join(root,file.slice(1))));
});
const results=[];
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;
 let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  async function scenario(name,fn,options={}){
   const context=await browser.newContext({viewport:{width:1440,height:1000},...options});
   const page=await context.newPage(),errors=[],external=[];
   page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith(origin)||url.startsWith('data:'))return route.continue();
    external.push(url);return route.abort();
   });
   try{
    await page.goto(origin+'/index.html');await page.waitForFunction(()=>window.__app);
    await fn(page,context);
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    results.push({name,status:'PASS'});console.log('PASS',name);
   }catch(e){results.push({name,status:'FAIL',error:e.message});throw e;}
   finally{await context.close();}
  }
  const action=(page,name,id='',extra='')=>page.evaluate(([name,id,extra])=>window.__app.action(name,id,extra),[name,id,extra]);
  const state=(page,id)=>page.evaluate(id=>JSON.parse(localStorage.getItem('quiet-glass-v1')).items[id],id);
  const filter=async(page,status)=>{
   await action(page,'filter');await page.locator(`[data-action="filter-status"][data-extra="${status}"]`).click();
   await page.locator('[data-action="apply-filter"]').click();
  };
  await scenario('Preview, reader, bookmark undo, tags and multi-card AI remain independent',async page=>{
   assert.equal(await page.locator('.feed-card').count(),16);
   await page.locator('[data-card="article-01"]').click();
   assert.equal((await state(page,'article-01')).seen,true);assert.equal((await state(page,'article-01')).read,false);
   await page.locator('dialog [data-action="bookmark"]').click();assert.equal((await state(page,'article-01')).bookmarked,true);
   await page.getByRole('button',{name:'撤销操作',exact:true}).click();assert.equal((await state(page,'article-01')).bookmarked,false);
   await page.locator('dialog [data-action="reader"]').click();
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await page.locator('#reader-scroll').evaluate(el=>{el.scrollTop=el.scrollHeight;el.dispatchEvent(new Event('scroll'));});
   assert.equal((await state(page,'article-01')).read,true);
   await page.keyboard.press('Escape');await page.waitForFunction(()=>window.__app.modalKind==='preview');
   await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('dialog').open);
   await action(page,'edit','note-01');await page.locator('#note-editor').fill('<b>本地备注</b>');
   await page.locator('[data-action="save-note"]').click();await page.reload();
   assert.equal((await state(page,'note-01')).note,'<b>本地备注</b>');
   await action(page,'select','note-01');await action(page,'select','article-01');await action(page,'selected-ai');
   assert.equal(await page.evaluate(()=>window.__app.contexts.length),2);
   assert.equal(await page.evaluate(()=>window.__app.messages.length),0);
   assert.equal(await page.locator('.feed-card').count(),16);
  });
  await scenario('Snooze survives reload, queues once, waits during reading and reappears on demand',async page=>{
   await page.clock.install();
   await action(page,'preview','reminder-01');await page.getByRole('button',{name:'延后提醒十分钟',exact:true}).click();
   assert.equal(await page.locator('[data-card="reminder-01"]').count(),0);
   const deadline=(await state(page,'reminder-01')).snoozedUntil;
   await page.reload();assert.equal((await state(page,'reminder-01')).snoozedUntil,deadline);
   await action(page,'reader','article-01');
   const order=await page.locator('.feed-card').evaluateAll(nodes=>nodes.map(n=>n.dataset.card));
   await page.clock.fastForward(601000);
   assert.equal(await page.evaluate(()=>window.__app.modalKind),'reader');
   assert.deepEqual(await page.locator('.feed-card').evaluateAll(nodes=>nodes.map(n=>n.dataset.card)),order);
   await action(page,'show-new');assert.equal(await page.locator('[data-card="reminder-01"]').count(),0);
   await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('dialog').open);
   await page.locator('#new-count').click();assert.equal(await page.locator('[data-card="reminder-01"]').count(),1);
   await page.clock.fastForward(120000);assert.equal(await page.locator('#new-count').isVisible(),false);
   await page.reload();assert.equal(await page.locator('#new-count').isVisible(),false);
  });
  await scenario('Dismiss, completion, status recovery and undo use accessible actions',async page=>{
   await action(page,'preview','reminder-01');await page.getByRole('button',{name:'忽略此提醒',exact:true}).click();
   assert.equal(await page.locator('[data-card="reminder-01"]').count(),0);
   await page.getByRole('button',{name:'撤销操作',exact:true}).click();assert.equal(await page.locator('[data-card="reminder-01"]').count(),1);
   await action(page,'preview','reminder-01');await page.getByRole('button',{name:'完成提醒',exact:true}).click();
   await filter(page,'done');assert.equal(await page.locator('.feed-card').count(),1);
   await page.locator('[data-card="reminder-01"]').click();await page.getByRole('button',{name:'恢复提醒',exact:true}).click();
   await action(page,'clear-filter');assert.equal(await page.locator('[data-card="reminder-01"]').count(),1);
  });
  await scenario('Sorting preserves keyboard focus, survives reload and combines with search',async page=>{
   await page.keyboard.press('Control+k');
   const time=page.locator('[data-action="sort-feed"][data-extra="time"]');await time.click();
   assert.equal(await page.evaluate(()=>document.activeElement.dataset.extra),'time');
   await page.locator('#filter-search').fill('不存在的关键词');
   await page.waitForFunction(()=>document.querySelector('#filter-result').textContent==='0 张卡片');
   await page.locator('[data-action="apply-filter"]').click();assert.equal(await page.locator('.empty-card').count(),1);
   await action(page,'clear-filter');await page.reload();assert.equal(await page.evaluate(()=>window.__app.sort),'time');
   assert.equal(await page.locator('.feed-card').first().getAttribute('data-card'),'event-01');
  });
  await scenario('Refresh preserves a scrolled anchor and restores new-card state after reload',async page=>{
   await page.evaluate(()=>scrollTo(0,500));
   const anchor=await page.locator('.feed-card').evaluateAll(nodes=>{const n=nodes.find(n=>n.getBoundingClientRect().bottom>0);return {id:n.dataset.card,top:n.getBoundingClientRect().top};});
   await action(page,'refresh');await page.locator('#new-count').waitFor({state:'visible'});
   assert.equal(await page.locator('.feed-card').count(),16);await page.locator('#new-count').click();
   assert.equal(await page.locator('.feed-card').count(),17);
   const top=await page.locator(`[data-card="${anchor.id}"]`).evaluate(n=>n.getBoundingClientRect().top);
   assert.ok(Math.abs(top-anchor.top)<3,`anchor moved ${top-anchor.top}px`);
   await action(page,'bookmark','fresh-reminder');await page.reload();
   assert.equal(await page.locator('[data-card="fresh-reminder"]').count(),1);
   assert.equal((await state(page,'fresh-reminder')).bookmarked,true);
  });
  for(const width of [390,320])await scenario(`${width}px touch layout, reminder controls and reduced motion`,async page=>{
   await page.screenshot({path:path.join(artifacts,`feed-${width}.png`),fullPage:true});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.locator('#orb').tap();await page.getByRole('button',{name:'筛选与搜索',exact:true}).tap();
   await page.screenshot({path:path.join(artifacts,`filter-${width}.png`)});
   await page.getByRole('button',{name:'关闭筛选',exact:true}).tap();
   await action(page,'preview','reminder-01');
   const controls=page.locator('dialog .icon-button');
   const boxes=await controls.evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {width:r.width,height:r.height,right:r.right};}));
   assert.ok(boxes.every(r=>r.width>=44&&r.height>=44&&r.right<=width));
   await page.screenshot({path:path.join(artifacts,`reminder-${width}.png`)});
   await page.getByRole('button',{name:'延后提醒十分钟',exact:true}).tap();
   await filter(page,'snoozed');assert.equal(await page.locator('[data-card="reminder-01"]').count(),1);
  },{viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  await scenario('Desktop drag to AI and cancellation preserve source cards and read state',async page=>{
   const card=page.locator('[data-card="article-01"]'),box=await card.boundingBox(),orb=await page.locator('#orb').boundingBox();
   await page.mouse.move(box.x+box.width/2,box.y+60);await page.mouse.down();await page.mouse.move(box.x+box.width/2+30,box.y+90,{steps:3});
   await page.keyboard.press('Escape');await page.mouse.up();
   assert.equal((await state(page,'article-01'))?.seen||false,false);
   await page.mouse.move(box.x+box.width/2,box.y+60);await page.mouse.down();await page.mouse.move(orb.x+orb.width/2,orb.y+orb.height/2,{steps:15});await page.mouse.up();
   assert.deepEqual(await page.evaluate(()=>window.__app.contexts),['article-01']);
   assert.equal(await page.locator('[data-card="article-01"]').count(),1);
   assert.equal(await page.evaluate(()=>window.__app.messages.length),0);
   await page.screenshot({path:path.join(artifacts,'desktop-ai.png')});
  });
  await scenario('All three entry pages run from shared source',async page=>{
   await page.goto(origin+'/components.html');await page.waitForFunction(()=>window.__app?.mode==='library');
   assert.ok(await page.locator('.lab-card').count()>0);
   await page.goto(origin+'/research.html');await page.waitForFunction(()=>window.__app?.mode==='sources');
   assert.ok(await page.locator('a[href^="https://"]').count()>=19);
  });
 }finally{
  fs.writeFileSync(path.join(artifacts,'browser-results.json'),JSON.stringify(results,null,2)+'\n');
  if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
 }
})().catch(error=>{console.error(error);process.exitCode=1;});

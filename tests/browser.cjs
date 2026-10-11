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
const pages=new Set(['/index.html','/icons.html','/cards.html','/components.html','/research.html']);
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
  async function scenario(name,fn,options={},entry='/index.html'){
   const context=await browser.newContext({viewport:{width:1440,height:1000},...options});
   const page=await context.newPage(),errors=[],external=[];
   page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith(origin)||url.startsWith('data:'))return route.continue();
    external.push(url);return route.abort();
   });
   try{
    await page.goto(origin+entry);await page.waitForFunction(()=>window.__app);
    await fn(page,context);
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    results.push({name,status:'PASS'});console.log('PASS',name);
   }catch(e){
    const screenshot=`failure-${results.length+1}.png`;
    await page.screenshot({animations:'disabled',path:path.join(artifacts,screenshot)}).catch(()=>{});
    results.push({name,status:'FAIL',error:e.message,screenshot,pageErrors:errors,externalRequests:external});console.error('FAIL',name,e.message);
   }
   finally{await context.close();}
  }
  const action=(page,name,id='',extra='')=>page.evaluate(([name,id,extra])=>window.__app.action(name,id,extra),[name,id,extra]);
  const state=(page,id)=>page.evaluate(id=>JSON.parse(localStorage.getItem('quiet-glass-v1')).items[id],id);
  const card=(page,id)=>page.locator(`[data-card="${id}"]`);
  const openCard=(page,id)=>card(page,id).locator('.card-title-button').click();
  const feedUnopened=async(page,id)=>{
   assert.equal(await page.locator('dialog').evaluate(n=>n.open),false,'inline action opened a dialog');
   assert.equal(await page.evaluate(()=>location.hash),'#feed','inline action changed the route');
   const item=await state(page,id);
   assert.equal(item?.seen||false,false,'inline action marked the card as seen');
   assert.equal(item?.read||false,false,'inline action marked the card as read');
  };
  const touchTargets=async(locator,width)=>{
   const boxes=await locator.evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {label:n.getAttribute('aria-label')||n.textContent,width:r.width,height:r.height,left:r.left,right:r.right};}));
   assert.ok(boxes.length>0,'no touch actions found');
   assert.ok(boxes.every(r=>r.width>=44&&r.height>=44&&r.left>=0&&r.right<=width),JSON.stringify(boxes));
  };
  const filter=async(page,status)=>{
   await action(page,'filter');await page.locator(`[data-action="filter-status"][data-extra="${status}"]`).click();
   await page.locator('[data-action="apply-filter"]').click();
  };
  await scenario('Preview, reader, bookmark undo, tags and multi-card AI remain independent',async page=>{
   assert.equal(await page.locator('.feed-card').count(),16);
   await openCard(page,'article-01');
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
   await page.locator('.context-title[data-id="note-01"]').click();
   await page.waitForFunction(()=>window.__app.modalKind==='preview'&&window.__app.currentId==='note-01');
   assert.deepEqual(await page.evaluate(()=>window.__app.contexts),['note-01','article-01']);
   assert.equal(await page.evaluate(()=>window.__app.messages.length),0);
   await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('dialog').open);
   await page.locator('#orb').click();await page.locator('.context-remove[data-id="note-01"]').click();
   assert.deepEqual(await page.evaluate(()=>window.__app.contexts),['article-01']);
   assert.equal(await page.evaluate(()=>document.activeElement.matches('.context-remove,#ai-input')),true,'removing a reference lost AI keyboard focus');
   assert.equal(await page.evaluate(()=>window.__app.messages.length),0);
   await page.locator('[data-action="ai-close"]').click();
   const tasks=card(page,'task-01');
   await tasks.locator('[data-action="task"][data-extra="t2"]').focus();await page.keyboard.press('Space');
   assert.equal(await page.evaluate(()=>document.activeElement.dataset.extra),'t2','task update moved focus to a different checkbox');
   await tasks.locator('[data-action="task"][data-extra="t3"]').focus();await page.keyboard.press('Space');
   assert.equal(await tasks.locator('.card-title-button').evaluate(n=>n===document.activeElement),true,'completed task must return focus to its title');
  });
  await scenario('Snooze survives reload, queues once, waits during reading and reappears on demand',async page=>{
   await page.clock.install();
   await action(page,'preview','reminder-01');await page.locator('dialog').getByRole('button',{name:'延后提醒十分钟',exact:true}).click();
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
   await action(page,'preview','reminder-01');await page.locator('dialog').getByRole('button',{name:'忽略此提醒',exact:true}).click();
   assert.equal(await page.locator('[data-card="reminder-01"]').count(),0);
   await page.getByRole('button',{name:'撤销操作',exact:true}).click();assert.equal(await page.locator('[data-card="reminder-01"]').count(),1);
   await action(page,'preview','reminder-01');await page.locator('dialog').getByRole('button',{name:'完成提醒',exact:true}).click();
   await filter(page,'done');assert.equal(await page.locator('.feed-card').count(),1);
   await openCard(page,'reminder-01');await page.locator('dialog').getByRole('button',{name:'恢复提醒',exact:true}).click();
   await action(page,'clear-filter');assert.equal(await page.locator('[data-card="reminder-01"]').count(),1);
  });
  await scenario('Inline reminder actions work by keyboard without opening or reading the card',async page=>{
   const reminder=card(page,'reminder-01');
   await reminder.locator('[data-action="complete-reminder"]').focus();await page.keyboard.press('Enter');
   assert.equal((await state(page,'reminder-01')).reminderDone,true);
   assert.equal(await reminder.count(),0);await feedUnopened(page,'reminder-01');
   assert.equal(await page.evaluate(()=>document.activeElement!==document.body),true,'removing the active card lost keyboard focus');
   await page.getByRole('button',{name:'撤销操作',exact:true}).click();
   assert.equal((await state(page,'reminder-01')).reminderDone,false);assert.equal(await reminder.count(),1);
   assert.equal(await page.evaluate(()=>document.activeElement!==document.body),true,'undo lost keyboard focus');
   await reminder.locator('[data-action="snooze"]').focus();await page.keyboard.press('Space');
   assert.ok((await state(page,'reminder-01')).snoozedUntil>await page.evaluate(()=>Date.now()));
   assert.equal(await reminder.count(),0);await feedUnopened(page,'reminder-01');
   await page.getByRole('button',{name:'撤销操作',exact:true}).click();
   assert.equal((await state(page,'reminder-01')).snoozedUntil,0);assert.equal(await reminder.count(),1);
  });
  await scenario('Card menus close on Escape and outside click, and keep actions separate from preview',async page=>{
   const note=card(page,'note-01'),more=note.locator('[data-action="card-more"]');
   await note.focus();await more.focus();await page.keyboard.press('Enter');
   assert.equal(await page.locator('.card-more-menu').count(),1);
   assert.equal(await more.getAttribute('aria-expanded'),'true');
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('.card-more-menu').count(),0);
   assert.equal(await more.evaluate(n=>document.activeElement===n),true,'Escape should return to the card menu trigger');
   assert.equal(await more.getAttribute('aria-expanded'),'false');await feedUnopened(page,'note-01');
   await more.click();await card(page,'article-01').hover();await card(page,'article-01').locator('[data-action="card-more"]').click();
   assert.equal(await page.locator('.card-more-menu').count(),1);
   assert.equal(await note.locator('.card-more-menu').count(),0);
   await page.mouse.click(3,3);assert.equal(await page.locator('.card-more-menu').count(),0);
   await note.hover();await more.click();await note.locator('.card-more-menu [data-action="later"]').click();
   assert.equal((await state(page,'note-01')).later,true);
   assert.equal(await page.locator('.card-more-menu').count(),0);await feedUnopened(page,'note-01');
   assert.equal(await more.evaluate(n=>document.activeElement===n),true,'a menu action should preserve a usable focus target');
   await page.mouse.move(3,3);await note.focus();await more.focus();await page.keyboard.press('Enter');
   await page.keyboard.press('Enter');await page.waitForFunction(()=>window.__app.modalKind==='editor');
   await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('dialog').open);
   assert.equal(await note.evaluate(n=>n.contains(document.activeElement)),true,'closing an editor must not focus a hidden card tool');
  });
  await scenario('Expanded cards return to the same scroll position and focus, including rapid dismissal',async page=>{
   await page.screenshot({animations:'disabled',path:path.join(artifacts,'desktop-feed.png')});
   await openCard(page,'article-01');
   await page.screenshot({animations:'disabled',path:path.join(artifacts,'desktop-preview.png')});
   await page.getByRole('button',{name:'关闭预览',exact:true}).click();
   await page.waitForFunction(()=>!document.querySelector('dialog').open);
   const title=card(page,'article-03').locator('.card-title-button');
   await title.scrollIntoViewIfNeeded();await title.focus();
   const before=await title.evaluate(n=>({y:scrollY,top:n.getBoundingClientRect().top}));
   await page.keyboard.press('Enter');
   await page.waitForFunction(()=>window.__app.modalKind==='preview');
   await page.keyboard.press('Escape');
   await page.waitForFunction(()=>!document.querySelector('dialog').open);
   const after=await title.evaluate(n=>({y:scrollY,top:n.getBoundingClientRect().top,focused:document.activeElement===n}));
   assert.ok(Math.abs(after.y-before.y)<3,`closing a card moved scroll ${after.y-before.y}px`);
   assert.ok(Math.abs(after.top-before.top)<3,`closing a card moved its origin ${after.top-before.top}px`);
   assert.equal(after.focused,true,'preview should return focus to its title trigger');
   assert.equal((await state(page,'article-03')).read,false);
   await page.keyboard.press('Enter');await page.waitForFunction(()=>window.__app.modalKind==='preview');
   await page.goBack();await page.waitForFunction(()=>!document.querySelector('dialog').open);
   assert.equal(await title.evaluate(n=>document.activeElement===n),true);
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
   await page.screenshot({animations:'disabled',path:path.join(artifacts,`feed-${width}.png`),fullPage:true});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   const reminder=card(page,'reminder-01');
   await reminder.scrollIntoViewIfNeeded();
   await touchTargets(reminder.locator('.reminder-actions button,.card-more-trigger'),width);
   await reminder.locator('[data-action="card-more"]').tap();
   await touchTargets(page.locator('.card-more-menu button'),width);
   await page.screenshot({animations:'disabled',path:path.join(artifacts,`mobile-card-actions-${width}.png`)});
   await page.touchscreen.tap(3,3);assert.equal(await page.locator('.card-more-menu').count(),0);
   await reminder.locator('[data-action="snooze"]').tap();
   assert.equal(await reminder.count(),0);await feedUnopened(page,'reminder-01');
   await page.getByRole('button',{name:'撤销操作',exact:true}).tap();assert.equal(await reminder.count(),1);
   await card(page,'suggestion-01').locator('.suggestion-action').tap();
   assert.deepEqual(await page.evaluate(()=>window.__app.contexts),['suggestion-01']);
   assert.equal(await page.evaluate(()=>window.__app.messages.length),0);
   assert.equal(await page.locator('dialog').evaluate(n=>n.open),false);
   await touchTargets(page.locator('.context-title,.context-remove'),width);
   await page.screenshot({animations:'disabled',path:path.join(artifacts,`mobile-ai-${width}.png`)});
   await page.locator('.context-remove').tap();
   assert.equal(await page.evaluate(()=>window.__app.contexts.length),0);
   assert.equal(await page.locator('#ai-input').evaluate(n=>document.activeElement===n),true);
   await page.locator('[data-action="ai-close"]').tap();
   await page.locator('#orb').tap();assert.equal(await page.locator('#ai-panel').isVisible(),false);await page.getByRole('button',{name:'筛选与搜索',exact:true}).tap();
   await page.screenshot({animations:'disabled',path:path.join(artifacts,`filter-${width}.png`)});
   await page.locator('.panel-footer').scrollIntoViewIfNeeded();
   await page.screenshot({animations:'disabled',path:path.join(artifacts,`filter-bottom-${width}.png`)});
   await page.getByRole('button',{name:'关闭筛选',exact:true}).tap();
   await action(page,'preview','reminder-01');
   const controls=page.locator('dialog .icon-button');
   const boxes=await controls.evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {width:r.width,height:r.height,right:r.right};}));
   assert.ok(boxes.every(r=>r.width>=44&&r.height>=44&&r.right<=width));
   await page.screenshot({animations:'disabled',path:path.join(artifacts,`reminder-${width}.png`)});
   await page.locator('dialog').getByRole('button',{name:'延后提醒十分钟',exact:true}).tap();
   await filter(page,'snoozed');assert.equal(await page.locator('[data-card="reminder-01"]').count(),1);
  },{viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  await scenario('Desktop drag to AI and cancellation preserve source cards and read state',async page=>{
   const source=card(page,'article-01').locator('.top-meta'),box=await source.boundingBox(),orb=await page.locator('#orb').boundingBox();
   const x=box.x+box.width/2,y=box.y+box.height/2;
   await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+30,y+30,{steps:3});
   await page.keyboard.press('Escape');await page.mouse.up();
   assert.equal((await state(page,'article-01'))?.seen||false,false);
   await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(orb.x+orb.width/2,orb.y+orb.height/2,{steps:15});await page.mouse.up();
   assert.deepEqual(await page.evaluate(()=>window.__app.contexts),['article-01']);
   assert.equal(await page.locator('[data-card="article-01"]').count(),1);
   assert.equal(await page.evaluate(()=>window.__app.messages.length),0);
   await page.locator('.drag-ghost').waitFor({state:'detached'});
   await page.screenshot({animations:'disabled',path:path.join(artifacts,'desktop-ai.png')});
  });
  await scenario('Entry pages run from shared source and retain all research references',async page=>{
   await page.goto(origin+'/components.html');await page.waitForFunction(()=>window.__app?.mode==='library');
   assert.ok(await page.locator('[data-component]').count()>0);
   await page.goto(origin+'/research.html');await page.waitForFunction(()=>window.__app?.mode==='sources');
   const sources=await page.locator('[data-source]').evaluateAll(nodes=>nodes.map(n=>n.dataset.source));
   assert.equal(sources.length,28);assert.equal(new Set(sources).size,28);
   assert.equal(await page.locator('[data-source] h3 a[href^="https://"]').count(),28);
  });
  const componentNames=['icon-button','action-button','progress-ring','checkbox','avatars','attachment','tag-chip','metadata','search-field','textarea','toggle','glass-dock','card-menu','dialog-preview','reader','filter-panel','editor-panel','media-player','settings-panel','toast','selection','drop-targets','empty-state','new-content','motion','ai-context','ai-compose','ai-messages','ai-empty'];
  const cardTypes=['article','mail','note','task','event','reminder','media','insight','digest','suggestion'];
  const catalogScreenshot=async(page,kind,width)=>{
   if(width===1440){
    await page.screenshot({animations:'disabled',path:path.join(artifacts,`${kind}-library-desktop.png`)});
    await page.screenshot({animations:'disabled',path:path.join(artifacts,`${kind}-library-all.png`),fullPage:true});
   }else if(width===390)await page.screenshot({animations:'disabled',path:path.join(artifacts,`${kind}-library-390.png`)});
  };
  const withinViewport=async(page)=>{
   const geometry=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth}));
   assert.ok(geometry.page<=geometry.viewport,`catalogue overflows: ${geometry.page}px > ${geometry.viewport}px`);
  };
  for(const width of [1440,390,320]){
   const options={viewport:{width,height:width===1440?1000:844},...(width<650?{isMobile:true,hasTouch:true,reducedMotion:'reduce'}:{})};
   await scenario(`${width}px independent icon library covers every shared glyph`,async page=>{
    await page.waitForFunction(()=>window.__app.mode==='icons');
    await catalogScreenshot(page,'icons',width);await withinViewport(page);
    const keys=await page.locator('.icon-tile[data-icon-name]').evaluateAll(nodes=>nodes.map(n=>n.dataset.iconName));
    assert.equal(keys.length,38);assert.equal(new Set(keys).size,38);
    assert.equal(await page.locator('.icon-tile-preview svg').count(),38);
    if(width<650)await touchTargets(page.locator('.icon-tile-trigger'),width);
    const bookmark=page.locator('.icon-tile[data-icon-name="bookmark"] .icon-tile-trigger');
    await bookmark.click();assert.equal(await bookmark.evaluate(n=>n.classList.contains('active')),true);
   },options,'/icons.html');
   await scenario(`${width}px independent card library covers types, variants and static states`,async page=>{
    await page.waitForFunction(()=>window.__app.mode==='cards');
    await catalogScreenshot(page,'cards',width);await withinViewport(page);
    const samples=page.locator('.card-specimen[data-card-variant]');
    const variants=await samples.evaluateAll(nodes=>nodes.map(n=>({type:n.dataset.cardType,form:n.dataset.cardForm,variant:n.dataset.cardVariant})));
    assert.equal(variants.length,13);
    assert.deepEqual([...new Set(variants.map(n=>n.type))].sort(),cardTypes.slice().sort());
    assert.equal(new Set(variants.map(n=>n.variant)).size,13);
    const states=await page.locator('.card-specimen.is-passive[data-card-state]').evaluateAll(nodes=>nodes.map(n=>n.dataset.cardState));
    assert.deepEqual(states.sort(),['default','read','bookmarked','selected','snoozed','completed'].sort());
    assert.equal(await page.locator('.card-specimen.is-passive [data-action],.card-specimen.is-passive button').count(),0,'static states must not mutate live cards');
    const titles=samples.locator('.card-title-button');
    assert.equal(await titles.count(),13);
    const first=titles.first(),id=await first.getAttribute('data-id');
    await first.click();await page.waitForFunction(id=>window.__app.modalKind==='preview'&&window.__app.currentId===id,id);
    await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('dialog').open);
    assert.equal(await page.evaluate(()=>window.__app.mode),'cards');
   },options,'/cards.html');
   await scenario(`${width}px independent component library exposes complete, working controls`,async page=>{
    await page.waitForFunction(()=>window.__app.mode==='library');
    await catalogScreenshot(page,'components',width);await withinViewport(page);
    const names=await page.locator('[data-component]').evaluateAll(nodes=>nodes.map(n=>n.dataset.component));
    assert.deepEqual(names.slice().sort(),componentNames.slice().sort());
    await page.locator('[data-component="filter-panel"] [data-action="filter"]').click();
    assert.equal(await page.locator('#filter-search').isVisible(),true);
    await page.locator('dialog').getByRole('button',{name:'关闭筛选',exact:true}).click();
    await page.locator('[data-component="dialog-preview"] [data-action="preview"][data-id="article-01"]').click();
    await page.waitForFunction(()=>window.__app.modalKind==='preview'&&window.__app.currentId==='article-01');
    await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('dialog').open);
    const draft='比较这些内容，先保留为草稿。';
    await page.locator('[data-component="ai-compose"] textarea').fill(draft);
    await page.locator('[data-component="ai-compose"] [data-action="catalog-compose"]').click();
    assert.equal(await page.locator('#ai-panel').isVisible(),true);
    assert.equal(await page.locator('#ai-input').inputValue(),draft);
    assert.equal(await page.evaluate(()=>window.__app.messages.length),0);
    await page.locator('#ai-panel [data-action="ai-close"]').click();
    if(width===1440){
     const samples=page.locator('[data-component="ai-context"] .context-card'),count=await samples.count();
     await page.locator('[data-component="ai-context"] [data-action="card-ai"][data-id="article-01"]').click();
     await page.locator('#ai-panel [data-action="ai-close"]').click();
     await page.locator('[data-component="ai-context"] .context-title[data-id="note-01"]').click();
     await page.locator('dialog [data-action="card-ai"][data-id="note-01"]').click();
     await page.locator('#ai-contexts .context-remove[data-id="article-01"]').click();
     assert.deepEqual(await page.evaluate(()=>window.__app.contexts),['note-01']);
     assert.equal(await page.locator('#ai-panel').evaluate(n=>n.contains(document.activeElement)),true,'removing a live reference must not focus a catalogue specimen');
     assert.equal(await samples.count(),count,'removing a live reference mutated the catalogue specimen');
     assert.equal(await page.evaluate(()=>window.__app.messages.length),0);
     await page.locator('#ai-panel [data-action="ai-close"]').click();
    }
    assert.equal(await page.evaluate(()=>window.__app.mode),'library');
   },options,'/components.html');
  }
  const failed=results.filter(result=>result.status==='FAIL');
  if(failed.length)assert.fail(`${failed.length}/${results.length} browser scenarios failed: ${failed.map(result=>result.name).join('; ')}`);
 }finally{
  fs.writeFileSync(path.join(artifacts,'browser-results.json'),JSON.stringify(results,null,2)+'\n');
  if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
 }
})().catch(error=>{console.error(error);process.exitCode=1;});

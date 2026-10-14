const {createRequire}=require('node:module');
const load=createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright/package.json');
const {chromium}=load('playwright');
const http=require('node:http'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const originArg=process.argv[2];let server;
 if(!originArg){const code=fs.readFileSync(__dirname+'/worker.mjs','utf8').replace("import html from './index.html';",()=> 'const html='+JSON.stringify(fs.readFileSync(__dirname+'/index.html','utf8'))+';');const worker=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;server=http.createServer(async(req,res)=>{const response=await worker.fetch(new Request('http://localhost'+req.url,{method:req.method}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));});await new Promise(r=>server.listen(0,'127.0.0.1',r));}
 const origin=originArg||`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const results=[];
 try{for(const width of [1440,390]){
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();const errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 const response=await page.goto(origin);assert.equal(response.status(),200);await page.waitForFunction(()=>window.__app);
 assert.ok(await page.locator('#demo-notice').isVisible());assert.ok(await page.locator('.feed-card').count()>5);
 await page.locator('[data-card="article-01"] .card-title-button').click();await page.locator('dialog [data-action="bookmark"]').click();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('sill-public-demo-v1')).items['article-01'].bookmarked),true);
 await page.locator('dialog [data-action="reader"]').click();await page.locator('#reader-scroll').evaluate(el=>{el.scrollTop=el.scrollHeight;el.dispatchEvent(new Event('scroll'));});await page.keyboard.press('Escape');await page.keyboard.press('Escape');await page.evaluate(()=>window.__app.action('task','task-01','t2'));assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('sill-public-demo-v1')).items['task-01'].taskDone.includes('t2')));await page.reload();await page.waitForFunction(()=>window.__app);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('sill-public-demo-v1')).items['article-01'].bookmarked),true);
 await page.evaluate(()=>window.__app.action('filter'));await page.locator('#filter-search').fill('注意力');await page.waitForFunction(()=>document.querySelector('#search-results')?.textContent.includes('注意力'));await page.keyboard.press('Escape');
 await page.evaluate(()=>window.__app.action('permission-allow','','calendar'));assert.ok((await page.locator('#toast-text').innerText()).includes('未连接'));
 await page.evaluate(()=>window.__app.action('feed-add'));assert.ok((await page.locator('#toast-text').innerText()).includes('未连接'));
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('sill-public-demo-v1')).sources.some(s=>s.status==='ok')),false);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:__dirname+`/${originArg?'online':'local'}-${width}.png`,fullPage:false});
 assert.deepEqual(errors,[]);assert.ok(requests.every(u=>u.startsWith(origin)||u.startsWith('data:')));
 results.push({width,status:'PASS',checks:['banner','cards','preview','reader','task','bookmark','persistence','search','connection-block','responsive'],requests});await context.close();
 }}finally{await browser.close();if(server)server.close();}
 fs.writeFileSync(__dirname+`/${originArg?'online':'local'}-verification.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exit(1)});

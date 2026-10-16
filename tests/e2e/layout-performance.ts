// Browser measurements, not an FPS guarantee. Both versions use the same
// synthetic 120-card desk and repeated width changes on this machine.
import {execFileSync} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const baselineCommit=execFileSync('git',['rev-parse','--verify',(process.argv[2]||'HEAD')+'^{commit}'],{encoding:'utf8'}).trim();
const pages={baseline:execFileSync('git',['show',baselineCommit+':index.html'],{encoding:'utf8',maxBuffer:8*1024*1024}),current:await readFile('index.html','utf8')};
const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(pages[req.url.slice(1)]||pages.current);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
const result={fixture:{cards:120,layouts:12,viewport:{width:1440,height:900}},baselineCommit,measurements:{}};
try{
 for(const version of ['baseline','current']){
  const page=await browser.newPage({viewport:result.fixture.viewport,reducedMotion:'reduce'});
  await page.goto(`http://127.0.0.1:${server.address().port}/${version}`);
  await page.evaluate(()=>{
   __store.state.cards=Array.from({length:120},(_,i)=>({id:'perf-'+i,type:'note',kind:'web',title:'布局测量 '+i,body:['同一批合成卡片'],summary:'用于测量卡片排版的合成内容。'.repeat(i%3+1),source:'性能验收',time:Date.now()-i}));
   __store.state.items={};__store.state.preferences.stack=false;__app.pageLimit=120;__app.renderCurrent(false);
  });
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const rendered=await page.locator('.feed-item').count();
  assert.equal(rendered,120,`${version} must render the full fixture: ${await page.locator('main').innerText()}`);
  const geometry=await page.evaluate(()=>({grid:__app.grid.clientWidth,layout:__app.layout.container.clientWidth,connected:__app.layout.container.isConnected,same:__app.grid===__app.layout.container,first:__app.grid.firstElementChild.getBoundingClientRect().width}));
  const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
  const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
  const before=await metrics();
  const widths=[];
  for(let i=0;i<12;i++){
   await page.setViewportSize({width:i%2?1280:1360,height:900});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   widths.push(await page.locator('#feed-grid').evaluate(el=>el.clientWidth));
  }
  assert.equal(new Set(widths).size,2,'measurements must include actual resized layouts');
  const after=await metrics();
  result.measurements[version]={geometry,widths,layoutCount:after.LayoutCount-before.LayoutCount,layoutMilliseconds:(after.LayoutDuration-before.LayoutDuration)*1000};
  await page.close();
 }
 await mkdir('tests/artifacts',{recursive:true});await writeFile('tests/artifacts/layout-performance.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result,null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

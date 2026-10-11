const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const sources=['src/data/cards.js','src/services/feed-policy.js','src/data/store.js','src/views/app.js'];
function fixture(raw=null,at=1800000000000){
 let now=at;
 const data=new Map(raw===null?[]:[['quiet-glass-v1',typeof raw==='string'?raw:JSON.stringify(raw)]]);
 const nodes=new Map();
 const context=vm.createContext({
  Date:class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}},
  localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)},
  window:{},document:{getElementById(id){if(!nodes.has(id))nodes.set(id,{dataset:{},setAttribute(k,v){this[k]=v;}});return nodes.get(id);}},
  icon:()=>'',history:{replaceState(){}},
 });
 vm.runInContext(sources.map(p=>fs.readFileSync(path.join(root,p),'utf8')).join('\n')+'\nthis.api={FeedPolicy,Store,AppController,SeedCards,FreshCards};',context);
 const api=context.api;api.Store.load();
 const app=new api.AppController();app.dialog={open:false};app.drag={active:null};
 app.renders=0;app.withFeedAnchor=fn=>{fn();app.renders++;};
 app.toast=(message,undo)=>{app.lastToast=message;app.undoAction=undo;};
 return {...api,app,context,data,nodes,now:()=>now,advance:ms=>now+=ms};
}
const ids=cards=>Array.from(cards,c=>c.id);

test('v1 state migrates without losing independent reading, tags, tasks or notes',()=>{
 const {Store,data}=fixture({version:1,items:{'article-01':{seen:true,read:false,progress:.4,bookmarked:true,tagsEdited:true,tags:['自定义'],note:'保留备注'},'task-01':{taskDone:['t2']}},seconds:42,reduceTransparency:true});
 assert.equal(Store.item('article-01').progress,.4);assert.equal(Store.item('article-01').read,false);
 assert.deepEqual(Array.from(Store.tags(Store.card('article-01'))),['自定义']);
 assert.equal(Store.item('article-01').note,'保留备注');assert.equal(Store.item('article-01').bookmarked,true);
 assert.deepEqual(Array.from(Store.tasks(Store.card('task-01')).filter(t=>t.done),t=>t.id),['t2']);
 assert.equal(Store.state.seconds,42);assert.equal(Store.state.preferences.reduceTransparency,true);
 assert.equal(JSON.parse(data.get(Store.key)).version,2);
});
test('reload preserves the original demo clock, snooze deadline and ordering preference',()=>{
 const f=fixture(),due=f.Store.card('reminder-01').due;
 f.app.changeReminder('reminder-01','snooze');f.Store.state.preferences.sort='time';f.Store.save();
 const g=fixture(f.data.get(f.Store.key),f.now()+300000);
 assert.equal(g.Store.card('reminder-01').due,due);
 assert.equal(g.Store.item('reminder-01').snoozedUntil,f.now()+600000);
 assert.equal(g.Store.state.preferences.sort,'time');
});
test('storage corruption and unavailable storage leave the demo usable',()=>{
 const f=fixture('{');assert.equal(f.Store.state.cards.length,16);
 f.context.localStorage.setItem=()=>{throw Error('denied');};
 f.Store.patch('article-01',{bookmarked:true});assert.equal(f.Store.state.storageAvailable,false);
 assert.equal(f.Store.item('article-01').bookmarked,true);
});
test('malformed persisted fields are bounded and unknown card IDs are discarded',()=>{
 const {Store}=fixture({version:2,items:{'reminder-01':{snoozedUntil:'tomorrow',lastNotifiedAt:Infinity,note:1,tags:[1,'safe'],progress:-3},unknown:{read:true}},sort:'invalid',freshIds:['missing','fresh-note','fresh-note']});
 const s=Store.item('reminder-01');assert.equal(s.snoozedUntil,0);assert.equal(s.progress,0);assert.equal(s.note,'');
 assert.deepEqual(Array.from(s.tags),['safe']);assert.equal(Store.state.items.unknown,undefined);
 assert.equal(Store.state.preferences.sort,'priority');assert.equal(Store.state.cards.length,17);
});
test('repeated load resets removed flags rather than retaining stale in-memory state',()=>{
 const {Store,data}=fixture();Store.patch('article-01',{bookmarked:true});data.clear();Store.load();
 assert.equal(Store.item('article-01').bookmarked,false);
});
test('refresh insertion deduplicates IDs and restores new-card flags and timestamps',()=>{
 const f=fixture(),card={...f.FreshCards[0],time:f.now()+120000};
 assert.equal(f.Store.insert([card,card]),1);assert.equal(f.Store.insert([card]),0);
 f.Store.patch(card.id,{bookmarked:true});
 const g=fixture(f.data.get(f.Store.key),f.now()+600000);
 assert.equal(g.Store.state.cards.length,17);assert.equal(g.Store.card(card.id).time,card.time);
 assert.equal(g.Store.item(card.id).bookmarked,true);
});
test('priority, unread and time sorts are stable, immutable and deduplicated',()=>{
 const {FeedPolicy:p,now}=fixture();
 const cards=[{id:'a',type:'article',time:3},{id:'b',type:'reminder',due:now()-1,time:1},{id:'c',type:'article',time:2}];
 assert.deepEqual(ids(p.sort(cards,'priority',{},now())),['b','a','c']);
 assert.deepEqual(ids(p.sort(cards,'unread',{a:{read:true}},now())),['b','c','a']);
 assert.deepEqual(ids(p.sort(cards,'time',{},now())),['a','c','b']);
 assert.deepEqual(ids(cards),['a','b','c']);assert.equal(p.sort([...cards,cards[0]],'priority',{},now()).length,3);
});
test('event and task notification thresholds exclude ended and completed work',()=>{
 const {FeedPolicy:p,now}=fixture(),n=now();
 const event={id:'e',type:'event',start:n+15*60000,end:n+30*60000};
 assert.equal(p.eligible(event,{},n),true);assert.equal(p.eligible(event,{},n-1),false);
 assert.equal(p.eligible(event,{},event.end),false);
 const task={id:'t',type:'task',due:n+30*60000,tasks:[{id:'1',done:false}]};
 assert.equal(p.eligible(task,{},n),true);assert.equal(p.eligible(task,{taskDone:['1']},n),false);
 assert.equal(p.eligible({...task,due:undefined},{},n),false);
});
test('one occurrence is not delivered twice; cooldown gates a changed occurrence',()=>{
 const {FeedPolicy:p,now}=fixture(),c={id:'r',type:'reminder',due:now()-100};
 assert.equal(p.eligible(c,{lastReminderKey:p.key(c)},now()),false);
 assert.equal(p.eligible(c,{lastReminderKey:'old',lastNotifiedAt:now()-59999},now()),false);
 assert.equal(p.eligible(c,{lastReminderKey:'old',lastNotifiedAt:now()-60000},now()),true);
});
test('snooze remains hidden until explicit confirmation, including across reload',()=>{
 const f=fixture();f.app.changeReminder('reminder-01','snooze');
 assert.equal(f.app.filtered().some(c=>c.id==='reminder-01'),false);
 f.advance(600001);f.app.checkReminders();f.app.checkReminders();
 assert.equal(f.app.pendingReminders.filter(id=>id==='reminder-01').length,1);
 assert.equal(f.app.filtered().some(c=>c.id==='reminder-01'),false);
 const g=fixture(f.data.get(f.Store.key),f.now());g.app.checkReminders();
 assert.equal(g.app.pendingReminders.includes('reminder-01'),true);
 g.app.showNew();assert.equal(g.app.filtered().some(c=>c.id==='reminder-01'),true);
 g.app.checkReminders();assert.equal(g.app.pendingReminders.includes('reminder-01'),false);
 const h=fixture(g.data.get(g.Store.key),g.now()+60000);h.app.checkReminders();
 assert.equal(h.app.pendingReminders.includes('reminder-01'),false);
});
test('timer queues reminders without rendering, reordering or changing read state',()=>{
 const f=fixture(),before=ids(f.app.filtered());f.advance(600001);f.app.checkReminders();
 assert.equal(f.app.renders,0);assert.deepEqual(ids(f.app.filtered()),before);
 assert.equal(f.Store.item('reminder-01').read,false);assert.equal(f.Store.item('reminder-01').seen,false);
});
test('reading or dragging prevents pending content insertion',()=>{
 const f=fixture();f.advance(600001);f.app.checkReminders();
 f.app.dialog.open=true;f.app.showNew();assert.equal(f.app.renders,0);
 f.app.dialog.open=false;f.app.drag.active={};f.app.showNew();assert.equal(f.app.renders,0);
});
test('dismiss, complete, restore and undo preserve unrelated content state',()=>{
 const f=fixture(),id='reminder-01';f.Store.patch(id,{bookmarked:true,note:'保留'});
 for(const action of ['dismiss-reminder','complete-reminder']){
  f.app.changeReminder(id,action);assert.equal(f.app.filtered().some(c=>c.id===id),false);
  f.app.filter.status=action==='dismiss-reminder'?'dismissed':'done';
  assert.equal(f.app.filtered().some(c=>c.id===id),true);
  f.app.filter.status='all';f.app.undoAction();assert.equal(f.app.filtered().some(c=>c.id===id),true);
 }
 f.app.changeReminder(id,'snooze');f.app.changeReminder(id,'restore-reminder');
 assert.equal(f.app.filtered().some(c=>c.id===id),true);
 assert.equal(f.Store.item(id).bookmarked,true);assert.equal(f.Store.item(id).note,'保留');assert.equal(f.Store.item(id).read,false);
});
test('snoozed and dismissed views compose with type, tag and search filters',()=>{
 const f=fixture();f.app.changeReminder('reminder-01','snooze');
 f.app.filter={type:'reminder',status:'snoozed',tag:'生活',query:'空档'};
 assert.deepEqual(ids(f.app.filtered()),['reminder-01']);
 f.app.filter.query='不存在';assert.deepEqual(ids(f.app.filtered()),[]);
});
test('explicit pending confirmation respects current filters and never duplicates cards',()=>{
 const f=fixture();f.advance(600001);f.app.checkReminders();
 f.app.pendingCards=[f.FreshCards[0],f.FreshCards[0]];f.app.filter.type='mail';f.app.showNew();
 assert.equal(f.Store.state.cards.length,17);assert.equal(f.app.filtered().every(c=>c.type==='mail'),true);
 f.app.checkReminders();assert.equal(f.app.pendingReminders.length,0);
});

test('duplicate popstate/hashchange does not close a newly opened local panel',()=>{
 const f=fixture();f.context.location={hash:'#feed'};let closes=0;
 f.app.closeNative=()=>closes++;
 f.app.route();assert.equal(closes,1);
 f.app.modalKind='editor';f.app.route();assert.equal(closes,1);
 f.app.route(true);assert.equal(closes,2);
});

test('actual touch opens tools first even when device reports hover capability',()=>{
 const f=fixture();f.context.matchMedia=()=>({matches:false});let tools=0,ai=0;
 f.app.openDock=()=>tools++;f.app.openAI=()=>ai++;
 f.app.action('orb','','',null,{pointerType:'touch'});assert.equal(tools,1);assert.equal(ai,0);
 f.app.action('orb','','',null,{pointerType:'touch'});assert.equal(ai,1);
});

/** Pure feed policy. Clock and item state are supplied by the caller. */
const FeedPolicy = {
 sorts:['priority','unread','time'],
 // Time sinks cards. A read card leaves the desk after the archive delay; an untouched one after two weeks.
 // Nothing is deleted: both shelves stay searchable and any card can be put back.
 archiveDelay(pref){return pref==='3d'?3*86400000:pref==='never'?Infinity:7*86400000;},
 shelf(c,s,now,pref='7d'){
   if(s.archived)return 'read';
   if(['task','event','reminder'].includes(c.type))return 'desk';
   if(s.restoredAt&&now-s.restoredAt<7*86400000)return 'desk';
   if(s.bookmarked||s.later)return 'desk';
   if(s.read)return now-(s.readAt||c.time||now)>=this.archiveDelay(pref)?'read':'desk';
   return !s.seen&&now-(c.time||now)>=14*86400000?'stale':'desk';
 },
 // More than five cards from one source within an hour fold into one stack.
 stackThreshold:5,
 stacks(cards,items){
   const groups=new Map();
   for(const c of cards){
     if(!['article','media'].includes(c.type)||!c.source||['ai','capture'].includes(c.kind))continue;
     const key=c.kind+':'+c.source;(groups.get(key)||groups.set(key,[]).get(key)).push(c);
   }
   const result=new Map();
   for(const [key,list] of groups){
     const sorted=list.slice().sort((a,b)=>(b.time||0)-(a.time||0));
     const recent=sorted.filter(c=>(sorted[0].time||0)-(c.time||0)<=3600000&&!items[c.id]?.read);
     if(recent.length>this.stackThreshold)result.set(key,recent);
   }
   return result;
 },

 cooldown:60000,
 supports(c){return ['reminder','event','task'].includes(c.type);},
 trigger(c,s={}){
   if(s.snoozedUntil>0)return s.snoozedUntil;
   if(c.type==='event')return Number(c.start)-15*60000;
   if(c.type==='task')return Number(c.due)-30*60000;
   return c.type==='reminder'?Number(c.due):NaN;
 },
 key(c,s={}){return `${c.id}:${this.trigger(c,s)}`;},
 completed(c,s={}){
   if(s.reminderDone)return true;
   return c.type==='task'&&c.tasks?.length>0&&c.tasks.every(t=>s.taskDone?s.taskDone.includes(t.id):t.done);
 },
 eligible(c,s,now){
   const at=this.trigger(c,s);
   return this.supports(c)&&Number.isFinite(at)&&at>0&&at<=now&&
     !s.dismissed&&!this.completed(c,s)&&!(c.type==='event'&&c.end<=now)&&
     s.lastReminderKey!==this.key(c,s)&&(!s.lastNotifiedAt||now-s.lastNotifiedAt>=this.cooldown);
 },
 visible(c,s,status='all'){
   if(status==='snoozed')return s.snoozedUntil>0&&!s.dismissed&&!s.reminderDone;
   if(status==='dismissed')return !!s.dismissed;
   if(status==='done')return !!s.reminderDone;
   return !s.snoozedUntil&&!s.dismissed&&!s.reminderDone;
 },
 score(c,s,now){
   if(s.dismissed||this.completed(c,s))return -1;
   const at=this.trigger(c,s);
   const urgent=Number.isFinite(at)&&at<=now&&!(c.type==='event'&&c.end<=now);
   // Things about to happen float up: a reminder within 15 minutes, a meeting within 30.
   const start=c.type==='event'?c.start:at,soon=!urgent&&Number.isFinite(start)&&start>now&&start-now<=(c.type==='event'?30:15)*60000;
   return (urgent?100:0)+(soon?50:0)+Math.max(0,Math.min(10,Number(c.priority)||0));
 },
 sort(cards,mode,items,now){
   const unique=[...new Map(cards.map(c=>[c.id,c])).values()];
   return unique.map((c,index)=>({c,index})).sort((a,b)=>{
     const x=items[a.c.id]||{},y=items[b.c.id]||{};
     if(mode==='time')return (b.c.time||0)-(a.c.time||0)||a.index-b.index;
     if(mode==='unread')return Number(!!x.read)-Number(!!y.read)||a.index-b.index;
     return this.score(b.c,y,now)-this.score(a.c,x,now)||a.index-b.index;
   }).map(x=>x.c);
 },
 label(c,s,now){
   if(s.dismissed)return '已忽略提醒';
   if(s.reminderDone)return '提醒已完成';
   const at=s.snoozedUntil||c.due;
   if(!Number.isFinite(at))return c.meta||'提醒';
   const minutes=Math.ceil((at-now)/60000);
   return minutes>0?`${minutes} 分钟后${s.snoozedUntil?' · 已延后':''}`:s.snoozedUntil?'已到期 · 等待查看':'现在可以处理';
 }
};

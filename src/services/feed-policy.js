/** Pure feed policy. Clock and item state are supplied by the caller. */
const FeedPolicy = {
 sorts:['priority','unread','time'],
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
   return (urgent?100:0)+Math.max(0,Math.min(10,Number(c.priority)||0));
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

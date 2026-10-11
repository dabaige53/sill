/** Browser-local demo state. v2 keeps v1 reading flags and adds reminder lifecycle. */
const Store = {
 key:'quiet-glass-v1', // Keep the original key so existing users migrate in place.
 state:{cards:[],items:{},seconds:0,demoStartedAt:demoBase,freshIds:[],preferences:{reduceTransparency:false,sort:'priority'},storageAvailable:true},
 load(){
   this.state={cards:[],items:{},seconds:0,demoStartedAt:demoBase,freshIds:[],preferences:{reduceTransparency:false,sort:'priority'},storageAvailable:true};
   let raw=null;
   try{raw=JSON.parse(localStorage.getItem(this.key)||'null');}
   catch{this.state.storageAvailable=false;}
   const valid=raw&&[1,2].includes(raw.version)&&raw.items&&typeof raw.items==='object'&&!Array.isArray(raw.items);
   if(valid){
     if(Number.isFinite(raw.demoStartedAt)&&raw.demoStartedAt>0)this.state.demoStartedAt=raw.demoStartedAt;
     this.state.freshIds=Array.isArray(raw.freshIds)?[...new Set(raw.freshIds.filter(id=>FreshCards.some(c=>c.id===id)))]:[];
     this.state.seconds=Math.max(0,Math.min(1e7,Number(raw.seconds)||0));
     this.state.preferences.reduceTransparency=!!raw.reduceTransparency;
     this.state.preferences.sort=FeedPolicy.sorts.includes(raw.sort)?raw.sort:'priority';
   }
   const offset=this.state.demoStartedAt-demoBase;
   this.state.cards=[...this.state.freshIds.map(id=>FreshCards.find(c=>c.id===id)),...SeedCards].map(c=>{
     const card={...c,tasks:c.tasks?.map(t=>({...t}))};
     for(const key of ['time','start','end','due'])if(Number.isFinite(card[key]))card[key]+=offset;
     return card;
   });
   if(valid){
     // Live cards arrive after authentication; restore their browser-local notes too.
     const restoredCards=window.__QG_RUNTIME__?Object.keys(raw.items).map(id=>({id})):this.state.cards;
     for(const c of restoredCards){
       const x=raw.items[c.id];if(!x||typeof x!=='object'||Array.isArray(x))continue;
       const timestamp=n=>Number.isFinite(n)&&n>0&&n<8.64e15?n:0;
       this.state.items[c.id]={
         seen:!!x.seen,read:!!x.read,bookmarked:!!x.bookmarked,later:!!x.later,tagsEdited:!!x.tagsEdited,
         progress:Math.max(0,Math.min(1,Number(x.progress)||0)),
         note:typeof x.note==='string'?x.note.slice(0,4000):'',
         tags:Array.isArray(x.tags)?x.tags.filter(s=>typeof s==='string').map(s=>s.slice(0,30)).slice(0,20):[],
         taskDone:Array.isArray(x.taskDone)?x.taskDone.filter(s=>typeof s==='string'):undefined,
         addedAt:timestamp(x.addedAt),snoozedUntil:timestamp(x.snoozedUntil),dismissed:!!x.dismissed,reminderDone:!!x.reminderDone,
         lastReminderKey:typeof x.lastReminderKey==='string'?x.lastReminderKey.slice(0,200):'',
         lastNotifiedAt:timestamp(x.lastNotifiedAt)
       };
       if(this.state.freshIds.includes(c.id)&&this.state.items[c.id].addedAt)c.time=this.state.items[c.id].addedAt;
     }
   }
   this.save(); // Persist the demo clock even when there has been no interaction yet.
   return this.state;
 },
 item(id){
   if(!this.state.items[id])this.state.items[id]={seen:false,read:false,bookmarked:false,later:false,progress:0,note:'',tags:[],snoozedUntil:0,dismissed:false,reminderDone:false,lastReminderKey:'',lastNotifiedAt:0};
   return this.state.items[id];
 },
 card(id){return this.state.cards.find(c=>c.id===id);},
 patch(id,values){Object.assign(this.item(id),values);this.save();},
 tags(c){const s=this.item(c.id);return s.tagsEdited?[...s.tags]:[...new Set([...(c.tags||[]),...s.tags])];},
 tasks(c){
   const done=this.item(c.id).taskDone;
   return (c.tasks||[]).map(t=>({...t,done:done?done.includes(t.id):t.done}));
 },
 insert(cards){
   const known=new Set(this.state.cards.map(c=>c.id));
   const additions=cards.filter(c=>{if(known.has(c.id))return false;known.add(c.id);return true;});
   this.state.cards=[...additions,...this.state.cards];
   for(const c of additions)this.item(c.id).addedAt=c.time;
   this.state.freshIds=this.state.cards.filter(c=>FreshCards.some(f=>f.id===c.id)).map(c=>c.id);
   this.save();return additions.length;
 },
 save(){
   try{localStorage.setItem(this.key,JSON.stringify({version:2,items:this.state.items,seconds:this.state.seconds,demoStartedAt:this.state.demoStartedAt,freshIds:this.state.freshIds,sort:this.state.preferences.sort,reduceTransparency:this.state.preferences.reduceTransparency}));}
   catch{this.state.storageAvailable=false;}
 },
 stats(){
   return {read:this.state.cards.filter(c=>this.item(c.id).read).length,
     saved:this.state.cards.filter(c=>this.item(c.id).bookmarked).length,
     done:this.state.cards.filter(c=>c.type==='task'&&this.tasks(c).every(t=>t.done)).length};
 }
};

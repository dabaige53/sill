class FeedLayout{
 constructor(container){
   this.container=container;this.frame=0;
   this.onResize=()=>this.schedule(false);
   window.addEventListener('resize',this.onResize,{passive:true});
 }
 schedule(animate=false){
   cancelAnimationFrame(this.frame);
   this.frame=requestAnimationFrame(()=>this.layout(animate));
 }
 layout(animate=false){
   const el=this.container,width=el.clientWidth;
   const items=[...el.querySelectorAll(':scope > .feed-card,:scope > .lab-card')];
   if(!items.length){el.style.height='';return;}
   const cols=width>=1200?4:width>=860?3:width>=580?2:1,gap=18,w=(width-(cols-1)*gap)/cols;
   const old=animate?new Map(items.map(n=>[n,n.getBoundingClientRect()])):null;
   items.forEach(n=>{n.style.width=w+'px';});
   const heights=Array(cols).fill(0);
   items.forEach(n=>{
     const col=heights.indexOf(Math.min(...heights));
     n.style.left=(col*(w+gap))+'px';n.style.top=heights[col]+'px';
     heights[col]+=n.offsetHeight+gap;
   });
   el.style.height=Math.max(...heights)+'px';
   if(old)items.forEach(n=>MotionEngine.flip(n,old.get(n)));
 }
}

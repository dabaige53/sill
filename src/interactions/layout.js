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
   if(el.classList.contains('is-catalog')){el.style.height='';return;}
   const items=[...el.querySelectorAll(':scope > .feed-card,:scope > .lab-card')];
   if(!items.length){el.style.height='';return;}
   if(!width)return;
   // A consistent column width lets content, rather than automatic spanning,
   // establish hierarchy. Short actions stay compact; reading cards have room.
   const cols=width>=1000?3:width>=650?2:1,gap=cols===1?16:24,w=(width-(cols-1)*gap)/cols;
   const old=animate?new Map(items.map(n=>[n,n.getBoundingClientRect()])):null;
   el.dataset.columns=cols;
   items.forEach(n=>{
     n.classList.remove('is-featured');
     n.style.width=w+'px';
   });
   const heights=Array(cols).fill(0);
   items.forEach(n=>{
     const span=1;
     let col=0,y=Infinity;
     for(let i=0;i<=cols-span;i++){
       const candidate=Math.max(...heights.slice(i,i+span));
       if(candidate<y){col=i;y=candidate;}
     }
     n.style.left=(col*(w+gap))+'px';n.style.top=y+'px';
     for(let i=col;i<col+span;i++)heights[i]=y+n.offsetHeight+gap;
   });
   el.style.height=(Math.max(...heights)-gap)+'px';
   if(old)items.forEach(n=>MotionEngine.flip(n,old.get(n)));
 }
}

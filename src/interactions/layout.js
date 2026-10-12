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
   const items=[...el.querySelectorAll(':scope > .feed-card')];
   if(!items.length){el.style.height='';return;}
   if(!width)return;
   // A consistent column width lets content, rather than automatic spanning,
   // establish hierarchy. Short actions stay compact; reading cards have room.
   const cols=width>=480?Math.max(2,Math.floor((width+18)/258)):1,gap=cols===1?16:18;
   const old=animate?new Map(items.map(n=>[n,n.getBoundingClientRect()])):null;
   el.dataset.columns=cols;
   items.forEach(n=>{
     n.classList.remove('is-featured');
     // Keep horizontal geometry inside the container before resize/RAF runs.
     n.style.width=`calc((100% - ${(cols-1)*gap}px) / ${cols})`;
   });
   const heights=Array(cols).fill(0);
   items.forEach(n=>{
     const span=1;
     let col=0,y=Infinity;
     for(let i=0;i<=cols-span;i++){
       const candidate=Math.max(...heights.slice(i,i+span));
       if(candidate<y){col=i;y=candidate;}
     }
     n.style.left=`calc((100% + ${gap}px) / ${cols} * ${col})`;n.style.top=y+'px';
     for(let i=col;i<col+span;i++)heights[i]=y+n.offsetHeight+gap;
   });
   el.style.height=(Math.max(...heights)-gap)+'px';
   if(old)items.forEach(n=>MotionEngine.flip(n,old.get(n)));
 }
}

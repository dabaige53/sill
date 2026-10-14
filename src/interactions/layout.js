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
   let cols=width>=480?Math.max(2,Math.floor((width+18)/258)):1;
   // The 240px target must not expand a two-column tablet layout past 300px.
   // Add a column only when it still has at least 200px; otherwise centre capped cards.
   if(cols>1&&(width-(cols-1)*18)/cols>300&&(width-cols*18)/(cols+1)>=200)cols++;
   const gap=cols===1?16:18,cardWidth=cols===1?width:Math.min(300,(width-(cols-1)*gap)/cols);
   const inset=(width-(cols*cardWidth+(cols-1)*gap))/2;
   const old=animate?new Map(items.map(n=>[n,n.getBoundingClientRect()])):null;
   el.dataset.columns=cols;
   items.forEach(n=>{
     n.classList.remove('is-featured');
     // Recompute bounded geometry together on every layout/resize.
     n.style.width=cardWidth+'px';
   });
   const heights=Array(cols).fill(0);
   items.forEach(n=>{
     const span=1;
     let col=0,y=Infinity;
     for(let i=0;i<=cols-span;i++){
       const candidate=Math.max(...heights.slice(i,i+span));
       if(candidate<y){col=i;y=candidate;}
     }
     n.style.left=(inset+(cardWidth+gap)*col)+'px';n.style.top=y+'px';
     for(let i=col;i<col+span;i++)heights[i]=y+n.offsetHeight+gap;
   });
   el.style.height=(Math.max(...heights)-gap)+'px';
   if(old)items.forEach(n=>MotionEngine.flip(n,old.get(n)));
 }
}

class FeedLayout{
 constructor(container){
   this.container=container;this.frame=0;this.animateNext=false;
   this.onResize=()=>this.schedule(false);
   window.addEventListener('resize',this.onResize,{passive:true});
   // Embedded workspaces can resize without a window resize event.
   this.observedWidth=container.clientWidth;
   this.observer=new ResizeObserver(entries=>{
     const width=entries[0].contentRect.width;
     if(Math.abs(width-this.observedWidth)<1)return;
     this.observedWidth=width;this.schedule(false);
   });
   this.observer.observe(container);
 }
 schedule(animate=false){
   this.animateNext=this.animateNext||animate;
   if(this.frame)return;
   this.frame=requestAnimationFrame(()=>{const next=this.animateNext;this.frame=0;this.animateNext=false;this.layout(next);});
 }
 layout(animate=false){
   const el=this.container,width=el.clientWidth;
   const items=[...el.querySelectorAll(':scope > .feed-item')];
   if(!items.length){el.style.height='';return;}
   if(!width)return;
   // Sill columns: never narrower than the density minimum, never wider than its maximum.
   // A narrow screen keeps one full-width column; a wide one centres the columns it can fill.
   const [min,max]={compact:[240,320],standard:[280,380],roomy:[340,440]}[document.body.dataset.density]||[280,380];
   const single=width<min*2+24,gap=single?16:24,cols=single?1:Math.max(2,Math.floor((width+gap)/(min+gap)));
   const col=single?width:Math.min(max,(width-(cols-1)*gap)/cols),inset=single?0:(width-(cols*col+(cols-1)*gap))/2;
   const old=animate?new Map(items.map(n=>[n,n.getBoundingClientRect()])):null;
   el.dataset.columns=cols;
   items.forEach(n=>{n.style.width=col+'px';});
   // Measure once after setting every width, then write positions together.
   // Interleaving offsetHeight and top/left forces a layout for each card.
   const sizes=items.map(n=>n.offsetHeight),heights=Array(cols).fill(0);
   items.forEach((n,index)=>{
     let c=0;for(let i=1;i<cols;i++)if(heights[i]<heights[c]-1)c=i;
     n.style.left=(inset+c*(col+gap))+'px';n.style.top=heights[c]+'px';
     heights[c]+=sizes[index]+gap+(n.classList.contains('stack-card')?10:0);
   });
   el.style.height=(Math.max(...heights)-gap)+'px';
   if(old){const next=items.map(n=>n.getBoundingClientRect());items.forEach((n,i)=>MotionEngine.flip(n,old.get(n),next[i]));}
 }
}

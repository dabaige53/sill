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
   // A single editorial card gives the feed a focal point. Span placement still
   // follows DOM order, so priorities and keyboard order retain their meaning.
   const cols=width>=1080?3:width>=650?2:1,gap=cols===1?16:20,w=(width-(cols-1)*gap)/cols;
   const old=animate?new Map(items.map(n=>[n,n.getBoundingClientRect()])):null;
   const feature=cols===3?items.slice(0,3).find(n=>n.matches('.type-article.form-image')):null;
   el.dataset.columns=cols;
   items.forEach(n=>{
     const featured=n===feature;
     n.classList.toggle('is-featured',featured);
     n.style.width=(featured?w*2+gap:w)+'px';
   });
   const heights=Array(cols).fill(0);
   items.forEach(n=>{
     const span=n===feature?2:1;
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

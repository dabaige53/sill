const MotionEngine={
 query:matchMedia('(prefers-reduced-motion: reduce)'),
 panelAnimations:new WeakMap(),
 layoutAnimations:new WeakMap(),
 get reduced(){return this.query.matches||!!document.body?.classList.contains('reduce-motion');},
 animate(el,keyframes,options={}){
   if(!el||!el.animate)return null;
   if(this.reduced){
     const opacity=keyframes.map(k=>({opacity:k.opacity??1}));
     return el.animate(opacity,{duration:70,easing:'linear',...options,delay:0,duration:70});
   }
   return el.animate(keyframes,{duration:260,easing:'cubic-bezier(.2,.75,.25,1)',...options});
 },
 enter(el,delay=0){return this.animate(el,[{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],{duration:280,delay,fill:'backwards'});},
 // New cards drop in from above: the one motion for arrivals.
 drop(el,delay=0){return this.animate(el,[{opacity:0,transform:'translateY(-14px)'},{opacity:1,transform:'translateY(0)'}],{duration:360,delay});},
 press(el){return this.animate(el,[{transform:'scale(1)'},{transform:'scale(.93)',offset:.35},{transform:'scale(1)'}],{duration:240});},
 capture(el){
   if(!el)return null;
   const rect=el.getBoundingClientRect();
   if(!rect.width||!rect.height||rect.bottom<0||rect.top>innerHeight)return null;
   const title=el.querySelector('[data-shared="title"]')||el.querySelector('.card-title-button,h2,h1');
   return {el,id:el.dataset.card||'',rect,title:title?.getBoundingClientRect(),radius:getComputedStyle(el).borderTopLeftRadius};
 },
 // The card that is open leaves an empty place on the desk until it lands back.
 lift(id){
   let style=document.getElementById('lift-style');
   if(!id){style?.remove();return;}
   if(!style){style=document.createElement('style');style.id='lift-style';document.head.appendChild(style);}
   style.textContent=`[data-card="${CSS.escape(id)}"]:not(dialog *){opacity:0!important;transition:none!important}`;
 },
 phoneSheet(el){return el.classList.contains('preview')&&matchMedia('(max-width:650px)').matches&&!!el.querySelector('.preview-sheet');},
 surface(dialog){return dialog.classList.contains('reader')?dialog:dialog.querySelector('.preview-sheet')||dialog;},
 cancelPanel(el){
   (this.panelAnimations.get(el)||[]).forEach(animation=>animation?.cancel());
   this.panelAnimations.delete(el);
 },
 openPanel(el,origin){
   this.cancelPanel(el);
   const sheet=this.surface(el),bar=el.querySelector(':scope > .float-bar, .reader .float-bar');
   // Phone: the preview is a sheet rising from the bottom edge; its position is a CSS transition, the dim fades in with it.
   if(this.phoneSheet(el)){
     if(this.reduced){this.panelAnimations.set(el,[this.enter(el)]);return;}
     sheet.classList.add('is-drag','is-off');el.style.setProperty('--backdrop','0');bar?.classList.add('is-hidden');
     void sheet.offsetHeight;
     requestAnimationFrame(()=>{sheet.classList.remove('is-drag','is-off');el.style.removeProperty('--backdrop');setTimeout(()=>bar?.classList.remove('is-hidden'),140);});
     this.panelAnimations.set(el,[...sheet.querySelectorAll(':is(.preview-body,.reader-body)>:not(h1,.preview-meta,.preview-sender)')].map(n=>n.animate([{opacity:0},{opacity:1}],{duration:280,delay:200,easing:'linear',fill:'backwards'})));
     return;
   }
   // Keep text at its final size. Scaling a cloned card over the detail sheet
   // creates two text layers and clips short notes during the transition.
   const animations=[this.enter(sheet)];
   if(bar&&bar!==sheet)animations.push(this.enter(bar));
   this.panelAnimations.set(el,animations);
 },
 closePanel(el,origin,done=()=>{}){
   this.cancelPanel(el);
   done();
 },
 flip(el,oldRect,newRect){
   this.layoutAnimations.get(el)?.cancel();
   this.layoutAnimations.delete(el);
   const now=newRect||el.getBoundingClientRect(),x=oldRect.left-now.left,y=oldRect.top-now.top;
   if(Math.abs(x)+Math.abs(y)>1)this.layoutAnimations.set(el,this.animate(el,[{transform:`translate(${x}px,${y}px)`},{transform:'translate(0,0)'}],{duration:320}));
 },
 pulse(el){return this.animate(el,[{transform:'scale(1)'},{transform:'scale(1.08)',offset:.5},{transform:'scale(1)'}],{duration:350});}
};

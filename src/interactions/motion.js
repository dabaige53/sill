const MotionEngine={
 query:matchMedia('(prefers-reduced-motion: reduce)'),
 panelAnimations:new WeakMap(),
 layoutAnimations:new WeakMap(),
 returnLayers:new Set(),
 get reduced(){return this.query.matches||!!document.body?.classList.contains('reduce-motion');},
 animate(el,keyframes,options={}){
   if(!el||!el.animate)return null;
   if(this.reduced){
     const opacity=keyframes.map(k=>({opacity:k.opacity??1}));
     return el.animate(opacity,{duration:70,easing:'linear',...options,delay:0,duration:70});
   }
   return el.animate(keyframes,{duration:260,easing:'cubic-bezier(.2,.75,.25,1)',...options});
 },
 enter(el,delay=0){return this.animate(el,[{opacity:0,transform:'translateY(10px) scale(.985)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:320,delay});},
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
 // A copy of the card laid over the top of the morphing surface: under the surface's start transform it sits exactly on the card.
 ghost(origin,host,s){
   if(!origin?.el?.matches?.('[data-card]'))return null;
   const ghost=document.createElement('div'),copy=origin.el.cloneNode(true),r=origin.rect;
   ghost.className='motion-ghost';ghost.setAttribute('aria-hidden','true');ghost.inert=true;
   copy.classList.remove('feed-item');
   [copy,...copy.querySelectorAll('*')].forEach(n=>['id','data-card','data-action','data-id','tabindex','aria-label'].forEach(k=>n.removeAttribute(k)));
   Object.assign(copy.style,{position:'relative',left:'0',top:'0',width:'100%',height:'100%',margin:'0',transform:'none',animation:'none'});
   if(getComputedStyle(host).position==='static')host.style.position='relative';
   Object.assign(ghost.style,{position:'absolute',left:'0',top:'0',width:r.width+'px',height:r.height+'px',margin:'0',zIndex:'60',pointerEvents:'none',transformOrigin:'0 0',transform:`scale(${1/s})`});
   ghost.appendChild(copy);host.appendChild(ghost);return ghost;
 },
 // Transform that puts a surface of rect `r` exactly over `from`: scaled by width, the rest cropped.
 morph(r,from,radius){
   const s=from.width/r.width,crop=Math.max(0,r.height-from.height/s);
   return {s,transform:`translate(${from.left-r.left}px,${from.top-r.top}px) scale(${s})`,clipPath:`inset(0 0 ${crop}px 0 round ${parseFloat(radius||22)/s}px)`};
 },
 cancelPanel(el){
   (this.panelAnimations.get(el)||[]).forEach(animation=>animation?.cancel());
   this.panelAnimations.delete(el);
   el?.querySelectorAll?.('.motion-ghost').forEach(n=>n.remove());
 },
 clearReturns(){
   this.returnLayers.forEach(layer=>{layer.getAnimations().forEach(a=>a.cancel());layer.remove();});
   this.returnLayers.clear();
 },
 openPanel(el,origin){
   this.cancelPanel(el);this.clearReturns();
   const from=origin?.rect,sheet=this.surface(el),bar=el.querySelector(':scope > .float-bar, .reader .float-bar');
   // Phone: the preview is a sheet rising from the bottom edge; its position is a CSS transition, the dim fades in with it.
   if(this.phoneSheet(el)){
     if(this.reduced){this.panelAnimations.set(el,[this.enter(el)]);return;}
     sheet.classList.add('is-drag','is-off');el.style.setProperty('--backdrop','0');bar?.classList.add('is-hidden');
     void sheet.offsetHeight;
     requestAnimationFrame(()=>{sheet.classList.remove('is-drag','is-off');el.style.removeProperty('--backdrop');setTimeout(()=>bar?.classList.remove('is-hidden'),140);});
     this.panelAnimations.set(el,[...sheet.querySelectorAll(':is(.preview-body,.reader-body)>:not(h1,.preview-meta,.preview-sender)')].map(n=>n.animate([{opacity:0},{opacity:1}],{duration:280,delay:200,easing:'linear',fill:'backwards'})));
     return;
   }
   if(!from||this.reduced){this.panelAnimations.set(el,[this.enter(el)]);return;}
   if(origin.id)this.lift(origin.id);
   const r=sheet.getBoundingClientRect(),m=this.morph(r,from,origin.radius),end=getComputedStyle(sheet).borderTopLeftRadius||'28px';
   const timing={duration:460,easing:'cubic-bezier(.22,.9,.24,1)'};
   const animations=[
     sheet.animate([{transform:m.transform,clipPath:m.clipPath,transformOrigin:'0 0'},{transform:'none',clipPath:`inset(0 0 0 0 round ${end})`,transformOrigin:'0 0'}],timing),
     el.animate([{opacity:0},{opacity:1}],{duration:300,easing:'ease-out',pseudoElement:'::backdrop'})
   ];
   // The card itself rides along and dissolves into the sheet.
   const ghost=this.ghost(origin,sheet,m.s);
   if(ghost){
     const g=ghost.animate([{opacity:1},{opacity:0,offset:.5},{opacity:0}],timing);
     const drop=()=>{ghost.remove();if(sheet.style.position==='relative')sheet.style.position='';};
     g.finished.then(drop,drop);animations.push(g);
   }
   // The title arrives with the card; the text settles in just after.
   sheet.querySelectorAll(':is(.preview-body,.reader-body)>:not(h1,.preview-meta,.preview-sender),.player>:not(h1,.player-art)').forEach(n=>animations.push(n.animate([{opacity:0,translate:'0 6px'},{opacity:1,translate:'0 0'}],{duration:260,delay:180,easing:'ease-out',fill:'backwards'})));
   if(bar&&bar!==sheet)animations.push(bar.animate([{opacity:0,translate:'0 14px'},{opacity:1,translate:'0 0'}],{duration:280,delay:220,easing:'cubic-bezier(.2,.75,.25,1)',fill:'backwards'}));
   this.panelAnimations.set(el,animations);
 },
 // Called before dialog.close(): a copy of the sheet shrinks back into the card on the desk.
 closePanel(el,origin,done=()=>{}){
   const sheet=this.surface(el),r=sheet.getBoundingClientRect(),style=getComputedStyle(sheet);
   this.cancelPanel(el);this.clearReturns();
   if(this.reduced||!origin?.rect||!el.animate){done();return;}
   const layer=document.createElement('div');layer.className='motion-return';layer.setAttribute('aria-hidden','true');layer.inert=true;
   Object.assign(layer.style,{position:'fixed',inset:'0',zIndex:'60',pointerEvents:'none'});
   const dim=document.createElement('div');Object.assign(dim.style,{position:'absolute',inset:'0',background:getComputedStyle(el,'::backdrop').backgroundColor||'var(--dim)'});
   // A closed dialog is not rendered, so the page is copied into a plain surface.
   let copy;
   if(sheet===el){copy=document.createElement('div');copy.className=el.className;copy.append(...[...el.children].map(n=>n.cloneNode(true)));}
   else copy=sheet.cloneNode(true);
   copy.removeAttribute('id');copy.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));
   copy.querySelectorAll('.float-bar').forEach(n=>n.remove());
   Object.assign(copy.style,{position:'fixed',left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',margin:'0',transformOrigin:'0 0',background:style.backgroundColor,borderRadius:style.borderTopLeftRadius,overflow:'hidden',boxShadow:style.boxShadow});
   layer.append(dim,copy);document.body.appendChild(layer);this.returnLayers.add(layer);
   // Keep the reading position on the shrinking copy.
   const live=sheet.querySelectorAll('.sheet-scroll,.reader-scroll'),copied=copy.querySelectorAll('.sheet-scroll,.reader-scroll');
   live.forEach((n,i)=>{if(copied[i])copied[i].scrollTop=n.scrollTop;});
   const to=origin.rect,m=this.morph(r,to,origin.radius),timing={duration:380,easing:'cubic-bezier(.3,.7,.2,1)'};
   const animations=[
     copy.animate([{transform:'none',clipPath:`inset(0 0 0 0 round ${style.borderTopLeftRadius})`},{transform:m.transform,clipPath:m.clipPath}],timing),
     dim.animate([{opacity:1},{opacity:0}],{duration:300,easing:'ease-out',fill:'forwards'})
   ];
   const ghost=this.ghost(origin,copy,m.s);
   if(ghost)animations.push(ghost.animate([{opacity:0},{opacity:0,offset:.3},{opacity:1}],timing));
   const clean=()=>{if(!layer.isConnected)return;layer.remove();this.returnLayers.delete(layer);done();};
   Promise.all(animations.map(a=>a.finished)).then(clean,clean);
 },
 flip(el,oldRect){
   this.layoutAnimations.get(el)?.cancel();
   this.layoutAnimations.delete(el);
   const now=el.getBoundingClientRect(),x=oldRect.left-now.left,y=oldRect.top-now.top;
   if(Math.abs(x)+Math.abs(y)>1)this.layoutAnimations.set(el,this.animate(el,[{transform:`translate(${x}px,${y}px)`},{transform:'translate(0,0)'}],{duration:320}));
 },
 pulse(el){return this.animate(el,[{transform:'scale(1)'},{transform:'scale(1.08)',offset:.5},{transform:'scale(1)'}],{duration:350});}
};

const MotionEngine={
 query:matchMedia('(prefers-reduced-motion: reduce)'),
 panelAnimations:new WeakMap(),
 layoutAnimations:new WeakMap(),
 returnLayers:new Set(),
 get reduced(){return this.query.matches;},
 animate(el,keyframes,options={}){
   if(!el||!el.animate)return null;
   if(this.reduced){
     const opacity=keyframes.map(k=>({opacity:k.opacity??1}));
     return el.animate(opacity,{duration:70,easing:'linear',...options,delay:0,duration:70});
   }
   return el.animate(keyframes,{duration:260,easing:'cubic-bezier(.2,.75,.25,1)',...options});
 },
 enter(el,delay=0){return this.animate(el,[{opacity:0,transform:'translateY(10px) scale(.985)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:320,delay});},
 press(el){return this.animate(el,[{transform:'scale(1)'},{transform:'scale(.93)',offset:.35},{transform:'scale(1)'}],{duration:240});},
 capture(el){
   if(!el)return null;
   const rect=el.getBoundingClientRect();
   if(!rect.width||!rect.height||rect.bottom<0||rect.top>innerHeight)return null;
   const title=el.querySelector('[data-shared="title"]')||el.querySelector('.card-title-button,h2,h1');
   return {rect,title:title?.getBoundingClientRect(),radius:getComputedStyle(el).borderTopLeftRadius};
 },
 cancelPanel(el){
   (this.panelAnimations.get(el)||[]).forEach(animation=>animation?.cancel());
   this.panelAnimations.delete(el);
 },
 clearReturns(){
   this.returnLayers.forEach(layer=>{layer.getAnimations().forEach(a=>a.cancel());layer.remove();});
   this.returnLayers.clear();
 },
 openPanel(el,origin){
   this.cancelPanel(el);this.clearReturns();
   const r=el.getBoundingClientRect(),from=origin?.rect||origin;
   if(!from){this.panelAnimations.set(el,[this.enter(el)]);return;}
   // Move and reveal the surface, without scaling its text or controls.
   const x=from.left-r.left,y=from.top-r.top;
   const crop=`inset(0 ${Math.max(0,r.width-from.width)}px ${Math.max(0,r.height-from.height)}px 0 round ${origin.radius||'22px'})`;
   const title=el.querySelector('[data-shared="title"]'),titleRect=title?.getBoundingClientRect();
   const animations=[this.animate(el,[
     {opacity:.28,transform:`translate(${x}px,${y}px)`,clipPath:crop},
     {opacity:1,transform:'translate(0,0)',clipPath:`inset(0 0 0 0 round ${getComputedStyle(el).borderTopLeftRadius})`}
   ],{duration:320})];
   if(title&&origin.title){
     animations.push(this.animate(title,[
       {transform:`translate(${origin.title.left-titleRect.left-x}px,${origin.title.top-titleRect.top-y}px)`,opacity:.5},
       {transform:'translate(0,0)',opacity:1}
     ],{duration:320}));
   }
   this.panelAnimations.set(el,animations);
 },
 closePanel(el,origin){
   const from=el.getBoundingClientRect(),style=getComputedStyle(el);
   this.cancelPanel(el);this.clearReturns();
   if(this.reduced||!origin?.rect||!el.animate)return;
   // This inert surface can finish after dialog.close(); routing and focus never wait on animation.
   const surface=document.createElement('div'),to=origin.rect;
   surface.className='panel-return-surface';surface.setAttribute('aria-hidden','true');surface.inert=true;
   Object.assign(surface.style,{position:'fixed',left:from.left+'px',top:from.top+'px',width:from.width+'px',height:from.height+'px',background:style.backgroundColor,border:'1px solid '+style.borderColor,borderRadius:style.borderTopLeftRadius,boxShadow:style.boxShadow,zIndex:'40',pointerEvents:'none'});
   document.body.appendChild(surface);this.returnLayers.add(surface);
   const animation=this.animate(surface,[
     {left:from.left+'px',top:from.top+'px',width:from.width+'px',height:from.height+'px',opacity:.92,borderRadius:style.borderTopLeftRadius},
     {left:to.left+'px',top:to.top+'px',width:to.width+'px',height:to.height+'px',opacity:0,borderRadius:origin.radius||'22px'}
   ],{duration:230});
   const clean=()=>{surface.remove();this.returnLayers.delete(surface);};
   if(animation)animation.finished.then(clean,clean);else clean();
 },
 flip(el,oldRect){
   this.layoutAnimations.get(el)?.cancel();
   this.layoutAnimations.delete(el);
   const now=el.getBoundingClientRect(),x=oldRect.left-now.left,y=oldRect.top-now.top;
   if(Math.abs(x)+Math.abs(y)>1)this.layoutAnimations.set(el,this.animate(el,[{transform:`translate(${x}px,${y}px)`},{transform:'translate(0,0)'}],{duration:320}));
 },
 pulse(el){return this.animate(el,[{transform:'scale(1)'},{transform:'scale(1.08)',offset:.5},{transform:'scale(1)'}],{duration:350});}
};

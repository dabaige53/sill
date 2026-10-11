const MotionEngine={
 query:matchMedia('(prefers-reduced-motion: reduce)'),
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
 openPanel(el,origin){
   const r=el.getBoundingClientRect();
   if(!origin){this.enter(el);return;}
   const x=origin.left+origin.width/2-(r.left+r.width/2),y=origin.top+origin.height/2-(r.top+r.height/2);
   this.animate(el,[{opacity:.4,transform:`translate(${x*.5}px,${y*.5}px) scale(.82)`},{opacity:1,transform:'translate(0,0) scale(1)'}],{duration:380});
 },
 flip(el,oldRect){
   const now=el.getBoundingClientRect(),x=oldRect.left-now.left,y=oldRect.top-now.top;
   if(Math.abs(x)+Math.abs(y)>1)this.animate(el,[{transform:`translate(${x}px,${y}px)`},{transform:'translate(0,0)'}],{duration:320});
 },
 pulse(el){return this.animate(el,[{transform:'scale(1)'},{transform:'scale(1.08)',offset:.5},{transform:'scale(1)'}],{duration:350});}
};

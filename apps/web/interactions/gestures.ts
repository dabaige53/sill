import { MotionEngine } from "./motion.ts";
import { Store } from "../data/store.ts";
/** Gestures. One rule, taken from the MobileProto board: a gesture only ever sets where something should be;
 *  CSS transitions (sheet curve, 360ms) carry it there. Wheel steps glide, a change of direction picks up from wherever it is,
 *  and a finger on the glass (`is-drag`) switches the transition off so the surface sits exactly under it. */
class Gestures{
declare app: any;
declare phone: any;
declare pullWheel: any;

 constructor(app?: any){
   this.app=app;
   this.phone=matchMedia('(max-width:650px)');
   this.bindPull();this.bindSheetDrag();this.bindReaderSwipe();this.bindToastSwipe();
 }
 point(e?: any){const t=e.touches?.[0]||e.changedTouches?.[0];return {x:t.clientX,y:t.clientY};}
 spring(el?: any,keyframes?: any,duration: any=260){return MotionEngine.animate(el,keyframes,{duration,easing:'cubic-bezier(.32,.72,0,1)'});}
 dim(v?: any){const d=this.app.dialog;if(v==null)d.style.removeProperty('--backdrop');else d.style.setProperty('--backdrop',String(v));}
 // Momentum guard: a wheel stream that is still coasting into an edge is not a new gesture.
 // It counts after a pause, or once the deltas hold steady or grow again (momentum only ever weakens).
 intent(){
   let armed=false,last=0,prev=0,steady=0;
   return {
     feed(d?: any){const now=Date.now(),gap=now-last;last=now;if(!armed){steady=d>=prev&&d>=3?steady+1:0;if(gap>140||steady>=4)armed=true;}prev=d;return armed;},
     // Every wheel event counts as activity, even the ones that do not qualify, so a coasting tail never looks like a pause.
     reset(seen: any=true){armed=false;steady=0;if(seen)last=Date.now();},
     get armed(){return armed;}
   };
 }
 // A surface sent off screen stays there; the dialog closes once it is out of sight, with no return motion.
 dismiss(close?: any,delay: any=300){
   this.dim(0);
   window.setTimeout(()=>{this.app.skipReturnMotion=true;close();},MotionEngine.reduced?0:delay);
 }
 // After a pull or push closes something, the trackpad keeps coasting. Those leftover wheel events must not scroll the desk:
 // they are held until the hand has really stopped (no wheel for 200ms, at most 2.5s).
 swallowMomentum(){
   let last=Date.now();const started=last;
   const hold=(e?: any)=>{const now=Date.now();if(now-last>200||now-started>2500){window.removeEventListener('wheel',hold,{capture:true});return;}last=now;e.preventDefault();};
   window.addEventListener('wheel',hold,{capture:true,passive:false});
 }
 /* Pull to refresh, by finger or by trackpad at the top of the desk: the desk gives a little, a ring fills;
    full, it turns for at most a second. Let go early and both glide back. */
 bindPull(){
   const ring=document.createElement('div');ring.id='pull-ring';ring.className='pull-ring glass';ring.setAttribute('aria-hidden','true');
   ring.innerHTML='<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="11" pathLength="100"/></svg>';
   document.body.appendChild(ring);
   const need=64,circle=ring.querySelector('circle'),main=document.querySelector('main');
   let start=null,pull=0,busy=false,timer=0;const wheel=this.intent();
   const paint=()=>{
     const p=Math.min(need,pull);
     main.style.translate=pull?`0 ${Math.round(p*.5)}px`:'';
     ring.style.translate=`0 ${Math.round(-48+p*1.1)}px`;ring.style.opacity=String(Math.min(1,pull/24));
     circle.style.strokeDashoffset=String(100-Math.min(100,pull/need*100));
   };
   const refresh=async()=>{
     busy=true;pull=need;paint();ring.classList.add('is-spinning');document.body.classList.remove('is-pulling');
     const started=Date.now();
     await Promise.race([this.app.refresh(),new Promise((r?: any)=>window.setTimeout(r,1000))]);
     await new Promise((r?: any)=>window.setTimeout(r,Math.max(0,420-(Date.now()-started))));
     ring.classList.remove('is-spinning');pull=0;paint();busy=false;
   };
   document.addEventListener('touchstart',(e?: any)=>{
     start=null;
     if(busy||scrollY>0||this.app.dialog.open||e.touches.length>1||e.target.closest?.('#dock,#toast,.card-more-menu,.deck'))return;
     start={...this.point(e),at:Date.now()};
   },{passive:true});
   document.addEventListener('touchmove',(e?: any)=>{
     if(!start||this.app.drag?.active)return;
     const p=this.point(e),dy=p.y-start.y,dx=Math.abs(p.x-start.x);
     if(dy<=0||dx>dy){if(pull){pull=0;paint();}if(dy<-4||dx>12)start=null;return;}
     if(e.cancelable)e.preventDefault();
     document.body.classList.add('is-pulling');pull=Math.min(110,dy*.5);paint();
   },{passive:false});
   document.addEventListener('touchend',()=>{
     if(!start)return;start=null;document.body.classList.remove('is-pulling');
     if(pull>=need)refresh();else if(pull){pull=0;paint();}
   });
   window.addEventListener('wheel',(e?: any)=>{
     if(busy||this.app.dialog.open||scrollY>0||e.deltaY>=0||Math.abs(e.deltaX)>Math.abs(e.deltaY)){wheel.reset();return;}
     if(!wheel.feed(-e.deltaY))return;
     pull=Math.min(need,pull+-e.deltaY*.4);paint();clearTimeout(timer);
     if(pull>=need){wheel.reset();this.swallowMomentum();refresh();return;}
     timer=window.setTimeout(()=>{pull=0;paint();wheel.reset(false);},180);
   },{passive:true});
 }
 /* Sheets by finger: drag down from the grabber, or from content already at its top. Past 190px or a flick it leaves;
    otherwise it glides back. A full screen phone sheet pulled a little steps back to half height. */
 bindSheetDrag(){
   const dialog=this.app.dialog;let drag=null;
   const sheetOf=(t?: any)=>dialog.classList.contains('preview')||dialog.classList.contains('panel')?t.closest?.('.sheet'):null;
   dialog.addEventListener('touchstart',(e?: any)=>{
     drag=null;
     if(e.touches.length>1)return;
     const sheet=sheetOf(e.target);if(!sheet)return;
     const scroll=sheet.querySelector('.sheet-scroll');
     if(!e.target.closest('.grabber')&&scroll&&scroll.scrollTop>0)return;
     if(e.target.closest('input,textarea,[contenteditable="true"],.player-bar,.media-player'))return;
     drag={sheet,...this.point(e),at:Date.now(),dy:0,live:false,bar:dialog.querySelector(':scope > .float-bar')};
   },{passive:true});
   dialog.addEventListener('touchmove',(e?: any)=>{
     if(!drag)return;
     const p=this.point(e),dy=p.y-drag.y,dx=Math.abs(p.x-drag.x);
     if(!drag.live){if(dy<6&&dx<6)return;if(dy<=0||dx>dy){drag=null;return;}drag.live=true;drag.sheet.classList.add('is-drag');dialog.classList.add('is-drag');}
     if(e.cancelable)e.preventDefault();
     drag.dy=Math.max(0,dy);drag.sheet.style.translate=`0 ${drag.dy}px`;
     this.dim(1-Math.min(1,drag.dy/(drag.sheet.offsetHeight||1))*.7);
     if(drag.bar)drag.bar.style.opacity=String(Math.max(0,1-drag.dy/120));
   },{passive:false});
   dialog.addEventListener('touchend',()=>{
     if(!drag?.live){drag=null;return;}
     const {sheet,dy,bar}=drag,v=dy/Math.max(1,Date.now()-drag.at);drag=null;
     sheet.classList.remove('is-drag');dialog.classList.remove('is-drag');if(bar)bar.style.opacity='';
     if(dy>190||v>.5&&dy>40){
       if(MotionEngine.phoneSheet(dialog))this.app.closeModal();
       else{sheet.style.translate=`0 ${sheet.offsetHeight+80}px`;bar?.classList.add('is-hidden');this.dismiss(()=>this.app.closeModal());}
       return;
     }
     sheet.style.translate='';this.dim(null);
     if(dy>60&&sheet.classList.contains('is-full'))sheet.classList.remove('is-full');
   });
 }
 /* Full screen reading: swipe right to go straight back to the desk. */
 bindReaderSwipe(){
   const dialog=this.app.dialog;let swipe=null;
   dialog.addEventListener('touchstart',(e?: any)=>{
     swipe=null;
     if(!dialog.classList.contains('reader')||e.touches.length>1||e.target.closest('.float-bar'))return;
     swipe={...this.point(e),at:Date.now(),dx:0,live:false};
   },{passive:true});
   dialog.addEventListener('touchmove',(e?: any)=>{
     if(!swipe)return;
     const p=this.point(e),dx=p.x-swipe.x,dy=Math.abs(p.y-swipe.y);
     if(!swipe.live){if(dx<8&&dy<8)return;if(dx<=0||dy*1.2>dx){swipe=null;return;}swipe.live=true;dialog.classList.add('is-drag');}
     if(e.cancelable)e.preventDefault();
     swipe.dx=Math.max(0,dx);dialog.style.translate=`${swipe.dx}px 0`;this.dim(1-Math.min(1,swipe.dx/innerWidth));
   },{passive:false});
   dialog.addEventListener('touchend',()=>{
     if(!swipe?.live){swipe=null;return;}
     const {dx}=swipe,v=dx/Math.max(1,Date.now()-swipe.at);swipe=null;dialog.classList.remove('is-drag');
     if(dx>innerWidth*.3||v>.5&&dx>40){dialog.style.translate=`${innerWidth}px 0`;this.dismiss(()=>this.app.closeToDesk(false));}
     else{dialog.style.translate='';this.dim(null);}
   });
 }
 /* The toast can be flicked away downward. */
 bindToastSwipe(){
   const toast=document.getElementById('toast');let start=null;
   toast.addEventListener('touchstart',(e?: any)=>{start=e.target.closest('button')?null:this.point(e);},{passive:true});
   toast.addEventListener('touchmove',(e?: any)=>{
     if(!start)return;const dy=this.point(e).y-start.y;
     if(dy>0){if(e.cancelable)e.preventDefault();toast.style.translate=`0 ${dy}px`;toast.style.opacity=String(1-Math.min(1,dy/80));}
   },{passive:false});
   toast.addEventListener('touchend',(e?: any)=>{
     if(!start)return;const dy=this.point(e).y-start.y;start=null;
     const from: Record<string, any>={translate:toast.style.translate||'0 0',opacity:toast.style.opacity||'1'};
     toast.style.translate='';toast.style.opacity='';
     if(dy>24){const a=this.spring(toast,[from,{translate:'0 60px',opacity:0}],180);const hide=()=>{toast.hidden=true;clearTimeout(this.app.toastTimer);};a?a.finished.then(hide,hide):hide();}
     else if(dy>0)this.spring(toast,[from,{translate:'0 0',opacity:1}]);
   });
 }
 /* At the top, pulling on down (wheel and trackpad; fingers use the sheet drag above).
    Phone sheet, as in MobileProto: full screen steps back to half first; from half, a further pull past 110px closes it.
    Wider screens: the sheet or page follows down and leaves past about a fifth of its height. Short of that it glides back. */
 bindPullDown(){
   const app=this.app,dialog=app.dialog,reader=dialog.classList.contains('reader'),phone=MotionEngine.phoneSheet(dialog);
   const surface=reader?dialog:dialog.querySelector('.preview-sheet');if(!surface)return;
   const scroll=reader?dialog.querySelector('#reader-scroll'):surface.querySelector('.sheet-scroll')||surface;
   const bar=reader?null:dialog.querySelector(':scope > .float-bar'),token=app.modalToken,wheel=this.intent();
   const need=()=>phone?110:Math.min(150,Math.max(110,surface.offsetHeight*.2));
   let pull=0,timer=0,done=false,hold=0,last=0;
   const atTop=()=>scroll.scrollTop<=0;
   const paint=()=>{
     surface.style.translate=pull?`0 ${Math.round(pull*(phone?.6:1))}px`:'';
     this.dim(pull?1-Math.min(1,pull/need())*.7:null);
     if(bar)bar.style.opacity=pull?String(Math.max(0,1-pull/need()*1.6)):'';
   };
   const close=()=>{
     if(done||app.modalToken!==token)return;done=true;clearTimeout(timer);this.swallowMomentum();
     if(phone){app.closeModal();return;}
     surface.style.translate=reader?`0 ${innerHeight}px`:`0 ${surface.offsetHeight+80}px`;if(bar)bar.style.opacity='0';
     this.dismiss(()=>{if(reader)app.closeToDesk(false);else app.closeModal();});
   };
   // Phone: reading on makes the sheet full screen; the capsule steps aside while reading down and returns going up or at the end.
   if(phone){
     let lastY=0;
     scroll.addEventListener('scroll',()=>{
       const y=scroll.scrollTop,max=scroll.scrollHeight-scroll.clientHeight;
       if(y>4)surface.classList.add('is-full');
       if(bar){if(y>lastY+2&&y>60)bar.classList.add('is-hidden');else if(y<lastY-2||y>=max-8)bar.classList.remove('is-hidden');}
       lastY=y;
     },{passive:true});
   }
   scroll.addEventListener('scroll',()=>{if(!atTop()&&pull){pull=0;paint();}},{passive:true});
   // Listen on the whole dialog: as the sheet slides down it leaves the pointer behind, and the pull must keep going.
   if(this.pullWheel)dialog.removeEventListener('wheel',this.pullWheel);
   this.pullWheel=(e?: any)=>{
     if(done||app.modalToken!==token||Math.abs(e.deltaX)>Math.abs(e.deltaY))return;
     const now=Date.now(),d=-e.deltaY*(e.deltaMode===1?16:1),gap=now-last;last=now;
     if(d<=0||!atTop()){wheel.reset();if(pull&&d<0){pull=0;paint();}return;}
     // The coasting tail of the gesture that just changed state is not a new pull.
     if(hold){if(gap<160)return;hold=0;}
     if(phone&&surface.classList.contains('is-full')){surface.classList.remove('is-full');hold=1;pull=0;paint();return;}
     if(!wheel.feed(d))return;
     pull=Math.min(need()*1.2,pull+Math.min(40,d)*(phone?1:1-pull/(need()*2.5)));paint();
     clearTimeout(timer);
     if(pull>=need()){close();return;}
     timer=window.setTimeout(()=>{pull=0;paint();wheel.reset(false);},phone?180:260);
   };
   dialog.addEventListener('wheel',this.pullWheel,{passive:true});
   if(!reader)return;
   // Full screen reading by finger: pull down from the top, past a fifth or with a flick, and it slides away.
   let touch=null;
   scroll.addEventListener('touchstart',(e?: any)=>{touch=atTop()&&!done?{...this.point(e),at:Date.now(),live:false}:null;},{passive:true});
   scroll.addEventListener('touchmove',(e?: any)=>{
     if(!touch)return;const p=this.point(e),dy=p.y-touch.y,dx=Math.abs(p.x-touch.x);
     if(!touch.live){if(dy<6&&dx<6)return;if(dy<=0||dx>dy){touch=null;return;}touch.live=true;dialog.classList.add('is-drag');}
     if(e.cancelable)e.preventDefault();
     pull=Math.max(0,dy*.8);paint();
   },{passive:false});
   scroll.addEventListener('touchend',()=>{
     if(!touch?.live){touch=null;return;}
     const v=pull/Math.max(1,Date.now()-touch.at);touch=null;dialog.classList.remove('is-drag');
     if(pull>=need()||v>.5&&pull>40)close();else{pull=0;paint();}
   });
 }
 /* Reaching the end and pushing on (ReadEndRing): a small ring rises and fills with the push, the text lifts with resistance,
    the capsule steps aside. Full, it turns into a check, pops, and the piece folds away. Let go early and everything glides back. */
 bindPush(id?: any,scroll?: any){
   const app=this.app,dialog=app.dialog;
   if(!dialog.querySelector('#reader-end')||!Store.pref('collapseOnFinish'))return;
   const host=dialog.classList.contains('reader')?dialog:dialog.querySelector('.preview-sheet');if(!host)return;
   const chip=document.createElement('div');chip.className='push-ring';chip.setAttribute('aria-hidden','true');
   chip.innerHTML='<svg class="arc" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8"/><circle cx="10" cy="10" r="8" stroke-dasharray="50.27" stroke-dashoffset="50.27"/></svg><svg class="tick" viewBox="0 0 24 24"><path d="m6 12.5 4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
   host.appendChild(chip);
   const arc=chip.querySelector('.arc circle:last-child'),bar=dialog.querySelector(':scope > .float-bar');
   const need=120,token=app.modalToken,wheel=this.intent();
   let pull=0,timer=0,touch=null,done=false;
   const atEnd=()=>scroll.scrollHeight-scroll.clientHeight-scroll.scrollTop<=2;
   const paint=()=>{
     chip.style.opacity=String(Math.min(1,pull/30));chip.style.transform=`scale(${(.6+.4*Math.min(1,pull/60)).toFixed(3)})`;
     arc.setAttribute('stroke-dashoffset',String(50.27*(1-Math.min(1,pull/need))));
     scroll.style.translate=pull?`0 ${-Math.round(pull*.35)}px`:'';
     if(bar){bar.style.opacity=pull?'0':'';bar.style.translate=pull?'0 16px':'';}
   };
   const finish=()=>{
     if(done||app.modalToken!==token)return;done=true;clearTimeout(timer);
     pull=need;paint();chip.classList.add('is-done');chip.style.transform='scale(1)';
     Store.patch(id,{read:true,progress:1});app.refreshCard(id);this.swallowMomentum();
     window.setTimeout(()=>{if(app.modalToken===token)app.closeToDesk(true);},460);
   };
   const set=(v?: any)=>{if(done)return;pull=Math.max(0,Math.min(need,v));paint();if(pull>=need)finish();};
   scroll.addEventListener('scroll',()=>{if(!atEnd()&&pull&&!done){pull=0;paint();}},{passive:true});
   scroll.addEventListener('wheel',(e?: any)=>{
     if(done)return;
     const d=e.deltaY*(e.deltaMode===1?16:1);
     if(d<=0||!atEnd()){wheel.reset();if(pull){pull=0;paint();}return;}
     if(!wheel.feed(d))return;
     set(pull+Math.min(40,d)*.5);clearTimeout(timer);
     timer=window.setTimeout(()=>{if(!done){pull=0;paint();wheel.reset(false);}},180);
   },{passive:true});
   scroll.addEventListener('touchstart',(e?: any)=>{touch=atEnd()&&!done?{y:this.point(e).y}:null;},{passive:true});
   scroll.addEventListener('touchmove',(e?: any)=>{
     if(!touch)return;const dy=touch.y-this.point(e).y;
     host.classList.add('is-drag');
     if(dy<=0){if(pull){pull=0;paint();}return;}
     set(dy*.7);
   },{passive:true});
   scroll.addEventListener('touchend',()=>{if(!touch)return;touch=null;host.classList.remove('is-drag');if(!done){pull=0;paint();}});
 }
}

export { Gestures };

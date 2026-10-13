function esc(value=''){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function button(glyph,label,action,id='',extra='',className=''){
 return `<button type="button" class="icon-button ${className}" aria-label="${esc(label)}" data-action="${esc(action)}"${id?` data-id="${esc(id)}"`:''}${extra?` data-extra="${esc(extra)}"`:''}>${icon(glyph)}</button>`;
}
/** A pill with words: timely actions on cards and the primary action in a toolbar. */
function pill(text,action,id='',className='',extra='',label=''){
 return `<button type="button" class="pill ${className}" data-action="${esc(action)}"${id?` data-id="${esc(id)}"`:''}${extra?` data-extra="${esc(extra)}"`:''}${label?` aria-label="${esc(label)}"`:''}>${text}</button>`;
}
function ring(progress=0,size=22){
 const p=Math.max(0,Math.min(1,Number(progress)||0)),c=50.265;
 return `<span class="progress-ring" role="progressbar" aria-label="阅读进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p*100)}" style="width:${size}px;height:${size}px"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-opacity=".14" stroke-width="2.4"/><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c*(1-p)}" transform="rotate(-90 10 10)"/></svg></span>`;
}
function checkMark(done){return `<span class="check-dot">${done?icon('check',12):''}</span>`;}
function checkItem(c,t){return `<button class="check-item ${t.done?'is-done':''}" data-action="task" data-id="${esc(c.id)}" data-extra="${esc(t.id)}" type="button" role="checkbox" aria-checked="${!!t.done}" aria-label="${esc(t.text)}">${checkMark(t.done)}<span>${esc(t.text)}</span></button>`;}
const AvatarTones=['#5e7a99','#7d6b8f','#6b8a7a','#9a7b5f','#5f8a99','#8a6b6b'];
function avatarTone(name=''){let n=0;for(const ch of String(name))n+=ch.codePointAt(0);return AvatarTones[n%AvatarTones.length];}
function avatar(name='',size=28){return `<span class="avatar" style="width:${size}px;height:${size}px;background:${avatarTone(name)}" aria-hidden="true">${esc(String(name).slice(0,1))}</span>`;}
function avatars(names=[]){return `<span class="avatars" aria-label="${names.length} 位参与者">${names.map(n=>avatar(n,24)).join('')}</span>`;}
function timeString(ts){return new Date(ts).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});}
function dateLabel(ts){const d=new Date(ts);return `${d.getMonth()+1}月${d.getDate()}日 ${d.toLocaleDateString('zh-CN',{weekday:'short'})}`;}
function relativeDay(ts,now=Date.now()){
 const day=86400000,start=new Date(now);start.setHours(0,0,0,0);
 if(ts>=start.getTime())return '今天';if(ts>=start.getTime()-day)return '昨天';
 const days=Math.floor((start.getTime()-ts)/day)+1;
 if(days<7)return `${days} 天前`;if(days<14)return '上周';
 const d=new Date(ts);return `${d.getMonth()+1}月${d.getDate()}日`;
}
function eventRelative(c,now=Date.now()){
 const min=Math.ceil((c.start-now)/60000);
 if(min>90)return `${Math.round(min/60)} 小时后`;
 return min>0?`${min} 分钟后`:now<c.end?'正在进行':'已经结束';
}
function eventTimely(c,now=Date.now()){return c.start-now<=15*60000&&now<c.end;}
function duration(seconds=0){const s=Math.max(0,Math.round(seconds)),h=Math.floor(s/3600),m=Math.floor(s%3600/60),r=String(s%60).padStart(2,'0');return h?`${h}:${String(m).padStart(2,'0')}:${r}`:`${m}:${r}`;}
function minutes(seconds){return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
function tagChip(label,active=false,action='filter-tag'){return `<button type="button" class="chip ${active?'active':''}" data-action="${action}" data-extra="${esc(label)}" aria-pressed="${active}">${esc(label)}</button>`;}
function segmented(name,options,value,label){
 return `<span class="segmented" role="radiogroup" aria-label="${esc(label)}">${options.map(([v,t])=>`<button type="button" role="radio" aria-checked="${v===value}" class="${v===value?'on':''}" data-action="pref" data-id="${esc(name)}" data-extra="${esc(v)}">${esc(t)}</button>`).join('')}</span>`;
}
function toggle(name,on,label,action='pref-toggle'){return `<button class="toggle" type="button" role="switch" aria-label="${esc(label)}" aria-checked="${!!on}" data-action="${action}" data-id="${esc(name)}"></button>`;}
function highlight(text,query){
 const t=String(text||'');if(!query)return esc(t);
 const i=t.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());if(i<0)return esc(t);
 return esc(t.slice(0,i))+`<mark>${esc(t.slice(i,i+query.length))}</mark>`+esc(t.slice(i+query.length));
}
function emptyState(title,description='',actions=''){return `<section class="empty-card feed-item"><h2>${esc(title)}</h2>${description?`<p>${esc(description)}</p>`:''}${actions}</section>`;}

function esc(value=''){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function button(glyph,label,action,id='',extra='',className=''){
 return `<button type="button" class="icon-button ${className}" aria-label="${esc(label)}" data-action="${esc(action)}"${id?` data-id="${esc(id)}"`:''}${extra?` data-extra="${esc(extra)}"`:''}>${icon(glyph)}</button>`;
}
function ring(progress=0,size=22){
 const p=Math.max(0,Math.min(1,Number(progress)||0)),c=50.265;
 return `<span class="progress-ring" role="progressbar" aria-label="阅读进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p*100)}" style="width:${size}px;height:${size}px"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-opacity=".12" stroke-width="2"/><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c*(1-p)}" transform="rotate(-90 10 10)"/></svg></span>`;
}
function checkItem(c,t){return `<button class="check-item ${t.done?'is-done':''}" data-action="task" data-id="${esc(c.id)}" data-extra="${esc(t.id)}" type="button" role="checkbox" aria-checked="${!!t.done}" aria-label="${esc(t.text)}"><span class="check-dot">${t.done?icon('check',13):''}</span><span>${esc(t.text)}</span></button>`;}
function avatars(names=[]){return `<span class="avatars" aria-label="${names.length} 位参与者">${names.map((n,i)=>`<span class="avatar a${i%3}">${esc(n)}</span>`).join('')}</span>`;}
function timeString(ts){return new Date(ts).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});}
function eventRelative(c){
 const min=Math.ceil((c.start-Date.now())/60000);
 return min>0?`${min} 分钟后`:Date.now()<c.end?'正在进行':'已经结束';
}
function minutes(seconds){return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
function tagChip(tag,active=false,action='filter-tag'){return `<button class="tag-chip ${active?'active':''}" type="button" aria-pressed="${active}" data-action="${action}" data-extra="${esc(tag)}">${esc(tag)}</button>`;}
function emptyState(title,description){return `<section class="empty-card"><span class="empty-icon">${icon('search',26)}</span><h2>${esc(title)}</h2><p>${esc(description)}</p><button class="text-button" data-action="clear-filter">清除筛选</button></section>`;}

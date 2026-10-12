/* @ds-bundle: {"format":4,"namespace":"QuietGlass","components":[{"name":"IconButton"},{"name":"ActionButton"},{"name":"ProgressRing"},{"name":"CheckItem"},{"name":"Avatars"},{"name":"Attachment"},{"name":"TagChip"},{"name":"CardMeta"},{"name":"SearchField"},{"name":"Toggle"},{"name":"GlassDock"},{"name":"CardMenu"},{"name":"FeedCard"},{"name":"ReminderCard"},{"name":"TaskCard"},{"name":"QuoteCard"},{"name":"InsightCard"},{"name":"Dialog"},{"name":"Toast"},{"name":"SelectionBar"},{"name":"EmptyState"},{"name":"AIContext"},{"name":"AICompose"},{"name":"AIMessages"}]} */
(function(){
/**
 * Mono24: locally authored SVG primitives behind one renderer.
 * Production replacement point: Lucide. No icon-font or SF Symbols files are distributed.
 */
const Glyphs={
 sparkles:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/><path d="M20 2v4m-2-2h4"/>',
 refresh:'<path d="M20 8a8 8 0 0 0-14-2L3 9m0-5v5h5M4 16a8 8 0 0 0 14 2l3-3m-5 0h5v5"/>',
 filter:'<path d="M4 6h7m4 0h5M4 12h2m4 0h10M4 18h11m4 0h1"/><circle cx="13" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 bookmark:'<path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4Z"/>',
 tag:'<path d="M3 4v7l10 10 8-8L11 3H4a1 1 0 0 0-1 1Z"/><circle cx="7.5" cy="7.5" r="1"/>',
 note:'<path d="M14 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9M8 8h5M8 12h3"/><path d="m14 12 6-6 2-2-2-2-2 2-6 6-1 4Z"/>',
 more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 'check-circle':'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
 x:'<path d="m6 6 12 12M18 6 6 18"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
 up:'<path d="M12 20V4m-6 6 6-6 6 6"/>',
 back:'<path d="M20 12H4m6-6-6 6 6 6"/>',
 expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
 external:'<path d="M14 3h7v7M21 3l-10 10M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18M7 14h2m3 0h2m3 0h0M7 17h2m3 0h2"/>',
 mail:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 6 9-6"/>',
 book:'<path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Z"/><path d="M12 5v15"/>',
 layers:'<path d="m12 3 10 5-10 5L2 8Zm-9 9 9 5 9-5M3 17l9 5 9-5"/>',
 bell:'<path d="M5 9a7 7 0 0 1 14 0c0 8 2 8 2 9H3c0-1 2-1 2-9M9 21h6"/>',
 play:'<path d="m9 5 11 7-11 7Z"/>',
 pause:'<path d="M8 5v14M16 5v14" stroke-width="3"/>',
 file:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 14h8M8 17h5"/>',
 download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
 video:'<rect x="3" y="5" width="13" height="14" rx="3"/><path d="m16 10 5-3v10l-5-3"/>',
 select:'<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8 12 3 3 5-6"/>',
 undo:'<path d="M3 5v6h6M3 11a9 9 0 1 1 2 8"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
 grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
 grip:'<circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/>',
 send:'<path d="m21 3-7 18-4-7-7-4Zm0 0L10 14"/>',
 quote:'<path d="M10 5H4v7h5c0 4-2 6-5 7M21 5h-6v7h5c0 4-2 6-5 7"/>',
 eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
 ring:'<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 9 9" stroke-width="3"/>',
 moon:'<path d="M21 13a9 9 0 1 1-10-10 7 7 0 0 0 10 10Z"/>'
};
function icon(name,size=18){
 return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${Glyphs[name]||Glyphs.file}</svg>`;
}

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

window.QuietGlass={Glyphs:Glyphs,icon:icon,esc:esc,button:button,ring:ring,checkItem:checkItem,avatars:avatars,tagChip:tagChip,emptyState:emptyState,timeString:timeString,minutes:minutes};
})();

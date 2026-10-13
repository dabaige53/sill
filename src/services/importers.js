/** File import. Everything is parsed on this device; nothing is uploaded.
 * OPML → subscriptions; CSV (Readwise, Pocket) and HTML bookmarks → articles; Markdown → notes; .ics → events.
 */
const Importers={
 id(prefix,text){let h=2166136261;for(const ch of String(text)){h^=ch.codePointAt(0);h=Math.imul(h,16777619);}return `${prefix}-${(h>>>0).toString(36)}`;},
 url(value){try{const u=new URL(String(value).trim());return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}},
 clip(text,n){return String(text||'').replace(/\s+/g,' ').trim().slice(0,n);},
 kindOf(name,text){
   const lower=name.toLowerCase();
   if(lower.endsWith('.opml')||/<opml[\s>]/i.test(text))return 'opml';
   if(lower.endsWith('.ics')||/BEGIN:VCALENDAR/.test(text))return 'ics';
   if(lower.endsWith('.csv'))return 'csv';
   if(lower.endsWith('.html')||lower.endsWith('.htm')||/<!DOCTYPE NETSCAPE-Bookmark/i.test(text))return 'html';
   if(/\.(md|markdown|txt)$/.test(lower))return 'markdown';
   return '';
 },
 labels:{opml:'RSS 订阅',csv:'条收藏',html:'个书签',markdown:'篇笔记',ics:'个日程'},
 /** Returns {kind, title, entries:[{key,label,detail,card?,feed?,time}]} */
 parse(name,text){
   const kind=this.kindOf(name,text);
   const parsed=kind==='opml'?this.opml(text):kind==='csv'?this.csv(text):kind==='html'?this.bookmarks(text):kind==='ics'?this.ics(text):kind==='markdown'?this.markdown(name,text):[];
   return {kind,name,entries:parsed.slice(0,2000)};
 },
 opml(text){
   const doc=new DOMParser().parseFromString(text,'text/xml');
   return [...doc.querySelectorAll('outline[xmlUrl],outline[xmlurl]')].map(n=>{
     const title=this.clip(n.getAttribute('title')||n.getAttribute('text')||n.getAttribute('xmlUrl'),100),url=this.url(n.getAttribute('xmlUrl')||n.getAttribute('xmlurl'));
     return url?{key:url,label:title,detail:new URL(url).hostname,feed:{title,url}}:null;
   }).filter(Boolean);
 },
 csvRows(text){
   const rows=[];let row=[],cell='',quoted=false;
   for(let i=0;i<text.length;i++){
     const ch=text[i];
     if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(ch==='"')quoted=false;else cell+=ch;}
     else if(ch==='"')quoted=true;else if(ch===','){row.push(cell);cell='';}
     else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
     else cell+=ch;
   }
   if(cell||row.length){row.push(cell);rows.push(row);}
   return rows.filter(r=>r.some(c=>c.trim()));
 },
 csv(text){
   const [head,...rows]=this.csvRows(text);if(!head)return [];
   const col=(...names)=>head.findIndex(h=>names.includes(h.trim().toLowerCase()));
   const t=col('title','book title'),u=col('url','source url','book url'),h=col('highlight','text','excerpt'),a=col('author','book author'),d=col('time_added','date','highlighted at','created');
   const kind=h>=0?'readwise':'web';
   return rows.map(r=>{
     const url=this.url(r[u]||''),title=this.clip(r[t]||r[h]||url,200);if(!title)return null;
     const raw=d>=0?r[d]:'',time=/^\d{9,10}$/.test(raw)?Number(raw)*1000:Date.parse(raw)||Date.now();
     const highlight=h>=0?this.clip(r[h],2000):'';
     return {key:url||title,label:title,detail:[a>=0?r[a]:'',url?new URL(url).hostname:''].filter(Boolean).join(' · '),time,
       card:{id:this.id('imp',url||title+highlight),type:'article',kind,title,summary:this.clip(highlight,300),source:kind==='readwise'?'Readwise':(url?new URL(url).hostname:'导入'),meta:highlight?'高亮':'',...(url?{url}:{}),tags:[],body:highlight?[highlight]:[],time}};
   }).filter(Boolean);
 },
 bookmarks(text){
   const doc=new DOMParser().parseFromString(text,'text/html');
   return [...doc.querySelectorAll('a[href]')].map(n=>{
     const url=this.url(n.getAttribute('href'));if(!url)return null;
     const title=this.clip(n.textContent||url,200),added=Number(n.getAttribute('add_date'))*1000||Date.now();
     return {key:url,label:title,detail:new URL(url).hostname,time:added,
       card:{id:this.id('imp',url),type:'article',kind:'web',title,summary:'',source:new URL(url).hostname,meta:'书签',url,tags:[],body:[],time:added}};
   }).filter(Boolean);
 },
 markdown(name,text){
   const lines=text.replace(/\r/g,'').split('\n');
   const heading=lines.find(l=>/^#\s+/.test(l));
   const title=this.clip(heading?heading.replace(/^#\s+/,''):name.replace(/\.(md|markdown|txt)$/i,''),200)||'未命名笔记';
   const body=text.replace(/\r/g,'').split(/\n{2,}/).map(p=>p.replace(/^#+\s+/gm,'').trim()).filter(p=>p&&p!==title).slice(0,100).map(p=>p.slice(0,50000));
   return [{key:name+title,label:title,detail:`${body.length} 段`,time:Date.now(),
     card:{id:this.id('md',name+title),type:'note',kind:'markdown',title,summary:this.clip(body[0]||'',300),source:'Markdown',meta:name.slice(0,100),tags:[],body,time:Date.now()}}];
 },
 ics(text){
   const unfolded=text.replace(/\r?\n[ \t]/g,'');
   const date=v=>{const m=String(v||'').match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);if(!m)return NaN;const [,y,mo,d,h='00',mi='00',s='00',z]=m;return z?Date.UTC(+y,mo-1,+d,+h,+mi,+s):new Date(+y,mo-1,+d,+h,+mi,+s).getTime();};
   return unfolded.split('BEGIN:VEVENT').slice(1).map(block=>{
     const get=key=>{const m=block.match(new RegExp('^'+key+'(?:;[^:\\n]*)?:(.*)$','m'));return m?m[1].trim():'';};
     const start=date(get('DTSTART')),end=date(get('DTEND'))||start+3600000,title=this.clip(get('SUMMARY').replace(/\\,/g,',').replace(/\\n/g,' '),200);
     if(!title||!Number.isFinite(start)||!(end>start))return null;
     const url=this.url(get('URL')),location=this.clip(get('LOCATION').replace(/\\,/g,','),300);
     return {key:get('UID')||title+start,label:title,detail:new Date(start).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}),time:start,
       card:{id:this.id('ics',(get('UID')||'')+title+start),type:'event',kind:'calendar',title,summary:this.clip(get('DESCRIPTION').replace(/\\n/g,' '),300),source:'日历',start,end,...(location?{location}:{}),...(url?{url}:{}),tags:[],body:[],time:start}};
   }).filter(Boolean);
 },
 /** A link or a line of text, from capture, paste or drop. */
 capture(text){
   const value=String(text||'').trim();if(!value)return null;
   const url=this.url(value.split(/\s+/)[0]);
   if(url){const host=new URL(url).hostname.replace(/^www\./,'');const rest=value.slice(value.split(/\s+/)[0].length).trim();
     return {id:this.id('web',url+Date.now()),type:'article',kind:'web',title:this.clip(rest||host+new URL(url).pathname.replace(/\/$/,''),200),summary:'',source:host,meta:'刚刚收集',url,tags:[],body:rest?[rest]:[],time:Date.now()};}
   const lines=value.split('\n'),title=this.clip(lines[0],60);
   return {id:this.id('note',value+Date.now()),type:'note',kind:'capture',title,summary:this.clip(value,300),source:'速记',meta:'刚刚',tags:[],body:value.split(/\n{2,}/).map(p=>p.slice(0,50000)).slice(0,100),time:Date.now()};
 },
 /** Same link or same title already on the desk: merge, keep both origins. */
 dedupe(cards){
   const byUrl=new Map(),byTitle=new Map();
   for(const c of Store.state.cards){if(c.url)byUrl.set(c.url,c);byTitle.set(c.title,c);}
   const fresh=[],merged=[];
   for(const c of cards){
     const twin=(c.url&&byUrl.get(c.url))||byTitle.get(c.title);
     if(twin){merged.push([twin,c]);continue;}
     fresh.push(c);if(c.url)byUrl.set(c.url,c);byTitle.set(c.title,c);
   }
   return {fresh,merged};
 }
};

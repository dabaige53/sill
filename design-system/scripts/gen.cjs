const fs=require('fs'),path=require('path');
// Usage: node design-system/scripts/gen.cjs design-system .   (writes icons + bundle from src/)
const D=process.argv[2],R=process.argv[3];
const src=f=>fs.readFileSync(path.join(R,f),'utf8');
// icons: evaluate Glyphs
const iconsJs=src('src/atoms/icons.js');
const Glyphs=new Function(iconsJs+';return Glyphs;')();
for(const [k,v] of Object.entries(Glyphs)){
 fs.writeFileSync(path.join(D,'assets/Icons',k+'.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1d1d1f" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${v}</svg>\n`);
}
console.log(Object.keys(Glyphs).length,'icons');
// bundle.js
const prim=src('src/atoms/primitives.js');
const names=['IconButton','ActionButton','ProgressRing','CheckItem','Avatars','Attachment','TagChip','CardMeta','SearchField','Toggle','GlassDock','CardMenu','FeedCard','ReminderCard','TaskCard','QuoteCard','InsightCard','Dialog','Toast','SelectionBar','EmptyState','AIContext','AICompose','AIMessages'];
const header=`/* @ds-bundle: ${JSON.stringify({format:4,namespace:'QuietGlass',components:names.map(n=>({name:n}))})} */\n`;
let body=`(function(){\n${iconsJs}\n${prim}\nwindow.QuietGlass={Glyphs:Glyphs,icon:icon,esc:esc,button:button,ring:ring,checkItem:checkItem,avatars:avatars,tagChip:tagChip,emptyState:emptyState,timeString:timeString,minutes:minutes};\n})();\n`;
if(/<\/script|<!--/i.test(body)) throw new Error('bad bundle');
fs.writeFileSync(path.join(D,'components/bundle.js'),header+body);
// bundle.css
const map={'#d1d1d6':'var(--toggle-off)','#b8b8bd':'var(--check-border)','#c7c7cc':'var(--done-strike)','#0057ad':'var(--accent-pressed)','#dceaff':'var(--accent-soft-hover)','#d8e9ff':'var(--selection)'};
let css=`/* Quiet Glass · component styles · from src/styles (base, controls, cards, overlays). Tokens come from tokens.json. */\n:root{--font:var(--font-sans);--ease:cubic-bezier(.2,.75,.25,1);--fast:140ms;--base:220ms;--layout:320ms}\n`;
for(const f of ['base','controls','cards','overlays']){let t=src(`src/styles/${f}.css`);for(const[k,v] of Object.entries(map))t=t.split(k).join(v);css+=t+'\n';}
css+=`/* Preview frame: cards and fixed layers render in flow. */\n.ds-flow .feed-card{position:relative}\n.ds-flow #toast,.ds-flow #selection-bar,.ds-flow .ai-panel,.ds-flow #dock{position:relative;left:auto;right:auto;bottom:auto;transform:none}\n.ds-flow main{padding:0;min-height:0}\n`;
if(/<\/style/i.test(css)) throw new Error('bad css');
fs.writeFileSync(path.join(D,'components/bundle.css'),css);

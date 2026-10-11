/** Full, live catalogue of the shared Mono24 renderer. */
const IconsView = {
 render(){
  const entries=Object.keys(Glyphs).map(key=>({
   key,
   ...(IconCatalog.icons[key]||{name:key,group:'uncategorized',purpose:'新增共享图标，待补充使用说明。'})
  }));
  const foundations=`<section class="catalog-section icon-foundations" data-catalog-section="icon-foundations">
   <div class="catalog-section-head"><div><span class="catalog-eyebrow">ONE SHARED LANGUAGE</span><h2>线条统一，意图明确。</h2></div><p>点击任一图标试用。名称、用途与调用键始终与真实图形放在一起。</p></div>
   <div class="icon-state-strip">
    <div class="icon-state-sample"><div class="icon-state-preview">${button('bookmark','试用收藏图标','lab-icon','','bookmark')}</div><strong>可操作</strong><span>18 px 图形 · 44 px 触达</span></div>
    <div class="icon-state-sample"><div class="icon-state-preview">${icon('bookmark',24)}</div><strong>基础网格</strong><span>24 × 24 · 1.65 px 描边</span></div>
    <div class="icon-state-sample"><div class="icon-state-preview">${icon('bookmark',32)}</div><strong>放大预览</strong><span>同一 SVG · 不替换字形</span></div>
   </div>
   <p class="catalog-note">共享入口 <code class="catalog-code">icon(name, size)</code> · 图形使用 currentColor，纯图形不重复朗读；交互名称由真实按钮提供。</p>
  </section>`;
  const groups=IconCatalog.groups.map(group=>{
   const items=entries.filter(entry=>entry.group===group.key);
   if(!items.length)return '';
   return `<section class="catalog-section" data-catalog-section="icons-${esc(group.key)}">
    <div class="catalog-section-head"><div><span class="catalog-eyebrow">${String(items.length).padStart(2,'0')} GLYPHS</span><h2>${esc(group.title)}</h2></div><p>${esc(group.description)}</p></div>
    <div class="catalog-grid icon-catalog-grid">${items.map(entry=>this.tile(entry)).join('')}</div>
   </section>`;
  }).join('');
  return Catalog.header({eyebrow:'01 / ICON LIBRARY',title:'图标库',description:'系统全部图标的独立参考页。图形与产品共用一个渲染器，尺寸、语义和操作入口在这里统一维护。',active:'icons',count:Object.keys(Glyphs).length})+foundations+groups;
 },
 tile(entry){
  return `<article class="icon-tile" data-icon-name="${esc(entry.key)}">
   <div class="icon-tile-preview">${button(entry.key,`试用${entry.name}图标`,'lab-icon','',entry.key,'icon-tile-trigger')}</div>
   <div class="icon-tile-meta"><h3>${esc(entry.name)}</h3><code class="catalog-code">${esc(entry.key)}</code><p>${esc(entry.purpose)}</p></div>
   <div class="icon-tile-sizes" aria-label="${esc(entry.name)}图标的 18、24、32 像素尺寸示例">${[18,24,32].map(size=>`<span class="icon-size-sample"><span>${icon(entry.key,size)}</span><small>${size}</small></span>`).join('')}</div>
  </article>`;
 }
};

/** Navigation belongs to the reference libraries; the product feed stays quiet. */
const Catalog={
 header({eyebrow,title,description,active,count}){
   const links=[['icons','icons.html','图标库'],['cards','cards.html','卡片库'],['library','components.html','组件库'],['sources','research.html','设计参考'],['feed','index.html','进入信息流']];
   return `<header class="catalog-header"><span class="catalog-eyebrow">QUIET GLASS · ${esc(eyebrow)}</span><div class="catalog-header-main"><div><h1>${esc(title)}</h1><p>${esc(description)}</p></div><div class="catalog-count" aria-label="${esc(count)} 个参考样本"><strong>${esc(String(count).padStart(2,'0'))}</strong><span>个样本</span></div></div><nav class="catalog-nav" aria-label="设计系统参考库">${links.map(([key,href,label])=>`<a href="${href}"${active===key?' aria-current="page"':''}>${esc(label)}${key==='feed'?icon('arrow',15):''}</a>`).join('')}</nav></header>`;
 }
};

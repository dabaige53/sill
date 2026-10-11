/** The card catalog renders the product's actual templates, including explicit read-only states. */
const CardsView={
 specimen(variant,index){
   const c=CardCatalog.card(variant);
   return `<section class="card-specimen" data-card-type="${esc(variant.type)}" data-card-form="${esc(variant.form)}" data-card-variant="${esc(variant.key)}"><header><h3>${esc(variant.title)}</h3></header><div class="catalog-card-stage">${cardHTML(c)}</div><details class="catalog-details"><summary>结构与交互</summary><p>${esc(variant.anatomy)}</p><p>${esc(variant.behavior)}</p></details></section>`;
 },
 render(){
   const now=Date.now(),states=CardCatalog.states(now);
   return Catalog.header({eyebrow:'02 / CARD LIBRARY',title:'卡片库',description:'13 种样卡，共享一套尺寸、颜色和交互规则。',active:'cards',count:CardCatalog.variants.length})+
   `<section class="catalog-section"><div class="catalog-section-head"><div><span class="eyebrow">CONTENT OBJECTS</span><h2>10 种内容，13 种呈现</h2></div><p>真实样卡 · 与信息流共享当前浏览器状态</p></div><div class="catalog-grid catalog-card-grid">${CardCatalog.variants.map((v,i)=>this.specimen(v,i)).join('')}</div></section>`+
   `<section class="catalog-section"><div class="catalog-section-head"><div><span class="eyebrow">STATE LANGUAGE</span><h2>同一张卡片，不同的状态</h2></div><p>独立静态样本 · 不影响你的阅读、收藏或任务记录</p></div><div class="catalog-grid catalog-state-grid">${states.map((sample,index)=>{const c=Store.card(sample.id)||SeedCards.find(card=>card.id===sample.id);return `<section class="card-specimen is-passive" data-card-state="${esc(sample.key)}"><header><span class="specimen-kicker">STATE ${String(index+1).padStart(2,'0')}</span><h3>${esc(sample.title)}</h3></header><div class="catalog-card-stage">${cardHTML(c,{state:sample.state,passive:true,now})}</div><div class="catalog-caption"><p>${esc(sample.caption)}</p></div></section>`;}).join('')}</div></section>`;
 }
};

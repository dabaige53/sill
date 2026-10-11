function labCard(id,number,title,body,preview='',className=''){
 return `<section class="lab-card ${className}" data-layout="${id}"><span class="lab-number">${number}</span><h2>${title}</h2><p>${body}</p>${preview}</section>`;
}
const LibraryView={
 render(){
   const intro=`<section class="lab-card lab-intro" data-layout="lab-intro"><span class="lab-number">QUIET GLASS · 组件实验室</span><h1>先有组件，<br>再有页面。</h1><p>从一个图标、一圈进度、一层玻璃开始。这里的组件与信息流共用同一份代码，而不是另一套静态样稿。</p><div class="lab-footer">${button('grid','返回信息流','view-feed')}${button('book','查看研究资料','view-sources')}${button('info','使用与设置','settings')}</div><div class="lab-caption">原型实现：独立 SVG · CSS / Web Animations API · 原生 dialog。<br>正式工程选型：Lucide · Motion · Radix。</div></section>`;
   const atoms=[
     labCard('icons','01 / ATOM','只有图标，没有按钮文案','图形 18 px，点击范围 44 px。每个图标仍然保留可访问名称。',
       `<div class="lab-preview">${['refresh','filter','sparkles','bookmark','tag','up','search','note','grip'].map(i=>button(i,'试用 '+i,'lab-icon','',i)).join('')}</div><div class="lab-caption">单一线性语言 · Mono24 原型适配层</div>`),
     labCard('glass','02 / MATERIAL','工具像玻璃，内容像纸','把透明度留给临时操作层。玻璃随背景变化，但文字始终清楚。',
       `<div class="lab-preview material-sample"><div class="glass">${button('refresh','演示刷新反馈','lab-icon','','refresh')}${button('filter','打开筛选面板','filter')}${button('sparkles','打开 AI 对话','ai')}</div></div>`),
     labCard('progress','03 / ATOM','把进度，放进一个圆环','不用再写一行“已读百分之多少”。黑色线段承担进度表达。',
       `<div class="lab-preview" id="lab-rings">${ring(.25,24)}${ring(.55,36)}${ring(.75,52)}${ring(1,22)}</div><input class="ring-range" type="range" min="0" max="100" value="55" aria-label="调整圆环演示进度" data-input="lab-ring">`),
     labCard('type','04 / FOUNDATION','字，是最安静的界面','优先系统字体，不分发 SF 字体。内容使用自然行距，中文不做过密的字距压缩。',
       `<div class="type-sample">让重要的信息，<br>自然浮现。<small>17 / 600 · 标题<br>14 / 400 · 正文<br>12 / 400 · 元数据</small></div>`),
     labCard('color','05 / FOUNDATION','颜色退后，内容向前','暖白、石灰、墨色。状态色只在需要说明行为时出现。',
       `<div class="swatches"><span class="swatch" style="background:#f5f4f0"></span><span class="swatch" style="background:#fff"></span><span class="swatch" style="background:#dfe7da"></span><span class="swatch" style="background:#777e72"></span><span class="swatch" style="background:#252627"></span></div>`),
     labCard('motion','06 / INTERACTION','动一下，是为了说清楚','轻触下方图标。进入、提起、回落都很短，不让动画占用阅读时间。',
       `<div class="lab-preview motion-sample"><div class="motion-cube" id="motion-cube"></div></div><div class="lab-footer">${button('play','播放进入动效','lab-motion','','enter')}${button('up','播放提起动效','lab-motion','','lift')}${button('refresh','播放回弹动效','lab-motion','','spring')}</div><div class="lab-caption">140 / 220 / 320 / 380 ms · 遵循系统减少动态设置</div>`),
     labCard('state','07 / STATE','看过，不等于读完','打开以后变浅，真正阅读才记录进度。任务完成是另一种独立状态。',
       `<div class="lab-state-row"><div class="lab-state">未打开<div class="mini-lines"></div>${ring(0)}</div><div class="lab-state read">已打开<div class="mini-lines"></div>${ring(.36)}</div></div>`),
     labCard('drag','08 / INTERACTION','提起一张卡片，交给 AI','去信息流长按或拖动任意卡片。接收区域只在拖动时出现；松手后加入引用，不自动发送。',
       `<div class="lab-preview">${button('grid','去信息流体验拖拽','view-feed')}${button('sparkles','使用点击方式加入演示上下文','card-ai','article-01')}</div><div class="lab-caption">支持鼠标拖动、触屏长按和等价点击入口。</div>`),
     labCard('tags','09 / ATOM','标签存在，不代表必须露面','仅在编辑和筛选时出现。完成后，标签不会挤在每张卡片的标题下面。',
       `<div class="lab-preview">${['工作','阅读','想法'].map(t=>tagChip(t,false,'lab-tag')).join('')}</div><div class="lab-footer">${button('tag','编辑演示卡片标签和备注','edit','note-01')}</div>`),
     labCard('dialog','10 / COMPOSITION','一张卡片，有不同深度','快速看一眼，继续读全文，再回到原来的位置。阅读不会打开新的产品侧边栏。',
       `<div class="lab-preview">${button('eye','快速预览演示文章','preview','article-01')}${button('expand','完整阅读演示文章','reader','article-01')}${button('filter','筛选内容','filter')}</div>`),
     labCard('a11y','11 / FOUNDATION','安静，也应该容易使用','支持键盘、减少动态效果、图标名称和拖拽替代。减少透明度后，所有功能仍然保留。',
       `<div class="lab-footer">${button('info','打开可访问性设置','settings')}</div><div class="lab-caption">Enter 打开 · Esc 返回 · Cmd/Ctrl + K 搜索</div>`),
     labCard('templates','12 / CARD LIBRARY','十种内容，不是十套设计','以下卡片与首页使用同一个 CardShell。收藏、稍后读与标签都是状态，不再单独制造卡片类型。',
       `<div class="lab-preview">${Object.values(CardTypes).map(t=>`<span class="icon-button" aria-label="${t.label}">${icon(t.icon)}</span>`).join('')}</div>`)
   ].join('');
   return intro+atoms+Store.state.cards.slice(0,12).map(cardHTML).join('');
 }
};
const SourcesView={
 render(){
   return `<section class="lab-card lab-intro" data-layout="sources-intro"><span class="lab-number">RESEARCH · 2026.10.10</span><h1>从官方规则，<br>到具体交互。</h1><p>收集、比较，再决定。本页保存资料入口与它影响的设计决策；不是把所有库都装进一个网页。</p><div class="lab-footer">${button('grid','返回信息流','view-feed')}${button('layers','查看组件实验室','view-library')}${button('info','原型边界与设置','settings')}</div></section>`+
   Sources.map((s,i)=>`<article class="lab-card source-card" data-layout="source-${i}"><span class="lab-number">${esc(s.kind)}</span><h2><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a></h2><p>${esc(s.note)}</p><a class="source-link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer"><span>${esc(new URL(s.url).hostname)}</span>${icon('external',16)}</a></article>`).join('');
 }
};

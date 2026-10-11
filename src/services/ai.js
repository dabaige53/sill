/**
 * Adapter contract: respond({question, cards}) -> Promise<string>.
 * This adapter is intentionally local and deterministic. It never calls a model.
 * A production adapter belongs behind a server route with authentication, per-card
 * consent, size limits, cancellation, provenance and secret management.
 */
const DemoAI={
 async respond({question,cards}){
   await new Promise(r=>setTimeout(r,650));
   if(!cards.length)return '这是本地对话演示，还没有加入卡片。\n\n可以关闭这个浮层，提起一张卡片，放到右下角的玻璃入口；也可以点击卡片上的 AI 图标。内容会作为引用出现，不会自动发送。';
   const lines=cards.map((c,i)=>`${i+1}. 「${c.title.replace(/\n/g,'')}」\n${c.summary||c.body?.[0]||''}`);
   const taskLines=cards.filter(c=>c.type==='task').flatMap(c=>Store.tasks(c).filter(t=>!t.done).map(t=>`· ${t.text}`));
   return `已带入 ${cards.length} 张卡片。下面是前端根据演示数据整理的内容，不是模型分析：\n\n${lines.join('\n\n')}${taskLines.length?'\n\n待继续的事项：\n'+taskLines.join('\n'):''}\n\n你的问题：「${question}」\n真实推理与追问，需要接入后端 AI 服务。`;
 }
};
const AIView={
 shell(){
   return `<section class="ai-panel" id="ai-panel" role="dialog" aria-modal="false" aria-labelledby="ai-title" data-drop="ai" hidden>
   <div class="ai-header"><div><h2 id="ai-title">一起想一想</h2><small>本地演示 · 未连接模型</small></div><div>${button('undo','清空对话和引用','ai-clear')}${button('x','关闭 AI 对话','ai-close')}</div></div><div class="ai-contexts" id="ai-contexts" aria-label="对话引用"></div><div class="ai-empty" id="ai-empty">${icon('sparkles',27)}<p>把想继续的内容，<br>轻轻放进来。</p><small>拖动卡片，或点击卡片上的 AI 图标</small></div><div class="ai-messages" id="ai-messages" aria-live="polite" aria-relevant="additions"></div><div class="ai-compose"><textarea id="ai-input" rows="3" aria-label="向 AI 提问" placeholder="围绕这些内容，想问什么？"></textarea>${button('up','发送演示提问','ai-send')}</div></section>`;
 },
 contexts(ids){
   const cards=ids.map(id=>Store.card(id)).filter(Boolean);
   if(!cards.length)return '';
   return `<div class="context-heading"><span>${cards.length} 张卡片作为上下文</span><span>发送前可调整</span></div>`+cards.map(c=>`<section class="context-card context-chip" data-context="${esc(c.id)}" aria-label="引用：${esc(c.title)}"><div class="context-thumbnail" aria-hidden="true">${c.image?`<img src="${Assets[c.image]}" alt="" draggable="false">`:icon(CardTypes[c.type].icon,20)}</div><div class="context-copy"><div class="context-meta">${esc(CardTypes[c.type].label)} · ${esc(c.source||'我的空间')}</div><button type="button" class="context-title" data-action="context-preview" data-id="${esc(c.id)}" aria-label="查看引用：${esc(c.title)}">${esc(c.title.replace(/\n/g,''))}</button><p class="context-summary">${esc(c.summary||'打开查看内容')}</p></div>${button('x','移除引用：'+c.title,'ai-remove',c.id,'','context-remove')}</section>`).join('');
 }
};

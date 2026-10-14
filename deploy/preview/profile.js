/* Only included by scripts/build.py --preview. Never loaded by the local product. */
window.__QG_LOCAL__=false;
window.__QG_RUNTIME__=false;
Store.key='sill-public-demo-v1';
for(const card of [...SeedCards,...FreshCards]){
 if(card.url)card.url='https://example.com/';
 if(card.meeting)card.meeting={...card.meeting,url:'https://example.com/',code:'演示会议'};
}
const previewLoad=Store.load;
Store.load=function(){
 previewLoad.call(this);
 this.state.sources=this.state.sources.map(s=>({...s,status:'attention',detail:'演示来源 · 尚未连接',count:0,syncedAt:0}));
 this.save();
};
const previewInit=AppController.prototype.init;
AppController.prototype.init=function(){
 previewInit.call(this);
 const notice=document.createElement('aside');notice.id='demo-notice';notice.setAttribute('role','note');
 notice.textContent='Sill 静态演示 · 全部为合成数据 · 登录、后端与 MCP 尚未接通。操作仅保存在本浏览器，请勿输入私人信息。';
 document.body.prepend(notice);
};
const previewAction=AppController.prototype.action;
AppController.prototype.action=function(name,...args){
 if(['source-connect','source-authorize','permission-allow','feed-add','source-toggle','source-pause','refresh','import-pick'].includes(name)){this.toast('静态演示：后端尚未接通，未连接外部来源');return;}
 return previewAction.call(this,name,...args);
};
// Pull-to-refresh and file drop bypass action(); keep the same boundary there.
AppController.prototype.refresh=async function(){this.toast('静态演示：后端尚未接通，未连接外部来源');};
AppController.prototype.importFiles=async function(){this.toast('静态演示：文件导入未启用');};

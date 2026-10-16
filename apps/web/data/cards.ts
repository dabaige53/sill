import type { Card } from '../../../contracts/card.ts';
/** Demo data only. No connected account, live news, email or calendar is queried. */
const DAY = 86400000;
const demoBase = Date.now();
const articleBody = [
 '我们每天读到的内容越来越多，但真正需要做出的判断，并没有因此变得更简单。一个新的产品发布、一封等待回复的邮件、一段刚写下的笔记，常常分别停在不同的入口。切换页面容易，重新建立上下文却很费力。',
 '这个示例讨论另一种可能：不让人反复寻找信息，而是让值得关注的内容在合适的时候出现。信息流不只是时间线，它还可以是一张会变化的工作桌。文章、笔记、提醒和日程各自保留自己的表达，却共享同一种操作语言。',
 '先把内容摆好，再决定要做什么。我们不必在每一张卡片上放满按钮。浏览时只留下标题、摘要和必要状态；当用户靠近、选择或提起一张卡片时，工具才跟随意图出现。克制并不是减少能力，而是把能力放在真正需要它的位置。',
 '拖动是一种直接表达关系的方式。把卡片交给 AI，不意味着原来的内容被搬走，只意味着对话获得了一份上下文。系统应该让这个关系看得见：先提起，再接近接收区域，然后松手，让卡片变成输入框上方的一条引用。',
 '但流畅的动画不应该掩盖行为边界。加入引用不等于发送，预览不等于读完，打开待办不等于完成。每种状态都需要有独立的名字和清楚的反馈，才能让用户理解产品到底替自己做了什么，又有哪些事情仍然等待自己的确认。',
 '同样重要的是可逆性。误点收藏可以撤销，拖动取消不改变任何数据，关闭阅读页面能够回到刚才的位置。好的交互不会把人推向某一个结果，而是在每一步保留继续、返回和重新选择的空间。',
 '视觉上的安静，来自内容层和操作层之间的分工。阅读表面需要稳定、清晰、足够对比；工具可以轻盈、透明、暂时浮现。玻璃不是每一个矩形都应该拥有的装饰，它更像一句提示：这里是可以操作的地方。',
 '当我们把这些细节放在一起，信息流就不再只是向下滚动的列表。它开始帮助我们分配注意力、建立联系、做出判断。最后决定要读什么、相信什么、下一步投入多少的人，仍然是正在使用它的你。'
];
const HOUR = 3600000, MIN = 60000;
/** Eleven card types. `readable` types carry read state as card color. */
const CardTypes: Record<string, any> = Object.assign(Object.create(null), {
 article:{label:'文章',icon:'book',readable:true},mail:{label:'邮件',icon:'mail',readable:true},note:{label:'笔记',icon:'note',readable:true},
 task:{label:'待办',icon:'check-circle'},event:{label:'日程',icon:'calendar'},reminder:{label:'提醒',icon:'bell'},
 media:{label:'媒体',icon:'video',readable:true},digest:{label:'摘要',icon:'chart'},suggestion:{label:'建议',icon:'sparkles',readable:true},photo:{label:'照片',icon:'image',readable:true},file:{label:'文件',icon:'folder'}
});
/** Where content comes from. Icons repeat in the source row, the source list and import. */
const SourceKinds: Record<string, any> = Object.assign(Object.create(null), {
 rss:{label:'RSS',icon:'rss',group:'读'},readwise:{label:'Readwise',icon:'book',group:'读'},web:{label:'网页收集',icon:'globe',group:'读'},
 youtube:{label:'YouTube',icon:'video',group:'读'},twitter:{label:'推特',icon:'chat',group:'读'},podcast:{label:'播客',icon:'mic',group:'读'},
 mail:{label:'邮件',icon:'mail',group:'回'},reminders:{label:'提醒事项',icon:'check-circle',group:'做 · 跟进'},linear:{label:'Linear',icon:'target',group:'做 · 跟进'},
 github:{label:'GitHub',icon:'pull',group:'做 · 跟进'},calendar:{label:'日历',icon:'calendar',group:'排时间 · 存档'},photos:{label:'照片',icon:'image',group:'排时间 · 存档'},
 folder:{label:'文件夹',icon:'folder',group:'排时间 · 存档'},capture:{label:'速记',icon:'note',group:''},markdown:{label:'Markdown',icon:'note',group:''},
 local:{label:'本地',icon:'note',group:''},agent:{label:'助手',icon:'sparkles',group:''}
});
/** Dominant cover colors: the placeholder a cover fades in from. */
const AssetTones: Record<string, any> = {architecture:'#c3d3e4',coast:'#5fb3b3',botanical:'#d6cdbf',mountain:'#8e93ab'};
const SeedCards: Card[] = [
 {id:'article-01',type:'article',form:'image',image:'architecture',title:'让 AI 成为工作流的一部分',summary:'不是多一个工具，而是让想法、判断和行动顺畅地连接起来。',sources: [{name: '工作方式研究', kind: 'rss'}],meta:'6 分钟',tags:['AI','工作流'],body:articleBody,url:'https://developer.apple.com/design/human-interface-guidelines/',time:demoBase-30*MIN},
 {id:'event-01',type:'event',title:'产品讨论会',summary:'把零散的想法，整理成下一个可验证的方向。',sources: [{name: '日历', kind: 'calendar'}],start:demoBase+25*MIN,end:demoBase+70*MIN,people:['舟','林','陈'],location:'3 楼 · 小会议室',meeting:{name:'腾讯会议',url:'https://meeting.tencent.com/',code:'483 221 907'},tags:['工作'],body:['议题一：确认信息流的默认阅读状态。','议题二：验证拖拽卡片进入 AI 的完整路径。','议题三：选出下一轮值得投入的交互细节。'],time:demoBase},
 {id:'mail-01',type:'mail',title:'这周的方案，只差最后一个决定',summary:'三种方向已经整理好了。比起增加功能，我们更想先确认什么应该留下。',sources: [{name: '邮件', kind: 'mail'}],sender:'林舟',meta:'14:32',attachment:'方案对比.txt',tags:['工作','设计'],url:'https://mail.google.com/',body:['三种方向已经整理好了。比起增加功能，我们更想先确认什么应该留下。','附件里是三版对比，第二版我比较倾向，但想听听你的判断。','周四之前给我回个话就行。'],time:demoBase-40*MIN},
 {id:'note-01',type:'note',form:'quote',title:'不是收集更多，是让重要的事在对的时候出现。',summary:'',sources: [{name: '产品随记', kind: 'capture'}],meta:'刚刚',tags:['想法','产品'],body:['这是这个信息空间的起点。我们并不是在设计一个更复杂的收件箱，而是在减少每次打开页面时，重新判断优先级的成本。','好的提醒，不一定是一个弹窗。它也可以是一张恰好出现在阅读路径上的卡片。'],time:demoBase-10*MIN},
 {id:'task-01',type:'task',title:'把想法做成可以触摸的东西',summary:'今天，先做好这几件事。',sources: [{name: '提醒事项', kind: 'reminders'}],meta:'今天 18:00 前',due:demoBase+6*HOUR,tasks:[{id:'t1',text:'确认玻璃与内容的层次',done:true},{id:'t2',text:'在手机上读一遍',done:false},{id:'t3',text:'整理下一轮反馈',done:false},{id:'t7',text:'约设计评审',done:false}],tags:['工作','设计'],body:['验证一个想法，最直接的方式是让它可以被操作。'],time:demoBase-20*MIN},
 {id:'article-02',type:'article',form:'image',image:'coast',title:'注意力，也需要一点留白',summary:'我们总想读得更多，却忘了留出消化的时间。',meta:'4 分钟',sources:[{name:'阅读手记',kind:'rss'},{name:'Readwise',kind:'readwise'}],tags:['阅读','生活'],body:articleBody.slice().reverse(),time:demoBase-2*HOUR},
 {id:'suggestion-01',type:'suggestion',title:'上次那个想法，有了新的连接',summary:'「按需显现」与「卡片即上下文」在回答同一个问题：怎样少做一步。',sources: [{name: '示例助手', kind: 'agent'}],meta:'来自 2 张卡',tags:['AI','想法'],related:['note-01','article-01'],why:{reason:'AI 发现你收藏的两张卡在讨论同一件事',basis:['10月3日 和 10月9日 收藏']},body:['两张卡片都在讨论同一件事：怎样让工具顺着意图出现，而不是常驻在界面上。','你可以把它们放在一起读，比较各自强调的用户意图。'],time:demoBase-15*MIN},
 {id:'media-01',type:'media',media:'video',form:'image',image:'mountain',duration:760,title:'一个动作，比一排按钮更直接',summary:'四个片段，看卡片如何变成对话。',sources: [{name: '交互演示', kind: 'youtube'}],meta:'4 个片段',tags:['设计','AI'],url:'https://www.youtube.com/',body:['浏览：默认只看见信息。','提起：卡片变成可以交给 AI 的对象。','靠近：接收区域放大，给出清晰反馈。','松手：保留原卡片，将引用加入对话。'],time:demoBase-90*MIN},
 {id:'reminder-01',type:'reminder',form:'compact',title:'给自己留一个小空档',summary:'起身，看看窗外。',sources: [{name: '提醒', kind: 'reminders'}],meta:'10 分钟后',due:demoBase+10*MIN,tags:['生活'],body:['延后十分钟会保存在本机。到期后，点玻璃入口旁的数字让提醒重新回到桌面。'],time:demoBase-5*MIN},
 {id:'mail-02',type:'mail',title:'这份分析，值得一起看一下',summary:'我把结论放在了前面，数据和假设在后面。先判断方向，再决定深入到哪一步。',sources: [{name: '邮件', kind: 'mail'}],sender:'陈屿',meta:'11:06',attachment:'分析摘录.csv',tags:['工作'],url:'https://mail.google.com/',body:['我把结论放在了前面，数据和假设在后面。','示例数据包含三个版本的交互结果。'],time:demoBase-4*HOUR},
 {id:'digest-01',type:'digest',form:'data',title:'读得多，做得少了一点',summary:'',sources: [{name: '示例助手', kind: 'agent'}],meta:'本周回顾',tags:['回顾'],why:{reason:'每周一早上，把上周的阅读与待办放在一起看',basis:['只统计这台设备上的记录']},body:['这里汇总的是本周你的已读、收藏与已完成项目。','不会追踪其他网站，也不会上传到服务器。'],time:demoBase-3*HOUR},
 {id:'note-02',type:'note',title:'关于「少做一步」的三个观察',summary:'工具应该顺着意图出现。状态不必都写成标签。真正重要的是，操作之后还能回到原地。',sources: [{name: '速记', kind: 'capture'}],meta:'昨天',tags:['设计','想法'],body:['工具应该顺着意图出现。','状态不必都写成标签。','真正重要的是，操作之后还能回到原地。'],time:demoBase-26*HOUR},
 {id:'article-03',type:'article',form:'image',image:'botanical',title:'让日常的碎片，自然生长',summary:'笔记不只有归档，也可以在合适的时候，重新回到眼前。',sources: [{name: '知识与日常', kind: 'readwise'}],meta:'3 分钟',tags:['阅读','生活'],body:articleBody,time:demoBase-25*HOUR},
 {id:'task-02',type:'task',title:'让界面安静下来',summary:'一次小小的减法。',sources: [{name: '提醒事项', kind: 'reminders'}],tasks:[{id:'t4',text:'移除常驻筛选栏',done:true},{id:'t5',text:'把文字按钮改成图标',done:true},{id:'t6',text:'隐藏默认标签和工具',done:true}],tags:['设计'],body:['全部完成时，待办会收拢成一行。打开仍可查看和恢复每一项。'],time:demoBase-28*HOUR},
 {id:'article-04',type:'article',title:'打开，不等于读完',summary:'预览、阅读、收藏、完成，是四件不同的事。好的系统，应该替你记得这个区别。',sources: [{name: '交互小记', kind: 'rss'}],meta:'2 分钟',tags:['设计','阅读'],body:articleBody.slice(2),time:demoBase-2*86400000},
 {id:'podcast-01',type:'media',media:'podcast',duration:2880,title:'慢下来，才能看清楚',summary:'设计之外 · 第 42 期。聊信息过载，和怎样给判断留出时间。',sources: [{name: '设计之外', kind: 'podcast'}],meta:'第 42 期',tags:['设计'],url:'https://podcasts.apple.com/',body:['这一期聊信息过载，和怎样给判断留出时间。'],time:demoBase-5*HOUR},
 {id:'photo-01',type:'photo',photos:['botanical','coast','mountain'],title:'杭州 · 周末',summary:'3 张照片',sources: [{name: '照片', kind: 'photos'}],meta:'10月12日',location:'杭州',tags:['生活'],body:[],time:demoBase-30*HOUR},
 {id:'file-01',type:'file',title:'卡片积木 v3',summary:'设计稿文件夹里有 3 个新文件。',sources: [{name: '设计稿', kind: 'folder'}],meta:'10 分钟前',files:[{name:'CardBlocks.fig',meta:'设计稿 · 12.4 MB',time:demoBase-10*MIN},{name:'预设卡片.pdf',meta:'24 页 · 3.1 MB',time:demoBase-HOUR},{name:'封面.png',meta:'2400 × 1350',time:demoBase-26*HOUR}],tags:['设计'],body:[],time:demoBase-10*MIN},
 {id:'pr-01',type:'article',title:'PR #214 · 读完圆环收起',summary:'等你 review，改了 3 个文件。',sources: [{name: 'GitHub', kind: 'github'}],meta:'sill',url:'https://github.com/',tags:['工作'],body:['读到正文底部时，圆环满一圈后收起卡片。','改动：templates.js、cards.css、app.js。'],time:demoBase-50*MIN},
 {id:'linear-01',type:'article',title:'QG-142 叠卡阈值可以按来源关闭',summary:'指派给你 · 本周期。',sources: [{name: 'Linear', kind: 'linear'}],meta:'QG-142',url:'https://linear.app/',tags:['工作'],body:['同一来源一小时超过 5 张时叠起来；在单个来源设置里可以关掉。'],time:demoBase-70*MIN},
 // A burst from one source: more than five within an hour stacks into one card.
 ...[['iPhone 18 Pro 上手','一周用下来，变化最大的不是相机，是续航。'],['本周值得读的 5 篇','从注意力到工作台，五篇关于慢下来的文章。'],['一个效率工具的十年','它活下来，是因为一直在删功能。'],['播客推荐：设计之外','三期节目，聊设计师怎么做取舍。'],['我的桌面整理方法','桌面上只留今天要碰的东西。'],['一个人的工作台','独立开发者的一天，从关掉通知开始。']].map(([title,summary]: any,i?: any)=>({id:'sspai-0'+(i+1),type:'article',title,summary:summary||'少数派 · 一小时内更新',sources: [{name: '少数派', kind: 'rss'}],meta:'RSS',url:'https://sspai.com/',tags:['阅读'],body:articleBody.slice(i%3,i%3+3),time:demoBase-(35+i*6)*MIN})),
 // Time sinks cards: read a week ago goes to “读过的”; untouched for two weeks goes to “放了很久”.
 {id:'old-01',type:'article',title:'安静的界面，也需要节奏',summary:'节奏来自重复与留白。',sources: [{name: '阅读手记', kind: 'rss'}],meta:'5 分钟',tags:['设计'],body:articleBody.slice(1,4),time:demoBase-9*86400000},
 {id:'old-02',type:'media',media:'video',image:'mountain',title:'一段关于专注的短片',summary:'十分钟，讲清一个工作日的节奏。',sources: [{name: 'YouTube', kind: 'youtube'}],meta:'10 分钟',tags:['生活'],body:['片段一','片段二','片段三','片段四'],url:'https://www.youtube.com/',time:demoBase-15*86400000},
 {id:'old-03',type:'article',title:'工具观察：从收藏到行动',summary:'收藏之后的那一步，才是工具真正该帮忙的地方。',sources: [{name: '工具观察', kind: 'readwise'}],meta:'7 分钟',tags:['阅读'],body:articleBody.slice(3,6),time:demoBase-16*86400000},
 {id:'old-04',type:'article',title:'设计之外：慢一点的信息流',summary:'不是每一条都值得立刻看。',sources: [{name: '设计之外', kind: 'rss'}],meta:'4 分钟',tags:['阅读'],body:articleBody.slice(0,2),time:demoBase-20*86400000}
];
/** First-run demo state: a few cards already read or half read, so color and progress are visible. */
const SeedItems: Record<string, any> = {
 'article-04':{read:true,seen:true,progress:1,readAt:demoBase-86400000},'mail-02':{read:true,seen:true,progress:1,readAt:demoBase-HOUR},
 'article-03':{seen:true,progress:.4},'old-01':{read:true,seen:true,progress:1,readAt:demoBase-8*86400000},
 'old-02':{read:true,seen:true,progress:1,readAt:demoBase-10*86400000},'podcast-01':{seen:true,progress:.25}
};
const FreshCards: Card[] = [
 {id:'fresh-reminder',type:'reminder',form:'compact',title:'下一件事，已经在这里',summary:'新内容不插队，正在读的位置不动。',sources: [{name: '提醒', kind: 'reminders'}],meta:'刚刚',tags:['工作'],body:['这是刷新后新增的提醒。'],time:demoBase+1},
 {id:'fresh-note',type:'note',title:'把一个好想法，放在手边',summary:'试着提起这张卡片。松手后，原卡片会留在这里。',sources: [{name: '速记', kind: 'capture'}],meta:'刚刚',tags:['想法','AI'],body:['这是刷新后出现的速记。'],time:demoBase+2},
 {id:'fresh-article',type:'article',title:'从收藏到行动，中间还有一步',summary:'把最想继续的两张卡片，一起放进对话。',sources: [{name: '少数派', kind: 'rss'}],meta:'3 分钟',tags:['AI','阅读'],body:articleBody.slice(0,3),time:demoBase+3}
];

export { DAY, demoBase, articleBody, HOUR, MIN, CardTypes, SourceKinds, AssetTones, SeedCards, SeedItems, FreshCards };

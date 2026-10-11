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
const CardTypes = {
 article:{label:'资讯',icon:'book'},mail:{label:'邮件',icon:'mail'},note:{label:'笔记',icon:'note'},
 task:{label:'待办',icon:'check-circle'},event:{label:'日程',icon:'calendar'},reminder:{label:'提醒',icon:'bell'},
 media:{label:'媒体',icon:'play'},insight:{label:'阅读反馈',icon:'ring'},digest:{label:'回顾',icon:'layers'},
 suggestion:{label:'关联建议',icon:'sparkles'}
};
const SeedCards = [
 {id:'article-01',type:'article',form:'image',image:'architecture',title:'让 AI 成为工作流的一部分',summary:'不是多一个工具，而是让想法、判断和行动，顺畅地连接起来。',source:'工作方式研究',meta:'6 分钟阅读',tags:['AI','工作流'],body:articleBody,url:'https://developer.apple.com/design/human-interface-guidelines/',time:demoBase-1800000},
 {id:'event-01',type:'event',form:'standard',title:'产品讨论会',summary:'把零散的想法，整理成下一个可验证的方向。',source:'演示日程',start:demoBase+25*60000,end:demoBase+70*60000,people:['舟','林','陈'],tags:['工作'],body:['议题一：确认信息流的默认阅读状态。','议题二：验证拖拽卡片进入 AI 的完整路径。','议题三：选出下一轮值得投入的交互细节。'],time:demoBase},
 {id:'mail-01',type:'mail',form:'standard',title:'这周的方案，只差最后一个决定',summary:'三种方向已经整理好了。比起增加功能，我们更想先确认：什么应该留下，什么应该隐藏。',source:'林舟',meta:'14:32',attachment:'方案对比.txt',tags:['工作','设计'],body:['这是一封演示邮件。','我们把方案整理成了三个方向：始终可见的导航、按需浮现的操作层，以及完全依赖手势的界面。','建议先验证第二个方向：保留内容的纯净，同时不牺牲功能的可发现性。请在方便时补充你的判断。','附件会生成这三种交互方向的示例文本，没有接入真实邮箱或业务文件。'],time:demoBase-3600000},
 {id:'note-01',type:'note',form:'quote',title:'不是收集更多，\n是让重要的事\n在对的时候出现。',summary:'少一点入口，多一点自然。',source:'产品随记',meta:'刚刚写下',tags:['想法','产品'],body:['这是这个信息空间的起点。我们并不是在设计一个更复杂的收件箱，而是在减少每次打开页面时，重新判断优先级的成本。','好的提醒，不一定是一个弹窗。它也可以是一张恰好出现在阅读路径上的卡片。'],time:demoBase-600000},
 {id:'task-01',type:'task',form:'standard',title:'把想法做成可以触摸的东西',summary:'今天，先做好这三件事。',source:'演示待办',meta:'今天 18:00 前',tasks:[{id:'t1',text:'确认玻璃与内容的层次',done:true},{id:'t2',text:'试一试拖拽进入 AI',done:false},{id:'t3',text:'在手机上读一遍',done:false}],tags:['工作','设计'],body:['验证一个想法，最直接的方式是让它可以被操作。','在本页勾选任务会保存在当前浏览器。所有项目均为演示，不会修改任何外部任务系统。'],time:demoBase-1200000},
 {id:'article-02',type:'article',form:'image',image:'coast',title:'注意力，也需要一点留白',summary:'把一部分时间还给不被打断的阅读，让信息慢一点，让理解深一点。',source:'阅读手记',meta:'4 分钟阅读',tags:['阅读','生活'],body:articleBody.slice().reverse(),time:demoBase-7200000},
 {id:'insight-01',type:'insight',form:'data',title:'在这里，读了一会儿',summary:'只计算阅读页在前台的停留时间。',source:'本次会话',tags:['阅读'],body:['这个数字来自本次浏览器会话中，阅读页处于前台的累计时长。','后台标签页、信息流滚动和弹窗编辑不计入阅读时间；连续 60 秒没有交互后也暂停计时。','这是一个轻量的行为反馈，不是注意力得分，更不是准确衡量理解程度的指标。'],time:demoBase-200000},
 {id:'suggestion-01',type:'suggestion',form:'standard',title:'上次那个想法，\n有了新的连接',summary:'「按需显现」与「卡片即上下文」，其实在回答同一个问题：怎样少做一步？',source:'演示关联',meta:'来自 2 张卡片',tags:['AI','想法'],related:['note-01','article-01'],body:['本卡片是预置的演示关联，不是模型推断结果。','你可以把相关的两张卡片一起加入 AI 上下文，尝试比较它们各自强调的用户意图。'],time:demoBase-900000},
 {id:'media-01',type:'media',form:'image',image:'mountain',title:'一个动作，比一排按钮更直接',summary:'四个片段，看卡片如何变成对话。',source:'交互演示',meta:'4 个片段',tags:['设计','AI'],body:['浏览：默认只看见信息。','提起：卡片变成可以交给 AI 的对象。','靠近：接收区域放大，给出清晰反馈。','松手：保留原卡片，将引用加入对话。'],time:demoBase-5400000},
 {id:'reminder-01',type:'reminder',form:'compact',title:'给自己留一个小空档',summary:'起身，看看窗外。',source:'演示提醒',meta:'10 分钟后',due:demoBase+600000,tags:['生活'],body:['这是演示提醒，不会请求系统通知权限。','延后十分钟会保存在当前浏览器。到期后，点击玻璃入口旁的数字让提醒重新进入信息流；网页关闭后不在后台运行。'],time:demoBase-300000},
 {id:'mail-02',type:'mail',form:'standard',title:'这份分析，值得一起看一下',summary:'我把结论放在了前面，数据和假设在后面。先判断方向，再决定需要深入到哪一步。',source:'陈屿',meta:'11:06',attachment:'分析摘录.csv',tags:['工作'],body:['这是一封演示邮件。','示例数据包含三个版本的交互结果，用于展示附件下载和内容预览。','下载图标会生成一个小型示例 CSV，而不是访问真实业务文件。'],time:demoBase-14400000},
 {id:'digest-01',type:'digest',form:'data',title:'让看过的，留下线索',summary:'阅读、收藏和完成，都在这里留下一个轻巧的记录。',source:'当前浏览器',tags:['回顾'],body:['这里汇总的是本演示中你的已读、收藏与已完成项目。','不会追踪其他网站，也不会上传到服务器。'],time:demoBase-9000000},
 {id:'note-02',type:'note',form:'standard',title:'关于「少做一步」的三个观察',summary:'工具应该顺着意图出现。\n状态不必都写成标签。\n真正重要的是，操作之后还能回到原地。',source:'我的演示笔记',meta:'昨天',tags:['设计','想法'],body:['第一，工具不需要提前挤进每张卡片。','第二，已读可以变淡，进度可以是圆环，选中可以是一条细边。','第三，保持阅读位置，比多一个酷炫的过渡更重要。'],time:demoBase-DAY},
 {id:'article-03',type:'article',form:'image',image:'botanical',title:'让日常的碎片，自然生长',summary:'笔记不只有归档，也可以在合适的时候，重新回到眼前。',source:'知识与日常',meta:'3 分钟阅读',tags:['阅读','生活'],body:articleBody,time:demoBase-DAY-600000},
 {id:'task-02',type:'task',form:'standard',title:'让界面安静下来',summary:'一次小小的减法。',source:'演示待办',tasks:[{id:'t4',text:'移除常驻筛选栏',done:true},{id:'t5',text:'把文字按钮改成图标',done:true},{id:'t6',text:'隐藏默认标签和工具',done:true}],tags:['设计'],body:['全部完成时，任务卡片会收拢。你仍然可以打开预览，查看和恢复每一个项目。'],time:demoBase-DAY},
 {id:'article-04',type:'article',form:'standard',title:'打开，不等于读完',summary:'预览、阅读、收藏、完成，是四件不同的事。好的系统，应该替你记得这个区别。',source:'交互小记',meta:'2 分钟阅读',tags:['设计','阅读'],body:articleBody.slice(2),time:demoBase-2*DAY}
];
const FreshCards = [
 {id:'fresh-reminder',type:'reminder',form:'compact',title:'下一件事，已经在这里',summary:'刷新只带来新内容，不打乱你刚才读到的位置。',source:'刷新演示',meta:'刚刚',tags:['工作'],body:['这是点击刷新后新增的演示提醒。'],time:demoBase+1},
 {id:'fresh-note',type:'note',form:'standard',title:'把一个好想法，放在手边',summary:'试着提起这张卡片，交给右下角的 AI。松手后，原卡片会留在这里。',source:'新的演示笔记',meta:'刚刚',tags:['想法','AI'],body:['这是第二次点击刷新后出现的演示笔记。'],time:demoBase+2},
 {id:'fresh-article',type:'article',form:'standard',title:'从收藏到行动，中间还有一步',summary:'把最想继续的两张卡片，一起放进对话。',source:'刷新演示',meta:'刚刚',tags:['AI','阅读'],body:articleBody.slice(0,3),time:demoBase+3}
];

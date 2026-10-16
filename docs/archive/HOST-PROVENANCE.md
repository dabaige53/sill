# F06：宿主协助跨应用来源与归因

不再适用：旧阶段的说明或测试报告，仅供历史查阅，不代表当前默认产品能力。

本模式让宿主模型使用当前会话实际可用且已授权的 Notion、Google Calendar、Linear 工具读取用户指定内容，再显式交给 Sill 保存。Sill 服务本身不访问宿主插件、不继承令牌、不创建授权，也不把这些工具假定为已经安装。

服务器已配置连接器仍走 qg_collect/工作流；宿主协助导入使用已有 qg_ingest 的扩展合同。没有新的连接器框架或后台跨应用自动化。

## 两条路径

- 配置连接器：运营者在本服务配置来源，使用现有采集、准备写入、确认提交工具。
- 宿主协助：宿主先核对自己的可用工具及用户授权范围，调用实际提供方工具，再显式导入结果。外部写入仍由该提供方已授权工具执行、核对结果，不能通过普通设置或导入冒充成功。

模式名称不授予权限。元数据只是导入方对来源的声明，不能证明账户所有权或读取授权。UI明确显示这一边界。单用户数据库/密钥规则仍然适用；scope用于去重和归因，不是多租户访问控制。

## 导入合同

MCP `qg_ingest` 与认证 HTTP `POST /api/ingest` 共用相同参数和服务。旧 `{sourceId,items}` 合同保留；新模式必须显式提交 `mode:"host-assisted"`，sourceId仅允许相应的 host-notion / host-google-calendar / host-linear。这三个保留来源名称不能被旧导入或配置连接器占用；其他既有普通来源（如host-source）仍保持兼容、不会因此获得宿主归因；本地笔记仍只能走本地笔记工具。

以下是结构示例，示例 ID 并不代表实际可访问记录。真实导入只能使用工具已经返回、并已核对的字段。

```json
{
  "mode": "host-assisted",
  "sourceId": "host-notion",
  "items": [{
    "externalId": "be633bf1-dfa0-436d-b259-571129a590e5",
    "title": "项目记录",
    "content": "工具实际返回的来源文字",
    "summary": "由模型单独撰写的摘要",
    "url": "https://app.notion.com/p/Project-be633bf1dfa0436db259571129a590e5",
    "kind": "note",
    "truncated": false,
    "expectedRevision": 0,
    "provenance": {
      "provider": "notion",
      "upstreamId": "be633bf1-dfa0-436d-b259-571129a590e5",
      "scope": {"accountId":"actual-account-id","workspaceId":"actual-workspace-id"},
      "retrievedAt": "2026-10-11T06:00:00Z",
      "partial": false,
      "contentOrigin": "upstream-original",
      "summaryOrigin": "model-summary"
    }
  }]
}
```

- provider是 notion/google-calendar/linear之一。externalId必须与upstreamId一致。Notion/Linear需要accountId和workspaceId；Google Calendar需要accountId和calendarId。范围字段不得使用不相关类型或任意属性。
- Calendar计时记录必须提供有效start/end且结束晚于开始；全天记录必须allDay:true、有效startDate/endDate且结束日为不包含的后续日期。不能混用两种时间形式。
- retrievedAt、partial、truncated、content、expectedRevision必须显式提供。可附工具返回的upstreamUpdatedAt；不能凭空生成。
- HTTPS直达链接必须属于对应提供方的受支持页面路径，不接受用户名/密码、非标准端口或任意外域。拒绝明显凭据查询参数；Notion链接必须包含页面UUID；UUID形式的上游ID会与其核对，同一UUID的大小写/连字符形式用于同一去重身份。不会抓取链接、触发登录或自动打开它。用户主动打开来源时，原生视图使用宿主openLinks能力；不支持时提示手动复制。
- contentOrigin是upstream-original或model-summary。只有模型摘要时content必须为空、summary非空且summaryOrigin为model-summary；UI不会把它当作原文。
- summary非空必须明确summaryOrigin为upstream-original或model-summary；空摘要不带summaryOrigin。个人备注与来源正文、来源标签分别保存。
- partial表示采集范围/分页尚未完整；truncated表示单条正文截断。partial:false仅描述导入方当前记录，不证明已读取全部工作区。

数据量、字段长度、时间格式和未知字段在共享schema中严格限制。一次最多50条；同一批不能重复相同范围身份。整个批次在一个事务中校验与保存，任一冲突均回滚，不留下半批写入。

## 身份、版本与重试

卡片稳定身份由提供方、完整来源范围和upstreamId决定，与标题、查询、读取时间和批次无关。相同上游ID在不同账户/工作区/日历不会相互覆盖；外部记录身份不与本地笔记混用。

初次 expectedRevision=0；成功保存从revision1开始。更新需要读取当前卡片，提交其revision。成功载荷的完全相同重试返回当前卡片及replayed标记，旧重试不会恢复旧版本；变更载荷、过期版本、倒退时间或同一上游版本的矛盾内容返回INGEST_CONFLICT。冲突详情提供reason和current，调用者应核对来源，不自动覆盖。

同一上游版本的截断原文可以在CAS通过、读取时间不倒退且旧文字为新文字的精确前缀时补全；其他原始字段也需相容。不能借“补全”悄悄改写已有原文。模型摘要变化与原始内容变化分开判断。只有模型摘要的旧记录可在其他原始字段一致时补入原文；已有原文不能降级为模型摘要。

阅读/收藏状态、个人备注及已有证据保持。审计只记录来源、ID、版本、计数和动作，不复制正文、摘要、URL、范围值或凭据。服务接收时间独立于导入方提供的读取时间。

## 页面与上下文

信息流显示提供方、宿主导入以及原文/模型摘要和覆盖标记。预览与阅读显示范围、上游ID、读取时间、正文/摘要类型及直达来源链接。模型摘要明确标记，来源正文单独展示；已保存证据卡片可继续查看。

宿主选中引用与独立网页请求快照携带有界、允许列表内的归因。选中引用每条序列化UTF-8最多2,800字节、总计24,000字节；超限依次省略链接、节选/摘要、归因，并显式标记省略及needsFullRead。身份字段和链接不会静默截断为另一个值，完整信息可通过qg_get_card读取。独立AI的冻结上下文也携带正文/摘要类型和partial标记，避免把模型总结变成无标签的原始证据。所有这些字段均是不可信参考数据，不能转化为系统指令或外部写入授权。

## 验证边界与依据

测试使用合成的宿主工具结果及真实本地MCP/HTTP服务，验证导入、读取、范围隔离、重复/冲突/截断、持久化以及浏览器显示。宿主模拟器不等于实际账户连接；本次没有安装应用、读取用户真实Notion/Calendar/Linear内容、生成OAuth或执行外部写入。

字段语义核对依据：[Notion Page对象](https://developers.notion.com/reference/page)、[Google Calendar Event对象](https://developers.google.com/workspace/calendar/api/v3/reference/events)、[Linear GraphQL接口](https://linear.app/developers/graphql)。使用工具实际返回的页面url/事件htmlLink/issue URL，不根据标题猜链接。Notion页面正文需单独读取块；元数据返回不意味着正文已完整读取。

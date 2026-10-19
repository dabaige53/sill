# Sill Apple

更新：2026-10-17。

一个 Swift Package。macOS 用 SwiftUI 与 AppKit 实现当前 Web 工作台，默认登录同一云端账号并读写同一工作区；不使用 WebView、Node 或后台服务。SillKit 提供卡片校验、本地存储与云端客户端。iOS 仍只有共享数据层，没有界面或设备验收。

## 产品与数据

- 页面、卡片配方、文案、图标和状态以当前 Web 与设计系统为准，不另外设计 Mac 版。四格底部导航保留主页、搜索、AI、设置；已有正文由助手修改，用户保留速记与轻操作。
- 云端使用既有密码登录、会话、工作区与原子批量接口。Cookie 保存在系统钥匙串，密码不持久保存；固定可信 HTTPS 服务，不自动跟随重定向，不使用 service-role 凭据。账号切换清理界面中的旧账号内容。
- 邮件登录新增 `client=macos` 的 PKCE 回调适配。浏览器只把一次性 code 转给 `sill://auth/callback`，原生持有验证信息并回 HTTPS 兑换。回调地址已写入应用包；这条链路需要服务端发布并核对 Supabase redirect 配置，源码完成不表示线上已可用。
- 卡片写入携带读取时的版本；标签与备注保留打开时的编辑基准，冲突保留输入。批量操作整批保存。请求结果未知先读取确认，不重发写请求；未确认前阻止新的写操作。待核对请求只在当前进程保留，不是持久执行队列。
- AI 页与 Web 一样只展示所选卡片和临时输入，不能发送，不连接模型。独立原生应用没有 MCP App 宿主消息能力，不显示虚假的助手交接入口。
- Web 的演示媒体按相同片段和进度展示，不表示播放外部音视频。来源字段只记录出处，不接入来源或同步外部内容。

## 本地数据兼容

旧数据 `~/Library/Application Support/Sill/` 保持原样，不自动上传。显式传入 `--data-directory /tmp/sill-native-check` 可打开独立本地工作区，供合成数据检查使用。默认启动走云端，不把本地文件当作当前账号数据。

本地 cards.json 保留 revision/state 结构、未知字段与旧来源迁移。每次写入在文件锁内读取并检查版本，再原子替换；桌面会话持有独占锁。第二个应用不能同时编辑同一工作区。锁文件存在不表示正在占用。

## 构建与检查

需要 Apple Silicon Mac、支持 Swift 6 的 Xcode 和 Node 24+。Node 只用于构建，不进入应用包。

```sh
node tests/apple/run.ts
node scripts/build-macos.ts
codesign --verify --deep --strict dist/macos/Sill.app
```

产物为 `dist/macos/Sill.app`，仅本机 ad-hoc 签名；构建不表示安装、公证、部署或真实账号验收。测试使用临时目录与模拟 HTTP 响应，不访问真实卡片或账号。桌面视觉与交互须另外在实际窗口对照 Web 检查，不能用编译通过替代 1:1 验收。

类型、文案和图标在构建时由 `contracts/` 与 `design-system/` 生成。四张封面 PNG 是 Web 现有 SVG 图像的原生资源副本；构建随 SwiftPM 资源包复制，不能依赖开发机的路径。新增设计值必须回到设计系统维护。

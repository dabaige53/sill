# Mac 启动反复询问钥匙串权限

## 问题与状态

待定位；最近检查：2026-11-03。用户报告每次打开 Sill 都出现访问 `one.sill.cloud-session` 的钥匙串确认框。未确认此前选择“允许”还是“始终允许”，也未确认两次启动间是否替换过构建。

## 环境与触发

macOS，已安装 `/Applications/Sill.app`，arm64。用户截图显示输入“登录”钥匙串密码及“始终允许”“拒绝”“允许”按钮。预期授权后再次启动可读取已有登录会话。

## 定位依据

- `apps/apple/SillKit/CloudSessionVault.swift` 通过 `SecItemCopyMatching` 读取同名通用密码项，保存时更新已有项，不主动删除再创建。
- `scripts/build-macos.ts` 使用 `codesign --force --deep --sign -`；发布操作手册也说明当前是临时签名。
- 本轮只读检查已安装应用的签名：`Signature=adhoc`、`TeamIdentifier=not set`，应用身份要求为 `cdhash`。没有读取钥匙串内容。
- Apple 的 [Code Signing Requirement Language](https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/RequirementLang/RequirementLang.html) 说明临时签名只识别被签名的这一个程序，不具有证书身份。更换构建后原授权可能不再匹配；这是更新后再次询问的解释，尚未证明同一构建每次启动都询问的原因。

## 处理情况

未修改应用源码、签名配置或系统钥匙串。建议用户输入 Mac 登录钥匙串密码，选择“始终允许”，然后观察同一构建退出重开是否仍提示。

正式分发采用稳定的 Developer ID Application 签名是后续候选方案；本轮未读取证书或配置发布凭据。公证与钥匙串授权属于不同机制，不能用公证代替稳定签名。

## 验证与后续

完成源码、打包入口和已安装应用签名的只读检查。未运行应用、读取钥匙串访问控制或复现弹窗。若同一构建选择“始终允许”后仍提示，下一步检查实际运行路径及该条目的访问控制；若只在更新后出现，继续处理稳定签名及旧条目授权迁移。

## 固定签名实施

用户确认后改用固定自签证书 `Sill Self-Signed`：`scripts/create-macos-signing-cert.sh` 一次性生成证书并写入 GitHub secrets，`macos-package.yml` 导入临时钥匙串签名，缺少 secret 时构建失败；签名后检查指定要求绑定证书（`certificate leaf`），不再是 `cdhash`。用户对新身份点一次“始终允许”后，后续版本应不再询问。仍未经 Apple 公证。

证书与 secrets 已在 GitHub 配置。签名流程在 GitHub Actions 执行，安装后的钥匙串表现尚待用户在真机确认。

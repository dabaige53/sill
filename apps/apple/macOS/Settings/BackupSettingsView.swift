import AppKit
import SillKit
import SwiftUI
import UniformTypeIdentifiers

private struct BackupRequestKey: EnvironmentKey {
  static let defaultValue: BackupRequest? = nil
}
private struct BackupRestoredKey: EnvironmentKey {
  static let defaultValue: (@MainActor @Sendable () async -> Bool)? = nil
}
extension EnvironmentValues {
  var backupRequest: BackupRequest? {
    get { self[BackupRequestKey.self] }
    set { self[BackupRequestKey.self] = newValue }
  }
  var backupRestored: (@MainActor @Sendable () async -> Bool)? {
    get { self[BackupRestoredKey.self] }
    set { self[BackupRestoredKey.self] = newValue }
  }
}

/// Account settings only. Passwords stay in these transient controls and travel directly to HTTP.
struct BackupSettingsView: View {
  @Environment(\.backupRequest) private var request
  @Environment(\.backupRestored) private var restored
  @State private var model = BackupModel()
  @State private var provider = "webdav"
  @State private var endpoint = ""
  @State private var username = ""
  @State private var password = ""
  @State private var accountID = ""
  @State private var bucket = ""
  @State private var accessKey = ""
  @State private var secretKey = ""
  private func text(_ key: String) -> String { Copy.text("web.backup." + key) }

  var body: some View {
    if request != nil {
      VStack(alignment: .leading, spacing: AppleMetrics.space12) {
        Text(text("hint")).font(.sans(AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
        heading("folder", "configure", "configureHint")
        SettingsCard {
          SettingRow(label: text("provider"), first: true) {
            SettingSegmented(
              label: text("provider"), options: [("webdav", text("webdav")), ("r2", text("r2"))],
              selection: provider
            ) { provider = $0 }
          }
          if provider == "webdav" {
            field("endpoint", $endpoint)
            field("username", $username)
            secret("password", $password)
          } else {
            field("accountId", $accountID)
            field("bucket", $bucket)
            field("accessKeyId", $accessKey)
            secret("secretAccessKey", $secretKey)
          }
          SettingLine {
            Button {
              Task { await model.run { try await save(false) } }
            } label: {
              actionLabel("save", "plus")
            }
            .buttonStyle(TextLinkStyle(padded: false)).disabled(!valid)
            Button {
              Task { await model.run { try await save(true) } }
            } label: {
              actionLabel("updateSecret", "lock")
            }
            .buttonStyle(TextLinkStyle(padded: false)).disabled(model.selected.isEmpty || !valid)
          }
        }
        heading("cloud-upload", "manual", "manualHint")
        SettingsCard {
          if model.targets.isEmpty {
            SettingLine(first: true) {
              Icon("folder", size: AppleMetrics.font18).foregroundStyle(AppleColors.secondary)
              Text(text("choose")).foregroundStyle(AppleColors.secondary)
            }
          }
          ForEach(model.targets.indices, id: \.self) { index in
            let target = model.targets[index]
            let id = target["id"]?.string ?? ""
            SettingLine(first: index == 0) {
              Button {
                model.selected = id
              } label: {
                HStack(spacing: AppleMetrics.space12) {
                  Icon("folder", size: AppleMetrics.font18)
                  Text(
                    target["config"]?["endpoint"]?.string ?? "R2 · "
                      + (target["config"]?["bucket"]?.string ?? "")
                  )
                  .lineLimit(2)
                  .frame(maxWidth: .infinity, alignment: .leading)
                  if model.selected == id { Icon("check", size: AppleMetrics.font14) }
                }
              }.buttonStyle(TextLinkStyle(padded: false)).disabled(model.hasPendingCreation)
            }
          }
          SettingLine {
            Button {
              Task {
                await model.run {
                  _ = try await model.call("/targets/\(model.selected)/check", "POST", .object([:]))
                  model.message = text("connected")
                }
              }
            } label: {
              actionLabel("check", "shield-check")
            }
            .buttonStyle(TextLinkStyle(padded: false)).disabled(model.selected.isEmpty)
            Spacer(minLength: 0)
            Button {
              Task { await model.run { try await model.create() } }
            } label: {
              actionLabel(model.hasPendingCreation ? "retry" : "create", "cloud-upload")
                .padding(.horizontal, AppleMetrics.space12)
                .padding(.vertical, AppleMetrics.space8)
                .foregroundStyle(AppleColors.fixedWhite)
                .background(
                  RoundedRectangle(cornerRadius: AppleMetrics.controlRadius)
                    .fill(AppleColors.accentFill))
            }
            .buttonStyle(PrimaryPillStyle()).disabled(
              model.selected.isEmpty || model.restore != nil)
          }
          SettingLine {
            Button {
              Task { await model.run { try await model.refresh() } }
            } label: {
              actionLabel("refresh", "refresh")
            }
            .buttonStyle(TextLinkStyle(padded: false))
          }
        }
        if !model.message.isEmpty {
          HStack(alignment: .top, spacing: AppleMetrics.space8) {
            Icon("info", size: AppleMetrics.font16).foregroundStyle(AppleColors.secondary)
            Text(model.message).font(.sans(AppleMetrics.font13)).accessibilityAddTraits(
              .updatesFrequently)
          }
        }
        heading("history", "history", "historyHint")
        if model.backups.isEmpty {
          SettingsCard {
            HStack(spacing: AppleMetrics.space12) {
              Icon("history", size: AppleMetrics.font20)
              Text(text("empty")).font(.sans(AppleMetrics.font13))
            }
            .foregroundStyle(AppleColors.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, AppleMetrics.space20)
          }
        }
        ForEach(model.backups.indices, id: \.self) { index in
          let backup = model.backups[index]
          let id = backup["id"]?.string ?? ""
          SettingsCard {
            SettingLine(first: true) {
              Icon("file", size: AppleMetrics.font18).foregroundStyle(AppleColors.secondary)
              Text(backupDate(backup["createdAt"]?.string ?? ""))
                .frame(maxWidth: .infinity, alignment: .leading)
              Text(text(backup["status"]?.string ?? "pending"))
                .font(.sans(AppleMetrics.font12)).foregroundStyle(AppleColors.secondary)
            }
            SettingLine {
              Button {
                Task {
                  await model.run {
                    model.preview = try await model.call("/\(id)/preview")
                  }
                }
              } label: {
                actionLabel("preview", "eye")
              }
              .buttonStyle(TextLinkStyle(padded: false)).disabled(model.restore != nil)
              Button {
                Task {
                  await model.run {
                    _ = try await model.call("/\(id)/check")
                    try await model.refresh()
                    model.message = text("verified")
                  }
                }
              } label: {
                actionLabel("verify", "shield-check")
              }
              .buttonStyle(TextLinkStyle(padded: false))
              Button {
                Task { await model.run { try await download(id) } }
              } label: {
                actionLabel("download", "download")
              }
              .buttonStyle(TextLinkStyle(padded: false))
            }
          }
        }
        if let preview = model.preview {
          heading("history", "restoreTitle", "replaceWarning")
          Text(
            "\(text("cards")): \(Int(preview["cards"]?.number ?? 0)) · \(text("added")): \(Int(preview["added"]?.number ?? 0)) · \(text("removed")): \(Int(preview["removed"]?.number ?? 0))"
          )
          .font(.sans(AppleMetrics.font13))
          HStack {
            if model.restore != nil {
              Button(text("verifyRestore")) {
                Task { await model.run { try await model.verifyRestore() } }
              }
              .buttonStyle(TextLinkStyle(padded: false))
            }
            Button(text(model.restore == nil ? "confirm" : "retryRestore")) {
              Task { await model.run { try await model.confirm() } }
            }.buttonStyle(TextLinkStyle(warn: true, padded: false))
            if model.restore == nil {
              Button(Copy.text("web.cancel")) { model.preview = nil }
                .buttonStyle(TextLinkStyle(padded: false))
            }
          }
        }
      }
      .disabled(model.busy)
      .task {
        if let request {
          model.configure(request)
          model.restored = restored
        }
        await model.run { try await model.refresh() }
      }
      .onDisappear {
        password = ""
        secretKey = ""
      }
    }
  }
  private func heading(_ glyph: String, _ title: String, _ hint: String) -> some View {
    SettingsSectionHeading(icon: glyph, title: text(title), hint: text(hint))
  }

  private func actionLabel(_ key: String, _ glyph: String) -> some View {
    HStack(spacing: AppleMetrics.space6) {
      Icon(glyph, size: AppleMetrics.font16)
      Text(text(key)).fixedSize(horizontal: false, vertical: true)
    }
  }

  private func backupDate(_ value: String) -> String {
    guard let date = Format.parseDate(value) else { return value }
    return date.formatted(date: .numeric, time: .shortened)
  }

  private var valid: Bool {
    let fields =
      provider == "webdav"
      ? [endpoint, username, password] : [accountID, bucket, accessKey, secretKey]
    return fields.allSatisfy { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
  }

  private func save(_ update: Bool) async throws {
    guard valid else { return }
    var fields: [String: JSONValue] =
      provider == "webdav"
      ? [
        "provider": .string(provider), "endpoint": .string(endpoint), "username": .string(username),
        "password": .string(password),
      ]
      : [
        "provider": .string(provider), "accountId": .string(accountID), "bucket": .string(bucket),
        "accessKeyId": .string(accessKey), "secretAccessKey": .string(secretKey),
      ]
    if update { fields["id"] = .string(model.selected) }
    _ = try await model.call("/targets", "POST", .object(fields))
    endpoint = ""
    username = ""
    password = ""
    accountID = ""
    bucket = ""
    accessKey = ""
    secretKey = ""
    try await model.refresh()
    model.message = text("connected")
  }
  private func field(_ key: String, _ value: Binding<String>) -> some View {
    SettingRow(label: text(key)) {
      TextField(text(key), text: value).textFieldStyle(.plain).font(.sans(AppleMetrics.font13))
    }
  }
  private func secret(_ key: String, _ value: Binding<String>) -> some View {
    SettingRow(label: text(key)) {
      SecureField(text(key), text: value).textFieldStyle(.plain).font(.sans(AppleMetrics.font13))
    }
  }
  private func download(_ id: String) async throws {
    let value = try await model.call("/\(id)/download")
    let panel = NSSavePanel()
    panel.allowedContentTypes = [.json]
    panel.nameFieldStringValue = "sill-\(id).json"
    if panel.runModal() == .OK, let url = panel.url {
      try value.encoded().write(to: url, options: .atomic)
    }
  }
}

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
        Text(text("title")).font(.sans(AppleMetrics.font16, .semibold))
        Text(text("hint")).font(.sans(AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
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
            Button(text("save")) { Task { await model.run { try await save(false) } } }
              .buttonStyle(TextLinkStyle(padded: false))
            Button(text("updateSecret")) { Task { await model.run { try await save(true) } } }
              .buttonStyle(TextLinkStyle(padded: false)).disabled(model.selected.isEmpty)
          }
        }
        SettingsCard {
          ForEach(model.targets.indices, id: \.self) { index in
            let target = model.targets[index]
            let id = target["id"]?.string ?? ""
            SettingLine(first: index == 0) {
              Button {
                model.selected = id
              } label: {
                HStack {
                  Text(
                    target["config"]?["endpoint"]?.string ?? "R2 · "
                      + (target["config"]?["bucket"]?.string ?? ""))
                  if model.selected == id { Icon("check", size: AppleMetrics.font14) }
                }
              }.buttonStyle(TextLinkStyle(padded: false)).disabled(model.hasPendingCreation)
            }
          }
          SettingLine {
            Button(text("check")) {
              Task {
                await model.run {
                  _ = try await model.call("/targets/\(model.selected)/check", "POST", .object([:]))
                  model.message = text("connected")
                }
              }
            }.buttonStyle(TextLinkStyle(padded: false)).disabled(model.selected.isEmpty)
            Button(text(model.hasPendingCreation ? "retry" : "create")) {
              Task { await model.run { try await model.create() } }
            }
            .buttonStyle(TextLinkStyle(padded: false)).disabled(
              model.selected.isEmpty || model.restore != nil)
            Button(text("refresh")) { Task { await model.run { try await model.refresh() } } }
              .buttonStyle(TextLinkStyle(padded: false))
          }
        }
        if !model.message.isEmpty {
          Text(model.message).font(.sans(AppleMetrics.font13)).accessibilityAddTraits(
            .updatesFrequently)
        }
        Text(text("history")).font(.sans(AppleMetrics.font14, .semibold))
        if model.backups.isEmpty { Text(text("empty")).font(.sans(AppleMetrics.font13)) }
        ForEach(model.backups.indices, id: \.self) { index in
          let backup = model.backups[index]
          let id = backup["id"]?.string ?? ""
          SettingsCard {
            SettingRow(label: backup["createdAt"]?.string ?? "", first: true) {
              Text(text(backup["status"]?.string ?? "pending"))
            }
            SettingLine {
              Button(text("preview")) {
                Task {
                  await model.run {
                    model.preview = try await model.call("/\(id)/preview")
                  }
                }
              }.buttonStyle(TextLinkStyle(padded: false)).disabled(model.restore != nil)
              Button(text("verify")) {
                Task {
                  await model.run {
                    _ = try await model.call("/\(id)/check")
                    try await model.refresh()
                    model.message = text("verified")
                  }
                }
              }.buttonStyle(TextLinkStyle(padded: false))
              Button(text("download")) { Task { await model.run { try await download(id) } } }
                .buttonStyle(TextLinkStyle(padded: false))
            }
          }
        }
        if let preview = model.preview {
          Text(text("replaceWarning")).font(.sans(AppleMetrics.font13))
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
  private func save(_ update: Bool) async throws {
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
    password = ""
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

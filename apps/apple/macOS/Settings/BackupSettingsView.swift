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
  @State private var editor: Editor?
  @State private var formContext = "add"
  @State private var drafts: [String: [String: String]] = [:]
  @State private var returnFocus = "addTarget"
  @FocusState private var focusedField: String?
  private enum Editor: Equatable { case add, update }
  private func text(_ key: String) -> String { Copy.text("web.backup." + key) }

  var body: some View {
    if request != nil {
      VStack(alignment: .leading, spacing: AppleMetrics.space12) {
        if editor != nil {
          connectionForm
        } else {
          overview
        }
        if !model.message.isEmpty {
          HStack(alignment: .top, spacing: AppleMetrics.space8) {
            Icon("info", size: AppleMetrics.font16).foregroundStyle(AppleColors.secondary)
            Text(model.message).font(.sans(AppleMetrics.font13)).accessibilityAddTraits(
              .updatesFrequently)
          }
        }
        if editor == nil {
          HStack {
            Text(text("history"))
              .font(.sans(AppleMetrics.font15, .semibold))
              .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 0)
            Button {
              Task { await model.run { try await model.refresh() } }
            } label: {
              actionLabel("refresh", "refresh")
            }
            .buttonStyle(TextLinkStyle(padded: false))
          }
          .padding(.top, AppleMetrics.space16)
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
      }
      .disabled(model.busy)
      .onChange(of: editor) { _, mode in
        if mode == nil { focusedField = returnFocus }
      }
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
        drafts.removeAll()
      }
    }
  }
  private var overview: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space8) {
      Text(text("title"))
        .font(.sans(AppleMetrics.font22, .bold))
        .accessibilityAddTraits(.isHeader)
        .padding(.bottom, AppleMetrics.space16)
      SettingsCard {
        SettingLine(first: true) {
          if model.targets.isEmpty {
            Button {
              openEditor(.add)
            } label: {
              HStack(spacing: AppleMetrics.space12) {
                actionLabel("addTarget", "plus")
                Spacer(minLength: 0)
                Icon("chevron", size: AppleMetrics.font16)
              }
              .frame(maxWidth: .infinity, minHeight: AppleMetrics.hitTarget)
            }
            .buttonStyle(TextLinkStyle(padded: false))
            .focused($focusedField, equals: "addTarget")
          } else {
            Icon("folder", size: AppleMetrics.font20).foregroundStyle(AppleColors.secondary)
            if model.targets.count == 1, let target = model.targets.first {
              Text(
                target["config"]?["endpoint"]?.string ?? "R2 · "
                  + (target["config"]?["bucket"]?.string ?? "")
              )
              .frame(maxWidth: .infinity, alignment: .leading)
              .fixedSize(horizontal: false, vertical: true)
            } else {
              Picker(text("target"), selection: $model.selected) {
                ForEach(model.targets.indices, id: \.self) { index in
                  let target = model.targets[index]
                  Text(
                    target["config"]?["endpoint"]?.string ?? "R2 · "
                      + (target["config"]?["bucket"]?.string ?? "")
                  ).tag(target["id"]?.string ?? "")
                }
              }
              .labelsHidden()
              .pickerStyle(.menu)
              .menuStyle(.borderlessButton)
              .menuIndicator(.hidden)
              .disabled(model.hasPendingCreation)
            }
            Button {
              openEditor(.update)
            } label: {
              actionLabel("connectionSettings", "gear")
            }
            .buttonStyle(TextLinkStyle(padded: false)).disabled(model.hasPendingCreation)
            .focused($focusedField, equals: "connectionSettings")
          }
        }
        SettingLine {
          if !model.targets.isEmpty {
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
          }
          Spacer(minLength: 0)
          Button {
            Task { await model.run { try await model.create() } }
          } label: {
            primaryLabel(model.hasPendingCreation ? "retry" : "create", "cloud-upload")
          }
          .buttonStyle(PrimaryPillStyle())
          .disabled(model.selected.isEmpty || model.restore != nil)
        }
      }
      if !model.targets.isEmpty {
        Button {
          openEditor(.add)
        } label: {
          actionLabel("addTarget", "plus")
        }
        .buttonStyle(TextLinkStyle(padded: false))
        .disabled(model.hasPendingCreation)
        .focused($focusedField, equals: "addTarget")
      }
    }
  }

  private var connectionForm: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space20) {
      Button {
        editor = nil
      } label: {
        actionLabel("title", "back")
      }
      .buttonStyle(TextLinkStyle(padded: false))
      Text(text(editor == .update ? "connectionSettings" : "addTarget"))
        .font(.sans(AppleMetrics.font22, .bold))
        .accessibilityAddTraits(.isHeader)
      SettingsCard {
        SettingLine(first: true) {
          SettingSegmented(
            label: text("provider"), options: [("webdav", text("webdav")), ("r2", text("r2"))],
            selection: provider
          ) { provider = $0 }
          .disabled(editor == .update)
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
      }
      HStack(spacing: AppleMetrics.space16) {
        Spacer(minLength: 0)
        Button(Copy.text("web.cancel")) { editor = nil }
          .buttonStyle(TextLinkStyle(padded: false))
        Button {
          Task { await model.run { try await save(editor == .update) } }
        } label: {
          primaryLabel(editor == .update ? "updateSecret" : "save", "shield-check")
        }
        .buttonStyle(PrimaryPillStyle()).disabled(!valid)
      }
    }
    .onAppear {
      focusedField =
        editor == .update
        ? (provider == "webdav" ? "username" : "accessKeyId")
        : (provider == "webdav" ? "endpoint" : "accountId")
    }
  }

  private func openEditor(_ mode: Editor) {
    let context = mode == .add ? "add" : model.selected
    if context != formContext {
      drafts[formContext] = [
        "provider": provider, "endpoint": endpoint, "username": username, "password": password,
        "accountId": accountID, "bucket": bucket, "accessKeyId": accessKey,
        "secretAccessKey": secretKey,
      ]
      let config = model.targets.first(where: { $0["id"]?.string == context })?["config"]
      let draft = drafts[context] ?? [:]
      provider = draft["provider"] ?? config?["provider"]?.string ?? "webdav"
      endpoint = draft["endpoint"] ?? config?["endpoint"]?.string ?? ""
      accountID = draft["accountId"] ?? config?["accountId"]?.string ?? ""
      bucket = draft["bucket"] ?? config?["bucket"]?.string ?? ""
      username = draft["username"] ?? ""
      password = draft["password"] ?? ""
      accessKey = draft["accessKeyId"] ?? ""
      secretKey = draft["secretAccessKey"] ?? ""
      formContext = context
    }
    returnFocus = mode == .add ? "addTarget" : "connectionSettings"
    editor = mode
    model.message = ""
  }

  private func primaryLabel(_ key: String, _ glyph: String) -> some View {
    actionLabel(key, glyph)
      .padding(.horizontal, AppleMetrics.space12)
      .frame(minHeight: AppleMetrics.hitTarget)
      .foregroundStyle(AppleColors.fixedWhite)
      .background(
        RoundedRectangle(cornerRadius: AppleMetrics.controlRadius).fill(AppleColors.accentFill))
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
    let saved = try await model.call("/targets", "POST", .object(fields))
    endpoint = ""
    username = ""
    password = ""
    accountID = ""
    bucket = ""
    accessKey = ""
    secretKey = ""
    drafts.removeValue(forKey: formContext)
    try await model.refresh()
    model.selected = saved["id"]?.string ?? model.selected
    returnFocus = "connectionSettings"
    editor = nil
    model.message = text("connected")
  }
  private func field(_ key: String, _ value: Binding<String>) -> some View {
    SettingRow(label: text(key)) {
      TextField(text(key), text: value).textFieldStyle(.plain).font(.sans(AppleMetrics.font13))
        .focused($focusedField, equals: key)
        .disabled(editor == .update && ["endpoint", "accountId", "bucket"].contains(key))
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

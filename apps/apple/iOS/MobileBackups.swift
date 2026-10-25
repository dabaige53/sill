import Foundation
import Observation
import SillKit

/// Preserve each request through uncertain outcomes so a retry cannot create a new operation.
@MainActor @Observable final class MobileBackups {
  var targets: [JSONValue] = []
  var backups: [JSONValue] = []
  var selected = ""
  var busy = false
  var message = ""
  var preview: JSONValue?
  private(set) var restore: BackupRestore?
  private var creation: JSONValue?
  var pending: Bool { creation != nil || restore != nil }
  var pendingCreation: Bool { creation != nil }
  var request: BackupRequest?

  func call(_ path: String = "", _ method: String = "GET", _ body: JSONValue? = nil) async throws -> JSONValue {
    guard let request else { throw CloudWorkspaceError.unauthenticated }
    return try await request("/api/v1/backups" + path, method, body)
  }

  func refresh() async throws {
    let response = try await call()
    targets = response["targets"]?.array ?? []
    backups = response["backups"]?.array ?? []
    if selected.isEmpty { selected = targets.first?["id"]?.string ?? "" }
  }

  func run(_ operation: () async throws -> Void) async {
    guard !busy else { return }
    busy = true
    message = ""
    defer { busy = false }
    do { try await operation() }
    catch CloudWorkspaceError.service(let code, _) {
      message = Self.text(
        code == "revision_conflict" || code == "idempotency_conflict" ? "conflict"
          : code == "backup_auth_failed" ? "authFailed"
          : code == "backup_unknown" ? "unknown" : "failed")
    } catch { message = Self.text("unknown") }
  }

  func create() async throws {
    guard restore == nil else { return }
    let firstAttempt = creation == nil
    if firstAttempt {
      creation = .object([
        "targetId": .string(selected), "idempotencyKey": .string(UUID().uuidString),
      ])
    }
    do {
      _ = try await call("", "POST", creation)
    } catch {
      // A different request or a failed retry cannot resolve an earlier uncertain write.
      if firstAttempt, Self.definitiveFailure(error) { creation = nil }
      throw error
    }
    creation = nil
    try await refresh()
    message = Self.text("created")
  }

  func confirm(workspace: MobileWorkspace) async throws {
    guard creation == nil else { return }
    let firstAttempt = restore == nil
    if firstAttempt, let preview { restore = try BackupRestore(preview: preview) }
    guard let restore else { return }
    do {
      _ = try await call("/restore", "POST", restore.body)
    } catch {
      if firstAttempt, Self.definitiveFailure(error) {
        self.restore = nil
        self.preview = nil
      }
      throw error
    }
    await finishRestore(workspace)
  }

  func verifyRestore(workspace: MobileWorkspace) async throws {
    guard let restore else { return }
    let response = try await call("/restore/status", "POST", restore.body)
    if response["result"]?.object != nil {
      await finishRestore(workspace)
    } else { message = Self.text("notRestored") }
  }

  private func finishRestore(_ workspace: MobileWorkspace) async {
    restore = nil
    preview = nil
    await workspace.refresh()
    message = Self.text(workspace.error == nil ? "restored" : "restoredNeedsRefresh")
  }

  private static func definitiveFailure(_ error: Error) -> Bool {
    if case CloudWorkspaceError.service(let code, let status) = error {
      return (400...499).contains(status) && code != "backup_unknown"
    }
    return (error as? CloudWorkspaceError) == .unauthenticated
  }

  static func text(_ key: String) -> String { Copy.text("web.backup." + key) }
}

#if os(iOS)
import SwiftUI

struct MobileBackupSettings: View {
  let workspace: MobileWorkspace
  @State var model: MobileBackups
  @State private var provider = "webdav"
  @State private var endpoint = ""
  @State private var username = ""
  @State private var password = ""
  @State private var accountID = ""
  @State private var bucket = ""
  @State private var accessKey = ""
  @State private var secretKey = ""
  @State private var confirmingRestore = false
  @State private var exporting = false
  @State private var document = MobileJSONDocument(data: Data())
  @Environment(\.scenePhase) private var scenePhase
  private func text(_ key: String) -> String { MobileBackups.text(key) }

  var body: some View {
    Form {
      Section {
        Picker(text("provider"), selection: $provider) {
          Text(text("webdav")).tag("webdav")
          Text(text("r2")).tag("r2")
        }
        if provider == "webdav" {
          field("endpoint", $endpoint).keyboardType(.URL)
          field("username", $username)
          SecureField(text("password"), text: $password)
        } else {
          field("accountId", $accountID)
          field("bucket", $bucket)
          field("accessKeyId", $accessKey)
          SecureField(text("secretAccessKey"), text: $secretKey)
        }
        Button(text("save")) { Task { await model.run { try await save(update: false) } } }
        Button(text("updateSecret")) { Task { await model.run { try await save(update: true) } } }
          .disabled(model.selected.isEmpty)
      } footer: { Text(text("hint")) }
      .disabled(model.busy || model.pending)

      Section(text("target")) {
        Picker(text("choose"), selection: $model.selected) {
          Text(text("choose")).tag("")
          ForEach(model.targets.indices, id: \.self) { index in
            let target = model.targets[index]
            Text(target["config"]?["endpoint"]?.string ?? target["config"]?["bucket"]?.string ?? "")
              .tag(target["id"]?.string ?? "")
          }
        }.disabled(model.pending)
        Button(text("check")) {
          Task {
            await model.run {
              _ = try await model.call("/targets/\(model.selected)/check", "POST", .object([:]))
              model.message = text("connected")
            }
          }
        }.disabled(model.selected.isEmpty || model.pending)
        Button(text(model.pendingCreation ? "retry" : "create")) {
          Task { await model.run { try await model.create() } }
        }.disabled(model.selected.isEmpty || model.restore != nil)
        Button(text("refresh")) { Task { await model.run { try await model.refresh() } } }
      }.disabled(model.busy)

      if !model.message.isEmpty { Section { Text(model.message).accessibilityAddTraits(.updatesFrequently) } }
      Section(text("history")) {
        if model.backups.isEmpty { Text(text("empty")) }
        ForEach(model.backups.indices, id: \.self) { index in
          let backup = model.backups[index]
          let id = backup["id"]?.string ?? ""
          VStack(alignment: .leading, spacing: AppleMetrics.space8) {
            Text(backup["createdAt"]?.string ?? "")
            Text(text(backup["status"]?.string ?? "pending")).foregroundStyle(AppleColors.secondary)
            HStack(spacing: AppleMetrics.space16) {
              Button(text("preview")) {
                Task { await model.run { model.preview = try await model.call("/\(id)/preview") } }
              }.disabled(model.pending)
              Button(text("verify")) {
                Task {
                  await model.run {
                    _ = try await model.call("/\(id)/check")
                    try await model.refresh()
                    model.message = text("verified")
                  }
                }
              }
              Button(text("download")) {
                Task {
                  await model.run {
                    let value = try await model.call("/\(id)/download")
                    document = MobileJSONDocument(data: try value.encoded())
                    exporting = true
                  }
                }
              }
            }.buttonStyle(.borderless)
          }
        }
      }.disabled(model.busy)
      if let preview = model.preview {
        Section {
          Text(text("replaceWarning"))
          LabeledContent(text("cards"), value: String(Int(preview["cards"]?.number ?? 0)))
          LabeledContent(text("added"), value: String(Int(preview["added"]?.number ?? 0)))
          LabeledContent(text("removed"), value: String(Int(preview["removed"]?.number ?? 0)))
          if model.restore != nil {
            Button(text("verifyRestore")) {
              Task { await model.run { try await model.verifyRestore(workspace: workspace) } }
            }
          }
          Button(text(model.restore == nil ? "confirm" : "retryRestore"), role: .destructive) {
            confirmingRestore = true
          }
          if model.restore == nil {
            Button(Copy.text("web.cancel")) { model.preview = nil }
          }
        }.disabled(model.busy || model.pendingCreation)
      }
    }
    .scrollContentBackground(.hidden)
    .background(AppleColors.canvas)
    .tint(AppleColors.accent)
    .navigationTitle(text("title"))
    .navigationBarTitleDisplayMode(.inline)
    .navigationBarBackButtonHidden(model.busy || model.pending)
    .interactiveDismissDisabled(model.busy || model.pending)
    .confirmationDialog(text("confirm"), isPresented: $confirmingRestore, titleVisibility: .visible) {
      Button(text(model.restore == nil ? "confirm" : "retryRestore"), role: .destructive) {
        Task { await model.run { try await model.confirm(workspace: workspace) } }
      }
      Button(Copy.text("web.cancel"), role: .cancel) {}
    } message: { Text(text("replaceWarning")) }
    .fileExporter(isPresented: $exporting, document: document, contentType: .json, defaultFilename: "sill-backup.json") { result in
      if case .failure = result { model.message = Copy.text("mobile.exportFailed") }
      document = MobileJSONDocument(data: Data())
    }
    .task {
      model.request = workspace.backupRequest
      await model.run { try await model.refresh() }
    }
    .onChange(of: scenePhase) { _, phase in if phase != .active { clearSecrets() } }
    .onDisappear { clearSecrets() }
  }

  private func field(_ key: String, _ value: Binding<String>) -> some View {
    TextField(text(key), text: value).textInputAutocapitalization(.never).autocorrectionDisabled()
  }

  private func clearSecrets() {
    password = ""
    secretKey = ""
    accessKey = ""
  }

  private func save(update: Bool) async throws {
    var fields: [String: JSONValue] = provider == "webdav"
      ? ["provider": .string(provider), "endpoint": .string(endpoint),
         "username": .string(username), "password": .string(password)]
      : ["provider": .string(provider), "accountId": .string(accountID),
         "bucket": .string(bucket), "accessKeyId": .string(accessKey),
         "secretAccessKey": .string(secretKey)]
    if update { fields["id"] = .string(model.selected) }
    _ = try await model.call("/targets", "POST", .object(fields))
    clearSecrets()
    try await model.refresh()
    model.message = text("connected")
  }
}
#endif

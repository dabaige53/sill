import Foundation
import Observation
import SillKit

@MainActor @Observable final class BackupModel {
  var targets: [JSONValue] = []
  var backups: [JSONValue] = []
  var selected = ""
  var busy = false
  var message = ""
  var preview: JSONValue?
  var restore: BackupRestore?
  private var creation: JSONValue?
  var hasPendingCreation: Bool { creation != nil }
  private var request: BackupRequest?
  var restored: (@MainActor () async -> Bool)?

  func configure(_ request: @escaping BackupRequest) { self.request = request }
  func call(_ path: String = "", _ method: String = "GET", _ body: JSONValue? = nil) async throws
    -> JSONValue
  {
    guard let request else { throw CloudWorkspaceError.unauthenticated }
    return try await request("/api/v1/backups" + path, method, body)
  }
  func refresh() async throws {
    let value = try await call()
    targets = value["targets"]?.array ?? []
    backups = value["backups"]?.array ?? []
    if selected.isEmpty { selected = targets.first?["id"]?.string ?? "" }
  }
  func run(_ action: @MainActor () async throws -> Void) async {
    guard !busy else { return }
    busy = true
    message = ""
    defer { busy = false }
    do { try await action() } catch CloudWorkspaceError.service(let code, _) {
      if code == "revision_conflict" || code == "idempotency_conflict" {
        restore = nil
        preview = nil
      }
      message = Self.text(
        code == "revision_conflict"
          ? "conflict"
          : code == "backup_auth_failed"
            ? "authFailed" : code == "backup_unknown" ? "unknown" : "failed")
    } catch { message = Self.text("unknown") }
  }
  func create() async throws {
    if creation == nil {
      creation = .object([
        "targetId": .string(selected), "idempotencyKey": .string(UUID().uuidString),
      ])
    }
    _ = try await call("", "POST", creation)
    creation = nil
    try await refresh()
    message = Self.text("created")
  }
  func confirm() async throws {
    if restore == nil, let preview { restore = try BackupRestore(preview: preview) }
    guard let restore else { return }
    _ = try await call("/restore", "POST", restore.body)
    await finishRestore()
  }
  func verifyRestore() async throws {
    guard let restore else { return }
    let value = try await call("/restore/status", "POST", restore.body)
    if value["result"]?.object != nil {
      await finishRestore()
    } else {
      message = Self.text("notRestored")
    }
  }
  private func finishRestore() async {
    restore = nil
    preview = nil
    let refreshed = await restored?() ?? false
    message = Self.text(refreshed ? "restored" : "restoredNeedsRefresh")
  }
  static func text(_ key: String) -> String { Copy.text("web.backup." + key) }
}

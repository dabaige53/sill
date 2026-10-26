import Foundation
import SillKit
import Testing

@testable import SillMobile

private actor BackupFixture {
  enum Mode { case unknown, denied, success }
  private var mode = Mode.unknown
  private var writes: [JSONValue] = []
  func setMode(_ value: Mode) { mode = value }
  func sentBodies() -> [JSONValue] { writes }

  func respond(_ path: String, _ method: String, _ body: JSONValue?) throws -> JSONValue {
    if method == "GET" {
      if path.hasSuffix("/missing/check") {
        throw CloudWorkspaceError.service("revision_conflict", 409)
      }
      return .object(["targets": .array([]), "backups": .array([])])
    }
    writes.append(body ?? .null)
    switch mode {
    case .unknown: throw URLError(.timedOut)
    case .denied: throw CloudWorkspaceError.service("backup_auth_failed", 403)
    case .success: return .object([:])
    }
  }
}

@MainActor struct MobileBackupTests {
  @Test func unrelatedReadFailureKeepsOriginalCreationKey() async {
    let fixture = BackupFixture()
    let model = MobileBackups()
    model.selected = "synthetic-target"
    model.request = { path, method, body in try await fixture.respond(path, method, body) }
    await model.run { try await model.create() }
    #expect(model.pendingCreation)
    await model.run { _ = try await model.call("/missing/check") }
    #expect(model.pendingCreation)
    await fixture.setMode(.denied)
    await model.run { try await model.create() }
    #expect(model.pendingCreation)
    await fixture.setMode(.success)
    await model.run { try await model.create() }
    let bodies = await fixture.sentBodies()
    #expect(bodies.count == 3)
    #expect(bodies[0] == bodies[1] && bodies[1] == bodies[2])
    #expect(!model.pending)
  }

  @Test func definitiveFirstCreationFailureReleasesConfiguration() async {
    let fixture = BackupFixture()
    await fixture.setMode(.denied)
    let model = MobileBackups()
    model.selected = "synthetic-target"
    model.request = { path, method, body in try await fixture.respond(path, method, body) }
    await model.run { try await model.create() }
    #expect(!model.pending)
    await fixture.setMode(.success)
    await model.run { try await model.create() }
    let bodies = await fixture.sentBodies()
    #expect(bodies.count == 2)
    #expect(bodies[0]["idempotencyKey"] != bodies[1]["idempotencyKey"])
  }

  @Test func restoreErrorsRemainBoundToTheirOwnRequest() async {
    let fixture = BackupFixture()
    let model = MobileBackups()
    let workspace = MobileWorkspace()
    let preview: JSONValue = .object([
      "backupId": .string("synthetic-backup"), "digest": .string("synthetic-digest"),
      "expectedRevision": .number(1),
    ])
    model.request = { path, method, body in try await fixture.respond(path, method, body) }
    model.preview = preview
    await fixture.setMode(.denied)
    await model.run { try await model.confirm(workspace: workspace) }
    #expect(!model.pending)
    #expect(model.preview == nil)
    model.preview = preview
    await fixture.setMode(.unknown)
    await model.run { try await model.confirm(workspace: workspace) }
    let original = model.restore?.body
    #expect(original != nil)
    await model.run { _ = try await model.call("/missing/check") }
    #expect(model.restore?.body == original)
    await fixture.setMode(.denied)
    await model.run { try await model.confirm(workspace: workspace) }
    #expect(model.restore?.body == original)
  }
}

import Foundation
import Testing

@testable import Sill
@testable import SillKit

private actor BackupTransportStub {
  var requests: [JSONValue] = []
  var loseFirstReceipt = true

  func call(_ path: String, _ body: JSONValue?) throws -> JSONValue {
    if path.hasSuffix("/restore/status") { return .object(["result": .null]) }
    guard let body else { throw CloudWorkspaceError.invalidResponse }
    requests.append(body)
    if loseFirstReceipt && requests.count == 1 {
      throw CloudWorkspaceError.service("unavailable", 503)
    }
    return .object(["restored": .bool(true), "revision": .number(9)])
  }
}

@MainActor struct BackupModelTests {
  private var preview: JSONValue {
    .object([
      "backupId": .string("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
      "digest": .string(String(repeating: "a", count: 64)), "expectedRevision": .number(8),
    ])
  }

  @Test func uncertainRestoreRetainsExactRequestUntilVerifiedOrReplayed() async throws {
    let transport = BackupTransportStub()
    let model = BackupModel()
    model.configure { path, _, body in try await transport.call(path, body) }
    model.preview = preview
    var refreshed = 0
    model.restored = {
      refreshed += 1
      return true
    }
    await model.run { try await model.confirm() }
    #expect(model.restore != nil)
    #expect(refreshed == 0)
    await model.run { try await model.verifyRestore() }
    #expect(model.restore != nil)
    await model.run { try await model.confirm() }
    let sent = await transport.requests
    #expect(sent.count == 2)
    #expect(sent[0] == sent[1])
    #expect(model.restore == nil)
    #expect(model.preview == nil)
    #expect(refreshed == 1)
  }

  @Test func successfulRestoreWithFailedRefreshReportsBothResults() async {
    let model = BackupModel()
    model.configure { _, _, _ in .object(["restored": .bool(true)]) }
    model.preview = preview
    model.restored = { false }
    await model.run { try await model.confirm() }
    #expect(model.restore == nil)
    #expect(model.message == BackupModel.text("restoredNeedsRefresh"))
  }
}

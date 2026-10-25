import Foundation
import SillKit
import Testing

@testable import SillMobile

private final class MobileTestVault: CloudSessionVault, @unchecked Sendable {
  private let lock = NSLock()
  private var data: Data?
  func load() throws -> Data? { lock.withLock { data } }
  func save(_ data: Data) throws { lock.withLock { self.data = data } }
  func clear() throws { lock.withLock { data = nil } }
}

private final class MobileTestHTTP: URLProtocol, @unchecked Sendable {
  static let lock = NSLock()
  nonisolated(unsafe) static var handler:
    ((URLRequest) throws -> (Int, [String: String], JSONValue))?
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    do {
      let handler = Self.lock.withLock { Self.handler }
      let (status, headers, json) = try handler!(request)
      let response = HTTPURLResponse(
        url: request.url!, statusCode: status, httpVersion: nil, headerFields: headers)!
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: try json.encoded())
      client?.urlProtocolDidFinishLoading(self)
    } catch { client?.urlProtocol(self, didFailWithError: error) }
  }
  override func stopLoading() {}
}

private final class MobileFixture: @unchecked Sendable {
  enum Mode: Equatable { case read, conflict, timeout, expired, success, offline }
  private let lock = NSLock()
  private var mode = Mode.read
  private var writes = 0
  private var body: JSONValue?
  private var operationGate: DispatchSemaphore?
  private var owner = "synthetic-owner"
  private var state: JSONValue = .object([
    "revision": .number(4),
    "state": .object([
      "cards": .array([
        .object([
          "id": .string("note"), "type": .string("note"), "title": .string("Synthetic note"),
          "body": .string("Only test content"), "tags": .array([.string("work")]),
        ])
      ]),
      "items": .object(["note": .object(["note": .string("Original annotation")])]),
      "preferences": .object(["theme": .string("dark")]), "seconds": .number(0),
    ]),
  ])

  var writeCount: Int { lock.withLock { writes } }
  var lastBody: JSONValue? { lock.withLock { body } }
  func setMode(_ mode: Mode) { lock.withLock { self.mode = mode } }
  func setOwner(_ owner: String) { lock.withLock { self.owner = owner } }
  func holdNextOperation() -> DispatchSemaphore {
    let gate = DispatchSemaphore(value: 0)
    lock.withLock { operationGate = gate }
    return gate
  }
  func addSecondCard() {
    lock.withLock {
      var workspace = state["state"]!
      var cards = workspace["cards"]!.array!
      cards.append(
        .object([
          "id": .string("second"), "type": .string("note"), "title": .string("Second note"),
          "tags": .array([.string("other")]),
        ]))
      workspace["cards"] = .array(cards)
      var items = workspace["items"]!.object!
      items["second"] = .object(["note": .string("Keep this note")])
      workspace["items"] = .object(items)
      state["state"] = workspace
    }
  }
  func changeAnnotation() {
    lock.withLock {
      state["revision"] = .number(5)
      var workspace = state["state"]!
      workspace["items"] = .object(["note": .object(["note": .string("Changed elsewhere")])])
      state["state"] = workspace
    }
  }

  func response(_ request: URLRequest) throws -> (Int, [String: String], JSONValue) {
    try lock.withLock {
      if mode == .offline { throw URLError(.notConnectedToInternet) }
      switch request.url?.path {
      case "/auth/password":
        return (200, ["Set-Cookie": "__Host-sill-access=synthetic; Secure; Path=/"], .object([:]))
      case "/auth/session":
        return (
          200, [:],
          .object([
            "userId": .string(owner), "workspaceRead": .bool(true),
          ])
        )
      case "/auth/logout": return (200, [:], .object(["revoked": .bool(true)]))
      case "/api/v1/workspace/operations":
        writes += 1
        if let gate = operationGate {
          operationGate = nil
          _ = gate.wait(timeout: .now() + 2)
        }
        #expect(request.value(forHTTPHeaderField: "Idempotency-Key") != nil)
        var bytes = request.httpBody ?? Data()
        if let stream = request.httpBodyStream {
          stream.open()
          defer { stream.close() }
          var buffer = [UInt8](repeating: 0, count: 4096)
          while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            guard count > 0 else { break }
            bytes.append(contentsOf: buffer.prefix(count))
          }
        }
        body = try JSONValue.decode(bytes)
        if mode == .timeout { throw URLError(.timedOut) }
        if mode == .success {
          state["revision"] = .number((state["revision"]?.number ?? 0) + 1)
          var workspace = state["state"]!
          workspace["items"] = .object([
            "note": .object([
              "note": .string("Original annotation"), "bookmarked": .bool(true),
            ])
          ])
          state["state"] = workspace
          return (200, [:], state)
        }
        return (409, [:], .object(["error": .object(["code": .string("revision_conflict")])]))
      default:
        if mode == .expired { return (401, [:], .object([:])) }
        return (200, [:], state)
      }
    }
  }
}

@MainActor @Suite(.serialized)
struct MobileWorkspaceTests {
  private func make(
    _ fixture: MobileFixture, vault: MobileTestVault = MobileTestVault()
  ) -> MobileWorkspace {
    MobileTestHTTP.lock.withLock { MobileTestHTTP.handler = fixture.response }
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [MobileTestHTTP.self]
    return MobileWorkspace(
      cloud: CloudWorkspace(
        vault: vault, configuration: configuration))
  }

  @Test func conflictDoesNotRetryOrChangeConfirmedState() async throws {
    let fixture = MobileFixture()
    let workspace = make(fixture)
    await workspace.login(email: "synthetic@example.com", password: "synthetic")
    let card = try #require(workspace.cards.first)
    fixture.setMode(.conflict)
    #expect(await workspace.toggle(card, field: "bookmarked") == false)
    #expect(fixture.writeCount == 1)
    #expect(workspace.cards.first?.bookmarked == false)
    #expect(workspace.error == Copy.appleConflict)
    #expect(!workspace.unresolvedWrite)
  }

  @Test func unknownResultBlocksNewWritesAndLogoutWithoutResending() async throws {
    let fixture = MobileFixture()
    let workspace = make(fixture)
    await workspace.login(email: "synthetic@example.com", password: "synthetic")
    let card = try #require(workspace.cards.first)
    fixture.setMode(.timeout)
    #expect(await workspace.toggle(card, field: "bookmarked") == false)
    #expect(workspace.unresolvedWrite)
    #expect(await workspace.capture("A new test note") == false)
    await workspace.logout()
    #expect(workspace.owner == "synthetic-owner")
    await workspace.refresh()
    #expect(workspace.unresolvedWrite)
    #expect(fixture.writeCount == 1)
    await workspace.acknowledgeUnknownWrite()
    #expect(!workspace.unresolvedWrite)
    #expect(fixture.writeCount == 1)
  }

  @Test func annotationsKeepTheirOriginalBaselineAcrossRefresh() async throws {
    let fixture = MobileFixture()
    let workspace = make(fixture)
    await workspace.login(email: "synthetic@example.com", password: "synthetic")
    let baseline = try #require(workspace.cards.first)
    fixture.changeAnnotation()
    await workspace.refresh()
    #expect(await workspace.saveAnnotations(baseline, tags: ["new"], note: "My draft") == false)
    #expect(fixture.writeCount == 0)
    #expect(workspace.card("note")?.note == "Changed elsewhere")
    #expect(workspace.error == Copy.appleConflict)
    #expect(await workspace.clearAll(expectedRevision: 4) == false)
    #expect(fixture.writeCount == 0)
  }

  @Test func expiredSessionKeepsUnknownWriteUntilExplicitConfirmation() async throws {
    let fixture = MobileFixture()
    let workspace = make(fixture)
    await workspace.login(email: "synthetic@example.com", password: "synthetic")
    let card = try #require(workspace.cards.first)
    fixture.setMode(.timeout)
    #expect(await workspace.toggle(card, field: "bookmarked") == false)
    fixture.setMode(.expired)
    await workspace.refresh()
    #expect(workspace.owner == nil)
    #expect(workspace.unresolvedWrite)
    await workspace.acknowledgeUnknownWrite()
    #expect(!workspace.unresolvedWrite)
    fixture.setMode(.read)
    await workspace.login(email: "synthetic@example.com", password: "synthetic")
    #expect(workspace.owner == "synthetic-owner")
    #expect(fixture.writeCount == 1)
  }

  @Test func expiredAccountClearsCardsPreferencesAndExport() async throws {
    let fixture = MobileFixture()
    let workspace = make(fixture)
    await workspace.login(email: "synthetic@example.com", password: "synthetic")
    #expect(workspace.preferences["theme"] == .string("dark"))
    #expect(try JSONValue.decode(workspace.exportData())["revision"] == .number(4))
    fixture.setMode(.expired)
    await workspace.refresh()
    #expect(workspace.owner == nil)
    #expect(workspace.cards.isEmpty)
    #expect(workspace.preferences.isEmpty)
    #expect(throws: CloudWorkspaceError.unauthenticated) { try workspace.exportData() }
  }

  @Test func batchUsesOneGuardedRequestAndIgnoresMissingSelection() async throws {
    let fixture = MobileFixture()
    let workspace = make(fixture)
    await workspace.login(email: "synthetic@example.com", password: "synthetic")
    fixture.setMode(.success)
    #expect(
      await workspace.batch(ids: ["note", "missing"], field: "bookmarked", value: true) == false)
    #expect(fixture.writeCount == 0)
    #expect(await workspace.batch(ids: ["note"], field: "bookmarked", value: true))
    #expect(fixture.writeCount == 1)
    #expect(fixture.lastBody?["expectedRevision"] == .number(4))
    #expect(fixture.lastBody?["operations"]?.array?.count == 1)
    #expect(workspace.card("note")?.bookmarked == true)
    #expect(workspace.revision == 5)
  }

  @Test func delayedChangesFromAnotherAccountCannotTouchMatchingCardIDs() async throws {
    let fixture = MobileFixture()
    let workspace = make(fixture)
    await workspace.login(email: "first@example.com", password: "synthetic")
    let previous = try #require(workspace.cards.first)
    await workspace.logout()
    fixture.setOwner("second-owner")
    await workspace.login(email: "second@example.com", password: "synthetic")
    #expect(workspace.owner == "second-owner")
    #expect(workspace.card(previous.id) != nil)
    #expect(await workspace.toggle(previous, field: "bookmarked") == false)
    #expect(await workspace.saveAnnotations(previous, tags: [], note: "First account") == false)
    #expect(await workspace.recordReading(previous, seconds: 10, progress: 1) == false)
    #expect(await workspace.recordPlayback(previous, position: 10, ended: true) == false)
    #expect(fixture.writeCount == 0)
  }

  @Test func batchAnnotationsReplaceTagsAtomicallyAndOnlyEditTheFirstNote() async throws {
    let fixture = MobileFixture()
    fixture.addSecondCard()
    let workspace = make(fixture)
    await workspace.login(email: "synthetic@example.com", password: "synthetic")
    let baselines = workspace.cards
    fixture.setMode(.success)
    #expect(
      await workspace.saveBatchAnnotations(
        baselines: baselines, tags: [" new ", "new", ""], note: "First note edited"))
    #expect(fixture.writeCount == 1)
    #expect(fixture.lastBody?["expectedRevision"] == .number(4))
    let operations = try #require(fixture.lastBody?["operations"]?.array)
    #expect(operations.count == 2)
    #expect(operations.allSatisfy { $0["values"]?["tags"] == .array([.string("new")]) })
    #expect(operations.allSatisfy { $0["values"]?["tagsEdited"] == .bool(true) })
    #expect(operations[0]["values"]?["note"] == .string("First note edited"))
    #expect(operations[1]["values"]?["note"] == nil)
  }

  @Test func batchAnnotationConflictRejectsTheWholeSelection() async throws {
    let fixture = MobileFixture()
    fixture.addSecondCard()
    let workspace = make(fixture)
    await workspace.login(email: "synthetic@example.com", password: "synthetic")
    let baselines = workspace.cards.reversed().map { $0 }
    fixture.changeAnnotation()
    await workspace.refresh()
    #expect(
      await workspace.saveBatchAnnotations(
        baselines: baselines, tags: [], note: "Draft") == false)
    #expect(fixture.writeCount == 0)
    #expect(workspace.error == Copy.appleConflict)
    #expect(
      await workspace.saveBatchAnnotations(
        baselines: [], tags: [], note: "") == false)
  }

  @Test func backgroundReadingWaitsForTheConfirmedWriteRevision() async throws {
    let fixture = MobileFixture()
    let workspace = make(fixture)
    await workspace.login(email: "synthetic@example.com", password: "synthetic")
    let card = try #require(workspace.cards.first)
    fixture.setMode(.success)
    let gate = fixture.holdNextOperation()
    let saving = Task { await workspace.toggle(card, field: "bookmarked") }
    while !workspace.busy { await Task.yield() }
    let reading = Task { await workspace.recordReading(card, seconds: 12, progress: 0.5) }
    await Task.yield()
    gate.signal()
    #expect(await saving.value)
    #expect(await reading.value)
    #expect(fixture.writeCount == 2)
    #expect(fixture.lastBody?["expectedRevision"] == .number(5))
    #expect(fixture.lastBody?["operations"]?.array?.last?["seconds"] == .number(12))
  }

  @Test func playbackMarksReadOnlyOnARealEndAndRejectsInvalidPositions() async throws {
    let fixture = MobileFixture()
    let workspace = make(fixture)
    await workspace.login(email: "synthetic@example.com", password: "synthetic")
    let card = try #require(workspace.cards.first)
    fixture.setMode(.success)
    #expect(await workspace.recordPlayback(card, position: .nan, ended: false) == false)
    #expect(fixture.writeCount == 0)
    #expect(await workspace.recordPlayback(card, position: 20, ended: false))
    #expect(fixture.lastBody?["operations"]?.array?.first?["values"]?["read"] == nil)
    #expect(await workspace.recordPlayback(card, position: 30, ended: true))
    let values = fixture.lastBody?["operations"]?.array?.first?["values"]
    #expect(values?["read"] == .bool(true))
    #expect(values?["progress"] == .number(1))
    #expect(values?["playbackPosition"] == .number(30))
    #expect(fixture.lastBody?["expectedRevision"] == .number(5))
  }

  @Test func offlineStartupDoesNotConfirmSignOut() async throws {
    let fixture = MobileFixture()
    let vault = MobileTestVault()
    try vault.save(JSONValue.object(["__Host-sill-access": .string("synthetic")]).encoded())
    let workspace = make(fixture, vault: vault)
    fixture.setMode(.offline)
    await workspace.start()
    #expect(workspace.started)
    #expect(!workspace.sessionChecked)
    #expect(workspace.owner == nil)
    fixture.setMode(.read)
    await workspace.refresh()
    #expect(workspace.sessionChecked)
    #expect(workspace.owner == "synthetic-owner")
  }

  @Test func taskStateTagsAndSafeLinksUseTheStoredPersonalState() throws {
    let card = try Card(
      json: .object([
        "id": .string("task"), "type": .string("task"), "title": .string("Task"),
        "tasks": .array([
          .object(["id": .string("a"), "text": .string("One"), "done": .bool(true)]),
          .object(["id": .string("b"), "text": .string("Two")]),
        ]),
        "tags": .array([.string("source")]),
      ]))
    let mobile = try MobileCard(
      card: card,
      item: .object([
        "taskDone": .array([.string("b")]), "tagsEdited": .bool(true),
        "tags": .array([.string("Personal")]),
      ]))
    #expect(mobile.tasks.map(\.done) == [false, true])
    #expect(!mobile.completed)
    #expect(mobile.matches("task #personal"))
    #expect(!mobile.matches("#source"))
    #expect(MobileCard.safeURL("javascript:alert(1)") == nil)
    #expect(MobileCard.safeURL("https://user:secret@example.com") == nil)
    #expect(MobileCard.safeURL("https://example.com/article")?.host == "example.com")
  }
}

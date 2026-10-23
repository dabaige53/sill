import Foundation
import Testing

@testable import SillKit

private final class MemoryCloudVault: CloudSessionVault, @unchecked Sendable {
  private let lock = NSLock()
  private var value: Data?
  func load() throws -> Data? { lock.withLock { value } }
  func save(_ data: Data) throws { lock.withLock { value = data } }
  func clear() throws { lock.withLock { value = nil } }
}

private final class CloudProtocol: URLProtocol, @unchecked Sendable {
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
        url: request.url!, statusCode: status, httpVersion: nil,
        headerFields: headers)!
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: try json.encoded())
      client?.urlProtocolDidFinishLoading(self)
    } catch { client?.urlProtocol(self, didFailWithError: error) }
  }
  override func stopLoading() {}
}

@Suite(.serialized)
struct CloudWorkspaceTests {
  private var empty: JSONValue {
    .object([
      "revision": .number(0),
      "state": .object([
        "cards": .array([]), "items": .object([:]), "preferences": .object([:]),
        "seconds": .number(0),
      ]),
    ])
  }
  private func make(
    _ handler: @escaping (URLRequest) throws -> (Int, [String: String], JSONValue),
    vault: MemoryCloudVault = MemoryCloudVault()
  ) -> CloudWorkspace {
    CloudProtocol.lock.withLock { CloudProtocol.handler = handler }
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [CloudProtocol.self]
    return CloudWorkspace(vault: vault, configuration: config)
  }
  private func auth(_ request: URLRequest) -> (Int, [String: String], JSONValue)? {
    #expect(request.url?.host == "sill-web-preview.scs1213-temp-email.workers.dev")
    #expect(
      request.value(forHTTPHeaderField: "Origin")
        == "https://sill-web-preview.scs1213-temp-email.workers.dev")
    switch request.url?.path {
    case "/auth/password":
      return (
        200,
        [
          "Set-Cookie":
            "__Host-sill-access=synthetic; Secure; Path=/, __Host-sill-refresh=synthetic-refresh; Secure; Path=/"
        ], .object([:])
      )
    case "/auth/session":
      #expect(
        request.value(forHTTPHeaderField: "Cookie")?.contains(
          "__Host-sill-refresh=synthetic-refresh") == true)
      return (
        200, [:], .object(["userId": .string("synthetic-owner"), "workspaceRead": .bool(true)])
      )
    default: return nil
    }
  }

  @Test func loginUsesPasswordEndpointAndRestoresFromVault() async throws {
    let vault = MemoryCloudVault()
    let store = make(
      { request in
        if let result = auth(request) { return result }
        #expect(request.url?.path == "/api/v1/workspace")
        #expect(request.value(forHTTPHeaderField: "X-Sill-Owner") == "synthetic-owner")
        return (200, [:], empty)
      }, vault: vault)
    let result = try await store.login(email: "synthetic@example.com", password: "synthetic")
    #expect(result.owner == "synthetic-owner")
    #expect(result.revision == .number(0))
    #expect(try vault.load() != nil)
    let restored = try await store.restoreSession()
    #expect(restored?.owner == result.owner)
  }

  @Test func conflictIsReturnedWithoutRetry() async throws {
    let store = make { request in
      if let result = auth(request) { return result }
      if request.httpMethod == "POST" {
        #expect(request.value(forHTTPHeaderField: "Idempotency-Key") != nil)
        return (409, [:], .object(["error": .object(["code": .string("revision_conflict")])]))
      }
      return (200, [:], empty)
    }
    _ = try await store.login(email: "synthetic@example.com", password: "synthetic")
    await #expect(throws: CloudWorkspaceError.service("revision_conflict", 409)) {
      try await store.apply(operations: [
        .object(["op": .string("reading.add"), "seconds": .number(1)])
      ])
    }
    #expect(await store.pendingWriteKey == nil)
  }

  @Test func timeoutRetainsPendingKeyAndBlocksAnotherWrite() async throws {
    let store = make { request in
      if let result = auth(request) { return result }
      if request.httpMethod == "POST" { throw URLError(.timedOut) }
      return (200, [:], empty)
    }
    _ = try await store.login(email: "synthetic@example.com", password: "synthetic")
    let operations: [JSONValue] = [.object(["op": .string("reading.add"), "seconds": .number(1)])]
    await #expect(throws: CloudWorkspaceError.unknownWrite) {
      try await store.apply(operations: operations)
    }
    let key = await store.pendingWriteKey
    #expect(key != nil)
    await #expect(throws: CloudWorkspaceError.unknownWrite) {
      try await store.apply(operations: operations)
    }
    #expect(await store.pendingWriteKey == key)
  }

  @Test func redirectResponseIsRejectedAndLogoutClearsVault() async throws {
    let vault = MemoryCloudVault()
    let store = make(
      { request in
        if let result = auth(request) { return result }
        if request.url?.path == "/auth/logout" {
          return (200, [:], .object(["revoked": .bool(true)]))
        }
        return (200, [:], empty)
      }, vault: vault)
    _ = try await store.login(email: "synthetic@example.com", password: "synthetic")
    try await store.logout()
    #expect(try vault.load() == nil)
    await #expect(throws: CloudWorkspaceError.unauthenticated) { try await store.read() }
    CloudProtocol.lock.withLock {
      CloudProtocol.handler = { _ in (302, ["Location": "https://untrusted.example"], .object([:]))
      }
    }
    await #expect(throws: CloudWorkspaceError.invalidResponse) {
      try await store.login(email: "synthetic@example.com", password: "synthetic")
    }
  }
  @Test func accountChangeNeverReusesPreviousOwnerOrPendingWrite() async throws {
    var currentOwner = "first-owner"
    let store = make { request in
      if request.url?.path == "/auth/session" {
        return (200, [:], .object(["userId": .string(currentOwner), "workspaceRead": .bool(true)]))
      }
      if let result = auth(request) { return result }
      if request.httpMethod == "POST" { throw URLError(.timedOut) }
      #expect(request.value(forHTTPHeaderField: "X-Sill-Owner") == currentOwner)
      return (200, [:], empty)
    }
    _ = try await store.login(email: "first@example.com", password: "synthetic")
    await #expect(throws: CloudWorkspaceError.unknownWrite) {
      try await store.apply(operations: [
        .object(["op": .string("reading.add"), "seconds": .number(1)])
      ])
    }
    #expect(await store.pendingWriteKey != nil)
    await #expect(throws: CloudWorkspaceError.unknownWrite) { try await store.logout() }
    await #expect(throws: CloudWorkspaceError.unknownWrite) {
      try await store.login(email: "second@example.com", password: "synthetic")
    }
    try await store.discardPendingWrite()
    currentOwner = "second-owner"
    let second = try await store.login(email: "second@example.com", password: "synthetic")
    #expect(second.owner == "second-owner")
    #expect(await store.pendingWriteKey == nil)
  }

  @Test func committedTimeoutReadsBackBeforeSuccessWithoutRepeatingWrite() async throws {
    var committed = false
    var writes = 0
    var updated = empty
    updated["revision"] = .number(1)
    var state = updated["state"]!
    state["seconds"] = .number(4)
    updated["state"] = state
    let store = make { request in
      if let result = auth(request) { return result }
      if request.httpMethod == "POST" {
        writes += 1
        committed = true
        throw URLError(.timedOut)
      }
      return (200, [:], committed ? updated : empty)
    }
    _ = try await store.login(email: "synthetic@example.com", password: "synthetic")
    let result = try await store.apply(operations: [
      .object(["op": .string("reading.add"), "seconds": .number(4)])
    ])
    #expect(result.json["state"]?["seconds"] == .number(4))
    #expect(writes == 1)
    #expect(await store.pendingWriteKey == nil)
  }
  @Test func newCardAndDeleteTimeoutsVerifyFullCardWithoutServerMetadata() async throws {
    let card: JSONValue = .object([
      "id": .string("created"), "type": .string("note"), "title": .string("Synthetic"),
      "body": .string(""), "future": .object(["preserved": .bool(true)]),
    ])
    let item = try JSONValue.decode(
      Data(
        #"{"seen":false,"read":false,"bookmarked":false,"later":false,"tagsEdited":false,"progress":0,"note":"","tags":[],"addedAt":0,"snoozedUntil":0,"dismissed":false,"reminderDone":false,"lastReminderKey":"","lastNotifiedAt":0,"readAt":0,"restoredAt":0,"done":false,"archived":false,"lessLike":false,"taskDone":[]}"#
          .utf8))
    var server = empty
    var writes = 0
    let store = make { request in
      if let result = auth(request) { return result }
      if request.httpMethod == "POST" {
        writes += 1
        server["revision"] = .number(Double(writes))
        var state = server["state"]!
        if writes == 1 {
          var stored = card
          stored["revision"] = .number(1)
          stored["state"] = .object([:])
          stored["created_at"] = .string("synthetic-timestamp")
          state["cards"] = .array([stored])
          state["items"] = .object(["created": item])
        } else {
          state["cards"] = .array([])
          state["items"] = .object([:])
        }
        server["state"] = state
        throw URLError(.timedOut)
      }
      return (200, [:], server)
    }
    _ = try await store.login(email: "synthetic@example.com", password: "synthetic")
    let created = try await store.apply(operations: [
      .object(["op": .string("card.upsert"), "card": card, "before": .null])
    ])
    #expect(created.json["state"]?["cards"]?.array?.count == 1)
    _ = try await store.apply(operations: [
      .object(["op": .string("card.delete"), "id": .string("created"), "before": card])
    ])
    #expect(writes == 2)
    #expect(await store.pendingWriteKey == nil)
  }

  @Test func unauthenticatedAndOwnerMismatchInvalidateIdentity() async throws {
    var failure = 0
    var requests = 0
    let store = make { request in
      if let result = auth(request) { return result }
      requests += 1
      if failure != 0 {
        #expect(request.value(forHTTPHeaderField: "X-Sill-Owner") == "synthetic-owner")
        return (failure, [:], .object(["error": .object(["code": .string("forbidden")])]))
      }
      return (200, [:], empty)
    }
    _ = try await store.login(email: "synthetic@example.com", password: "synthetic")
    failure = 403
    await #expect(throws: CloudWorkspaceError.service("forbidden", 403)) { try await store.read() }
    let afterForbidden = requests
    await #expect(throws: CloudWorkspaceError.unauthenticated) { try await store.read() }
    #expect(requests == afterForbidden)
    failure = 0
    _ = try await store.login(email: "synthetic@example.com", password: "synthetic")
    failure = 401
    await #expect(throws: CloudWorkspaceError.unauthenticated) { try await store.read() }
    let afterUnauthorized = requests
    await #expect(throws: CloudWorkspaceError.unauthenticated) { try await store.read() }
    #expect(requests == afterUnauthorized)
  }
  @Test func nativeEmailRetainsPKCEAndRedeemsOnlyFixedCallback() async throws {
    let vault = MemoryCloudVault()
    var redeemed = false
    let store = make(
      { request in
        switch request.url?.path {
        case "/auth/login":
          return (
            202,
            [
              "Set-Cookie":
                "__Host-sill-pkce=synthetic-verifier; Secure; Path=/, __Host-sill-login-until=123; Secure; Path=/"
            ], .object(["retryAfter": .number(60)])
          )
        case "/auth/callback":
          #expect(
            request.value(forHTTPHeaderField: "Cookie")?.contains(
              "__Host-sill-pkce=synthetic-verifier") == true)
          #expect(request.value(forHTTPHeaderField: "X-Sill-Client") == "macos")
          #expect(
            URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems?.contains(
              URLQueryItem(name: "client", value: "macos")) == true)
          redeemed = true
          return (
            303,
            [
              "Location": "https://sill-web-preview.scs1213-temp-email.workers.dev/",
              "Set-Cookie":
                "__Host-sill-access=synthetic; Secure; Path=/, __Host-sill-refresh=synthetic-refresh; Secure; Path=/, __Host-sill-pkce=; Max-Age=0; Secure; Path=/",
            ], .object([:])
          )
        default:
          if let result = auth(request) { return result }
          return (200, [:], empty)
        }
      }, vault: vault)
    let link = try await store.requestLoginLink(email: "synthetic@example.com")
    #expect(link["retryAfter"] == .number(60))
    #expect(
      try JSONValue.decode(#require(try vault.load()))["__Host-sill-pkce"]
        == .string("synthetic-verifier"))
    for invalid in [
      "https://evil.example/auth/callback?code=synthetic", "sill://evil/callback?code=synthetic",
      "sill://auth/callback?code=one&code=two",
      "sill://auth/callback?code=synthetic&redirect=https://evil.example",
    ] {
      await #expect(throws: CloudWorkspaceError.invalidResponse) {
        try await store.completeLogin(url: URL(string: invalid)!)
      }
    }
    let resumedConfiguration = URLSessionConfiguration.ephemeral
    resumedConfiguration.protocolClasses = [CloudProtocol.self]
    let resumed = CloudWorkspace(vault: vault, configuration: resumedConfiguration)
    let restored = try await resumed.restoreSession()
    #expect(restored?.owner == nil)
    let result = try await resumed.completeLogin(
      url: URL(string: "sill://auth/callback?code=synthetic-code")!)
    #expect(redeemed)
    #expect(result.owner == "synthetic-owner")
    #expect(try JSONValue.decode(#require(try vault.load()))["__Host-sill-pkce"] == nil)
  }
  @Test func expiredPKCECannotBeSentAfterRestart() async throws {
    let vault = MemoryCloudVault()
    try vault.save(
      JSONValue.object([
        "__Host-sill-pkce": .string("expired-synthetic-verifier"),
        "__expires": .object(["__Host-sill-pkce": .number(1)]),
      ]).encoded())
    let store = make(
      { _ in
        Issue.record("An expired verifier must not trigger a callback request")
        return (500, [:], .object([:]))
      }, vault: vault)
    await #expect(throws: CloudWorkspaceError.unauthenticated) {
      try await store.completeLogin(url: URL(string: "sill://auth/callback?code=synthetic")!)
    }
  }
  @Test func passwordSetupContinuesAfterEmailAndUsesExistingUpdateEndpoint() async throws {
    var updated = false
    let store = make { request in
      switch request.url?.path {
      case "/auth/login":
        return (
          202,
          [
            "Set-Cookie":
              "__Host-sill-pkce=synthetic-verifier; Secure; Path=/, __Host-sill-password-setup=1; Secure; Path=/"
          ], .object(["retryAfter": .number(60)])
        )
      case "/auth/callback":
        return (
          303,
          [
            "Location": "https://sill-web-preview.scs1213-temp-email.workers.dev/auth/password/new",
            "Set-Cookie":
              "__Host-sill-access=synthetic; Secure; Path=/, __Host-sill-refresh=synthetic-refresh; Secure; Path=/",
          ], .object([:])
        )
      case "/auth/password/update":
        #expect(request.httpMethod == "POST")
        #expect(
          request.value(forHTTPHeaderField: "Cookie")?.contains("__Host-sill-password-setup=1")
            == true)
        updated = true
        return (
          200, ["Set-Cookie": "__Host-sill-password-setup=; Secure; Path=/; Max-Age=0"],
          .object(["location": .string("https://sill-web-preview.scs1213-temp-email.workers.dev/")])
        )
      default:
        if let result = auth(request) { return result }
        return (200, [:], empty)
      }
    }
    _ = try await store.requestLoginLink(email: "synthetic@example.com", setupPassword: true)
    let recovered = try await store.completeLogin(
      url: URL(string: "sill://auth/callback?code=synthetic-code")!)
    #expect(recovered.needsPasswordSetup)
    let completed = try await store.setPassword(password: "synthetic-new-password")
    #expect(updated)
    #expect(!completed.needsPasswordSetup)
  }
}

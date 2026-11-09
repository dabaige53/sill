import Foundation
import Testing

@testable import SillKit

@Suite(.serialized)
struct CloudWorkspaceTests {
  // @wu-test type=integration | scope=CloudWorkspace | protects=Restore the saved account
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

  // @wu-test type=integration | scope=CloudWorkspace | protects=Return conflict without retry
  @Test func conflictIsReturnedWithoutRetry() async throws {
    var posts = 0
    let store = make { request in
      if let result = auth(request) { return result }
      if request.httpMethod == "POST" {
        posts += 1
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
    #expect(posts == 1)
  }

  // @wu-test type=integration | scope=CloudWorkspace | protects=Block duplicate timeout writes
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

  // @wu-test type=boundary | scope=CloudWorkspace | protects=Clear session on logout; reject redirects
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
  // @wu-test type=integration | scope=CloudWorkspace | protects=Block unresolved account change
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

  // @wu-test type=integration | scope=CloudWorkspace | protects=Reconcile without duplicate writes
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
  private func synthetic(revision: Double) -> JSONValue {
    .object([
      "revision": .number(revision),
      "state": .object([
        "cards": .array([
          .object([
            "id": .string("synthetic-card"), "type": .string("note"),
            "title": .string("Synthetic card"), "body": .string("Body"),
          ])
        ]),
        "items": .object([:]), "preferences": .object([:]), "seconds": .number(0),
      ]),
    ])
  }

  // @wu-test type=integration | scope=CloudWorkspace.read | protects=Keep workspace data when polling returns an unchanged revision
  @Test func periodicReadSendsKnownRevisionAndKeepsWorkspaceWhenUnchanged() async throws {
    let full = synthetic(revision: 3)
    var revisions: [String?] = []
    var answered = 3.0
    let store = make { request in
      if let result = auth(request) { return result }
      let known = request.value(forHTTPHeaderField: "X-Sill-Revision")
      revisions.append(known)
      if known == "3" {
        return (200, [:], .object(["revision": .number(answered), "unchanged": .bool(true)]))
      }
      return (200, [:], full)
    }
    _ = try await store.login(email: "synthetic@example.com", password: "synthetic")
    let read = try await store.read()
    #expect(revisions == [nil, "3"])
    #expect(read.json == full)
    #expect(read.snapshot?.revision == 3)
    #expect(read.snapshot?.cards.map(\.id) == ["synthetic-card"])
    // "Unchanged" must name the revision this session holds.
    answered = 9
    await #expect(throws: CloudWorkspaceError.invalidResponse) { try await store.read() }
  }

  // @wu-test type=integration | scope=CloudWorkspace.apply | protects=Avoid a redundant workspace read before a write at the known revision
  @Test func writeAtKnownRevisionIsSentWithoutReadingWorkspaceFirst() async throws {
    var reads = 0
    var writes = 0
    let store = make { request in
      if let result = auth(request) { return result }
      if request.httpMethod == "POST" {
        writes += 1
        return (200, [:], synthetic(revision: Double(3 + writes)))
      }
      reads += 1
      return (200, [:], synthetic(revision: 3))
    }
    _ = try await store.login(email: "synthetic@example.com", password: "synthetic")
    let operations: [JSONValue] = [.object(["op": .string("reading.add"), "seconds": .number(1)])]
    let written = try await store.apply(operations: operations, expectedRevision: .number(3))
    #expect(written.revision == .number(4))
    #expect(written.snapshot?.revision == 4)
    #expect(reads == 1 && writes == 1)
    // A write based on another revision still reads the state it would be checked against.
    _ = try await store.apply(operations: operations, expectedRevision: .number(2))
    #expect(reads == 2 && writes == 2)
  }

  // @wu-test type=integration | scope=CloudWorkspace | protects=Verify lost card write receipts
  @Test func createReplaceAndDeleteTimeoutsVerifyFullCardWithoutServerMetadata() async throws {
    let card: JSONValue = .object([
      "id": .string("created"), "type": .string("note"), "title": .string("Synthetic"),
      "body": .string(""),
      "url": .string("https://example.com/old"), "summary": .string("Old summary"),
    ])
    let item = try JSONValue.decode(
      Data(
        #"{"seen":false,"read":false,"bookmarked":false,"later":false,"playbackPosition":0,"progress":0,"note":"","addedAt":0,"snoozedUntil":0,"dismissed":false,"reminderDone":false,"lastReminderKey":"","lastNotifiedAt":0,"readAt":0,"restoredAt":0,"done":false,"archived":false,"lessLike":false,"taskDone":[]}"#
          .utf8))
    var server = empty
    var writes = 0
    let store = make { request in
      if let result = auth(request) { return result }
      if request.httpMethod == "POST" {
        writes += 1
        server["revision"] = .number(Double(writes))
        var state = server["state"]!
        if writes <= 2 {
          var stored = card
          if writes == 2 {
            stored["url"] = nil
            stored["summary"] = nil
            stored["body"] = .string("Replacement")
          }
          stored["revision"] = .number(Double(writes))
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
    let replacement: JSONValue = .object([
      "id": .string("created"), "type": .string("note"), "title": .string("Synthetic"),
      "body": .string("Replacement"),
    ])
    let replaced = try await store.apply(operations: [
      .object(["op": .string("card.upsert"), "card": replacement, "before": card])
    ])
    let actual = try #require(replaced.json["state"]?["cards"]?.array?.first)
    #expect(actual["url"] == nil && actual["summary"] == nil)
    _ = try await store.apply(operations: [
      .object(["op": .string("card.delete"), "id": .string("created"), "before": actual])
    ])
    #expect(writes == 3)
    #expect(await store.pendingWriteKey == nil)
  }

  // @wu-test type=boundary | scope=CloudWorkspace | protects=Reject invalid account identity
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

  // @wu-test type=boundary | scope=CloudWorkspace | protects=Keep login; reject other backup owners
  @Test func backupCredentialFailureKeepsTheSillAccountAndRejectsAnotherOwner() async throws {
    var calls = 0
    let store = make { request in
      if let result = auth(request) { return result }
      if request.url?.path == "/api/v1/backups/targets" {
        calls += 1
        #expect(request.value(forHTTPHeaderField: "X-Sill-Owner") == "synthetic-owner")
        return (403, [:], .object(["error": .object(["code": .string("backup_auth_failed")])]))
      }
      return (200, [:], empty)
    }
    _ = try await store.login(email: "synthetic@example.com", password: "synthetic")
    await #expect(throws: CloudWorkspaceError.service("backup_auth_failed", 403)) {
      try await store.backupRequest(
        "/api/v1/backups/targets", method: "POST", body: .object([:]),
        expectedOwner: "synthetic-owner")
    }
    #expect(try await store.read().owner == "synthetic-owner")
    await #expect(throws: CloudWorkspaceError.unauthenticated) {
      try await store.backupRequest(
        "/api/v1/backups/targets", method: "POST", body: .object([:]), expectedOwner: "other-owner")
    }
    #expect(calls == 1)
  }
  // @wu-test type=boundary | scope=CloudWorkspace | protects=Bind callbacks to login verifier
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
  // @wu-test type=boundary | scope=CloudWorkspace | protects=Reject expired login verifiers
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
  // @wu-test type=integration | scope=CloudWorkspace | protects=Finish email password setup
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

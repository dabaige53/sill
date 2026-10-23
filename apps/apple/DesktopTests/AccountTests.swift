import Foundation
import Testing

@testable import Sill
@testable import SillKit

private actor AccountStub: CloudAccountService {
  nonisolated let isLocal = false
  var owner = "account-a"
  var setup = false
  var restored = false
  var restoreDelay: Duration = .zero
  var pendingWriteKey: String?
  var logoutFailure: CloudWorkspaceError?
  var loginFailure: CloudWorkspaceError?
  var logoutCalls = 0
  var requestedSetup: Bool?
  var callbacks = 0

  func configure(
    owner: String? = nil, setup: Bool? = nil, restored: Bool? = nil, pending: String? = nil,
    delay: Duration? = nil, logoutFailure: CloudWorkspaceError? = nil,
    loginFailure: CloudWorkspaceError? = nil
  ) {
    if let owner { self.owner = owner }
    if let setup { self.setup = setup }
    if let restored { self.restored = restored }
    if let delay { restoreDelay = delay }
    pendingWriteKey = pending
    self.logoutFailure = logoutFailure
    self.loginFailure = loginFailure
  }
  private func state() -> CloudWorkspaceState {
    CloudWorkspaceState(
      owner: owner,
      json: .object([
        "revision": .number(1),
        "state": .object([
          "cards": .array([
            .object([
              "id": .string("shared-id"), "type": .string("note"), "title": .string(owner),
              "body": .string("Synthetic"),
            ])
          ]),
          "items": .object(["shared-id": .object(["note": .string(owner)])]),
          "preferences": .object(["theme": .string("dark")]), "seconds": .number(12),
        ]),
      ]), needsPasswordSetup: setup)
  }
  func restoreSession() async throws -> CloudWorkspaceState? {
    if restoreDelay != .zero { try await Task.sleep(for: restoreDelay) }
    return restored ? state() : nil
  }
  func login(email: String, password: String) async throws -> CloudWorkspaceState {
    if let loginFailure { throw loginFailure }
    return state()
  }
  func requestLoginLink(email: String, setupPassword: Bool) async throws -> JSONValue {
    requestedSetup = setupPassword
    return .object(["message": .string("Synthetic email accepted")])
  }
  func completeLogin(url: URL) async throws -> CloudWorkspaceState {
    callbacks += 1
    return state()
  }
  func setPassword(password: String) async throws -> CloudWorkspaceState {
    setup = false
    return state()
  }
  func logout() async throws {
    logoutCalls += 1
    if let logoutFailure { throw logoutFailure }
  }
  func read() async throws -> Snapshot { try Snapshot(json: state().json) }
  func apply(_ operations: [WorkspaceOperation], expectedRevision: Int) async throws -> Snapshot {
    try await read()
  }
}

@MainActor @Suite struct AccountTests {
  private func ready(_ workspace: Workspace) async throws {
    for _ in 0..<100 {
      if workspace.phase == .ready { return }
      try await Task.sleep(for: .milliseconds(10))
    }
    Issue.record("The authenticated snapshot was not applied")
  }

  @Test func restoresSavedSessionAndAttachesBackend() async throws {
    let service = AccountStub()
    await service.configure(restored: true)
    let workspace = Workspace(autoload: false)
    let account = Account(workspace: workspace, service: service)
    await account.start()
    try await ready(workspace)
    #expect(account.owner == "account-a")
    #expect(workspace.model("shared-id")?.title == "account-a")
    #expect(workspace.seconds == 12)
    #expect(workspace.backend != nil)
    #expect(!account.busy)
  }

  @Test func accountSwitchClearsWorkspaceActivityAndAllSurfaces() async throws {
    let service = AccountStub()
    let workspace = Workspace(autoload: false)
    let app = AppModel(workspace: workspace, accountService: service)
    await app.account.start()
    await app.account.login(email: "a@example.invalid", password: "synthetic")
    try await ready(workspace)
    app.feed.search("private query")
    app.selection.select("shared-id")
    app.ai.draft = "private draft"
    app.ai.add(["shared-id"])
    app.panels.open(.capture)
    let oldReader = app.reader
    oldReader.open("shared-id")
    workspace.recorder.readingSecond()
    await app.account.logout()
    #expect(workspace.phase == .signedOut)
    #expect(workspace.cards.isEmpty)
    #expect(workspace.backend == nil && workspace.queue.backend == nil)
    #expect(workspace.seconds == 0 && workspace.storedPreferences.isEmpty)
    #expect(!workspace.recorder.hasRecords)
    #expect(app.feed.query.isEmpty && !app.selection.active)
    #expect(app.ai.draft.isEmpty && app.ai.cards.isEmpty && app.panels.kind == nil)
    await service.configure(owner: "account-b")
    await app.account.login(email: "b@example.invalid", password: "synthetic")
    try await ready(workspace)
    #expect(workspace.model("shared-id")?.title == "account-b")
    #expect(workspace.state("shared-id").note == "account-b")
    oldReader.reachedEnd("shared-id")
    #expect(!oldReader.sessionActive && !workspace.recorder.hasRecords)
  }

  @Test func signedInAccountRejectsAnotherLoginCallback() async throws {
    let service = AccountStub()
    let workspace = Workspace(autoload: false)
    let account = Account(workspace: workspace, service: service)
    await account.start()
    await account.login(email: "a@example.invalid", password: "synthetic")
    try await ready(workspace)
    await service.configure(owner: "account-b")
    await account.completeLogin(URL(string: "sill://auth/callback?code=another-account")!)
    await account.login(email: "b@example.invalid", password: "synthetic")
    #expect(account.owner == "account-a")
    #expect(workspace.model("shared-id")?.title == "account-a")
    #expect(await service.callbacks == 0)
    #expect(workspace.notice?.text == Copy.text("auth.logoutBeforeLogin"))
  }

  @Test func pendingWriteBlocksLogoutWithoutLosingTheWorkspace() async throws {
    let service = AccountStub()
    let workspace = Workspace(autoload: false)
    let account = Account(workspace: workspace, service: service)
    await account.start()
    await account.login(email: "a@example.invalid", password: "synthetic")
    try await ready(workspace)
    await service.configure(pending: "uncertain-write")
    await account.logout()
    #expect(workspace.phase == .ready && account.owner == "account-a")
    #expect(account.error == Copy.appleUnknownWrite)
    #expect(await service.logoutCalls == 0)
  }

  @Test func emailCallbackAndFirstPasswordSetup() async throws {
    let service = AccountStub()
    await service.configure(setup: true)
    let workspace = Workspace(autoload: false)
    let account = Account(workspace: workspace, service: service)
    await account.start()
    await account.requestLink(email: "a@example.invalid", setupPassword: true)
    #expect(await service.requestedSetup == true)
    #expect(account.message == "Synthetic email accepted")
    await account.completeLogin(URL(string: "sill://auth/callback?code=synthetic")!)
    #expect(account.needsPasswordSetup)
    await account.setPassword("synthetic-new-password")
    #expect(!account.needsPasswordSetup)
    try await ready(workspace)
  }

  @Test func lateRestoreCannotReviveAnExpiredAccount() async throws {
    let service = AccountStub()
    await service.configure(restored: true, delay: .milliseconds(80))
    let workspace = Workspace(autoload: false)
    let account = Account(workspace: workspace, service: service)
    let task = Task { await account.start() }
    while !account.busy { await Task.yield() }
    workspace.signOutLocally()
    account.expire()
    await task.value
    #expect(workspace.phase == .signedOut && workspace.cards.isEmpty)
    #expect(account.owner == nil && !account.busy)
  }

  @Test func failedLoginAndUnconfirmedLogoutRemainExplicit() async throws {
    let service = AccountStub()
    let workspace = Workspace(autoload: false)
    let account = Account(workspace: workspace, service: service)
    await account.start()
    await service.configure(loginFailure: .unauthenticated)
    await account.login(email: "a@example.invalid", password: "synthetic")
    #expect(workspace.phase == .signedOut && account.owner == nil)
    #expect(account.error == Copy.text("login.unauthenticated"))
    await service.configure()
    await account.login(email: "a@example.invalid", password: "synthetic")
    try await ready(workspace)
    await service.configure(logoutFailure: .service("logout_unconfirmed", 503))
    await account.logout()
    #expect(workspace.phase == .signedOut && workspace.cards.isEmpty)
    #expect(account.error == Copy.text("auth.logoutUnconfirmed"))
  }
}

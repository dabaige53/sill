import Foundation
import Testing

@testable import Sill
@testable import SillKit

private actor AccountStub: CloudAccountService {
  nonisolated let isLocal = false
  var owner = "account-a"
  var setup = false
  var restored = false
  private var restorePaused = false
  private var restoreEntered = false
  private var restoreArrival: CheckedContinuation<Void, Never>?
  private var restoreRelease: CheckedContinuation<Void, Never>?
  var restoreFailure: CloudWorkspaceError?
  var pendingWriteKey: String?
  var logoutFailure: CloudWorkspaceError?
  var loginFailure: CloudWorkspaceError?
  var logoutCalls = 0
  var requestedSetup: Bool?
  var callbacks = 0

  func configure(
    owner: String? = nil, setup: Bool? = nil, restored: Bool? = nil, pending: String? = nil,
    logoutFailure: CloudWorkspaceError? = nil,
    loginFailure: CloudWorkspaceError? = nil
  ) {
    if let owner { self.owner = owner }
    if let setup { self.setup = setup }
    if let restored { self.restored = restored }
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
    if restorePaused {
      await withCheckedContinuation { continuation in
        restoreRelease = continuation
        restoreEntered = true
        restoreArrival?.resume()
        restoreArrival = nil
      }
    }
    if let restoreFailure { throw restoreFailure }
    return restored ? state() : nil
  }
  func pauseRestore() { restorePaused = true }
  func waitForRestore() async {
    if !restoreEntered {
      await withCheckedContinuation { restoreArrival = $0 }
    }
  }
  func releaseRestore() {
    restorePaused = false
    restoreRelease?.resume()
    restoreRelease = nil
  }
  func failRestore(_ error: CloudWorkspaceError) { restoreFailure = error }
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
  // @wu-test type=boundary | scope=CloudLogin email validation | protects=Reject malformed email before login
  @Test func loginValidatesEmailBeforeSubmitting() {
    #expect(CloudLogin.validEmail("user@example.com"))
    #expect(CloudLogin.validEmail("  a+b@example.com  "))
    #expect(!CloudLogin.validEmail("invalid"))
    #expect(!CloudLogin.validEmail("a b@example.com"))
    #expect(!CloudLogin.validEmail(String(repeating: "a", count: 250) + "@example.com"))
  }

  // @wu-test type=integration | scope=Account session restoration | protects=Restore the signed-in workspace after restart
  @Test func restoresSavedSessionAndAttachesBackend() async throws {
    let service = AccountStub()
    await service.configure(restored: true)
    let workspace = Workspace(autoload: false)
    let account = Account(workspace: workspace, service: service)
    await account.start()
    await waitForWorkspace(workspace)
    #expect(account.owner == "account-a")
    #expect(workspace.model("shared-id")?.title == "account-a")
    #expect(workspace.seconds == 12)
    #expect(!account.busy)
  }

  // @wu-test type=integration | scope=Account session restoration | protects=Keep scheduled reminders after a temporary identity lookup failure
  @Test func transientSessionFailurePreservesNotificationsUntilIdentityIsKnown() async {
    for failure in [
      CloudWorkspaceError.service("unavailable", 503), .unauthenticated, .service("forbidden", 403),
    ] {
      let service = AccountStub()
      await service.failRestore(failure)
      let workspace = Workspace(autoload: false)
      let account = Account(workspace: workspace, service: service)
      let suite = "sill-test-account-reminders-" + UUID().uuidString
      let defaults = UserDefaults(suiteName: suite)!
      defer { defaults.removePersistentDomain(forName: suite) }
      let client = ReminderClientStub()
      let request = ScheduledReminder(
        id: "sill-reminder:account-a:future:5000",
        owner: "account-a", card: "future", title: "Synthetic reminder")
      client.requests[request.id] = request
      defaults.set([request.id], forKey: "sill.reminders.scheduled.account-a")
      let reminders = SystemReminders(
        client: client, defaults: defaults, now: { 1000 }, refillInterval: nil)
      reminders.start(workspace: workspace, account: { account.owner }, open: { _ in })
      await account.start()
      await reminders.finishScheduling()
      #expect(account.owner == nil)
      #expect(workspace.phase == .signedOut)
      if failure == .service("unavailable", 503) {
        #expect(client.requests[request.id] == request)
      } else {
        #expect(client.requests.isEmpty)
      }
    }
  }

  // @wu-test type=integration | scope=Account switching | protects=Prevent previous account content and activity from reaching the next account
  @Test func accountSwitchClearsWorkspaceActivityAndAllSurfaces() async throws {
    let service = AccountStub()
    let workspace = Workspace(autoload: false)
    let app = AppModel(workspace: workspace, accountService: service)
    await app.account.start()
    await app.account.login(email: "a@example.invalid", password: "synthetic")
    await waitForWorkspace(workspace)
    app.feed.search("private query")
    app.selection.select("shared-id")
    app.ai.draft = "private draft"
    app.ai.add(["shared-id"])
    app.panels.open(.settings)
    let oldReader = app.reader
    oldReader.open("shared-id")
    workspace.recorder.readingSecond()
    await app.account.logout()
    #expect(workspace.phase == .signedOut)
    #expect(workspace.cards.isEmpty)
    #expect(workspace.seconds == 0 && workspace.storedPreferences.isEmpty)
    #expect(!workspace.recorder.hasRecords)
    #expect(app.feed.query.isEmpty && !app.selection.active)
    #expect(app.ai.draft.isEmpty && app.ai.cards.isEmpty && app.panels.kind == nil)
    await service.configure(owner: "account-b")
    await app.account.login(email: "b@example.invalid", password: "synthetic")
    await waitForWorkspace(workspace)
    #expect(workspace.model("shared-id")?.title == "account-b")
    #expect(workspace.state("shared-id").note == "account-b")
    oldReader.reachedEnd("shared-id")
    #expect(!oldReader.sessionActive && !workspace.recorder.hasRecords)
    #expect(!workspace.state("shared-id").read)
    #expect(workspace.state("shared-id").note == "account-b")
    #expect(workspace.seconds == 12)
  }

  // @wu-test type=boundary | scope=Account login callback | protects=Prevent a second login from replacing the signed-in account
  @Test func signedInAccountRejectsAnotherLoginCallback() async throws {
    let service = AccountStub()
    let workspace = Workspace(autoload: false)
    let account = Account(workspace: workspace, service: service)
    await account.start()
    await account.login(email: "a@example.invalid", password: "synthetic")
    await waitForWorkspace(workspace)
    await service.configure(owner: "account-b")
    await account.completeLogin(URL(string: "sill://auth/callback?code=another-account")!)
    await account.login(email: "b@example.invalid", password: "synthetic")
    #expect(account.owner == "account-a")
    #expect(workspace.model("shared-id")?.title == "account-a")
    #expect(await service.callbacks == 0)
    #expect(workspace.notice?.text == Copy.text("auth.logoutBeforeLogin"))
  }

  // @wu-test type=integration | scope=Account logout | protects=Keep the workspace when an unresolved write blocks logout
  @Test func pendingWriteBlocksLogoutWithoutLosingTheWorkspace() async throws {
    let service = AccountStub()
    let workspace = Workspace(autoload: false)
    let account = Account(workspace: workspace, service: service)
    await account.start()
    await account.login(email: "a@example.invalid", password: "synthetic")
    await waitForWorkspace(workspace)
    await service.configure(pending: "uncertain-write")
    await account.logout()
    #expect(workspace.phase == .ready && account.owner == "account-a")
    #expect(account.error == Copy.appleUnknownWrite)
    #expect(await service.logoutCalls == 0)
    #expect(workspace.model("shared-id")?.title == "account-a")
    #expect(workspace.state("shared-id").note == "account-a")
  }

  // @wu-test type=integration | scope=Account password setup | protects=Finish password setup after email login
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
    await waitForWorkspace(workspace)
    #expect(account.owner == "account-a")
    #expect(workspace.model("shared-id")?.title == "account-a")
  }

  // @wu-test type=integration | scope=Account session restoration | protects=Prevent a late restore from reviving an expired account
  @Test func lateRestoreCannotReviveAnExpiredAccount() async throws {
    let service = AccountStub()
    await service.configure(restored: true)
    await service.pauseRestore()
    let workspace = Workspace(autoload: false)
    let account = Account(workspace: workspace, service: service)
    let task = Task { await account.start() }
    await service.waitForRestore()
    workspace.signOutLocally()
    account.expire()
    await service.releaseRestore()
    await task.value
    #expect(workspace.phase == .signedOut && workspace.cards.isEmpty)
    #expect(account.owner == nil && !account.busy)
  }

  // @wu-test type=integration | scope=Account login and logout | protects=Show login failure and unconfirmed logout without exposing workspace data
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
    await waitForWorkspace(workspace)
    await service.configure(logoutFailure: .service("logout_unconfirmed", 503))
    await account.logout()
    #expect(workspace.phase == .signedOut && workspace.cards.isEmpty)
    #expect(account.error == Copy.text("auth.logoutUnconfirmed"))
  }
}

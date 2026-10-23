import Foundation
import Observation
import SillKit

/// The login form and workspace share one cookie session. Passwords never become model state.
@MainActor @Observable final class Account {
  private(set) var busy = false
  private(set) var owner: String?
  private(set) var needsPasswordSetup = false
  private(set) var message: String?
  private(set) var error: String?
  @ObservationIgnored private let workspace: Workspace
  @ObservationIgnored private let service: any CloudAccountService
  @ObservationIgnored private var generation = 0
  @ObservationIgnored private var started = false
  @ObservationIgnored private var callback: URL?

  init(
    workspace: Workspace, service: any CloudAccountService = CloudBackend(cloud: CloudWorkspace())
  ) {
    self.workspace = workspace
    self.service = service
    workspace.sessionInvalidated = { [weak self] error in self?.expire(error) }
  }

  func start() async {
    guard !busy, !started else { return }
    started = true
    if workspace.isLocal {
      workspace.start()
      return
    }
    busy = true
    workspace.beginConnection()
    let token = generation
    defer { finish(token) }
    do {
      if let state = try await service.restoreSession() {
        guard token == generation else { return }
        try accept(state)
      } else if token == generation {
        workspace.signOutLocally()
      }
    } catch {
      guard token == generation else { return }
      workspace.signOutLocally()
      self.error = Self.message(error)
    }
  }

  func login(email: String, password: String) async {
    guard owner == nil else { return }
    await authenticate {
      try await self.service.login(
        email: email.trimmingCharacters(in: .whitespacesAndNewlines), password: password)
    }
  }

  func completeLogin(_ url: URL) async {
    guard !workspace.isLocal else { return }
    if owner != nil {
      workspace.toast(Copy.text("auth.logoutBeforeLogin"))
      return
    }
    if busy {
      callback = url
      return
    }
    await authenticate { try await self.service.completeLogin(url: url) }
  }

  func setPassword(_ password: String) async {
    guard needsPasswordSetup else { return }
    await authenticate { try await self.service.setPassword(password: password) }
  }

  func requestLink(email: String, setupPassword: Bool) async {
    guard !busy, !workspace.isLocal else { return }
    busy = true
    error = nil
    message = nil
    let token = generation
    defer { finish(token) }
    do {
      let result = try await service.requestLoginLink(
        email: email.trimmingCharacters(in: .whitespacesAndNewlines), setupPassword: setupPassword)
      guard token == generation else { return }
      message = result["message"]?.string ?? Copy.text("server.http.f868232da331")
    } catch { if token == generation { self.error = Self.message(error) } }
  }

  func logout() async {
    guard !busy, !workspace.isLocal else { return }
    guard workspace.queue.idle else {
      error = Copy.text("login.processing")
      return
    }
    busy = true
    let token = generation
    defer { finish(token) }
    guard await service.pendingWriteKey == nil else {
      error = Copy.appleUnknownWrite
      return
    }
    guard token == generation else { return }
    do { try await service.logout() } catch CloudWorkspaceError.unknownWrite {
      error = Copy.appleUnknownWrite
      return
    } catch CloudWorkspaceError.service("busy", 409) {
      error = Copy.text("login.processing")
      return
    } catch { self.error = Self.message(error) }
    guard token == generation else { return }
    owner = nil
    needsPasswordSetup = false
    message = nil
    workspace.signOutLocally()
  }

  private func authenticate(_ action: () async throws -> CloudWorkspaceState) async {
    guard !busy, !workspace.isLocal else { return }
    busy = true
    error = nil
    message = nil
    let token = generation
    defer { finish(token) }
    do {
      let state = try await action()
      guard token == generation else { return }
      try accept(state)
    } catch {
      guard token == generation else { return }
      if case CloudWorkspaceError.unauthenticated = error {
        owner = nil
        needsPasswordSetup = false
        workspace.signOutLocally()
      } else if case CloudWorkspaceError.service(_, 403) = error {
        owner = nil
        needsPasswordSetup = false
        workspace.signOutLocally()
      }
      self.error = Self.message(error)
    }
  }

  private func accept(_ state: CloudWorkspaceState) throws {
    let snapshot = try Snapshot(json: state.json)
    if owner != nil && owner != state.owner { workspace.signOutLocally() }
    owner = state.owner
    needsPasswordSetup = state.needsPasswordSetup
    workspace.connect(service, initial: snapshot)
  }

  func clearFeedback() {
    message = nil
    error = nil
  }

  func expire(_ failure: any Error = CloudWorkspaceError.unauthenticated) {
    generation += 1
    busy = false
    owner = nil
    needsPasswordSetup = false
    callback = nil
    error = Self.message(failure)
  }

  private func finish(_ token: Int) {
    guard token == generation else { return }
    busy = false
    if let url = callback {
      callback = nil
      Task { await completeLogin(url) }
    }
  }

  private static func message(_ error: any Error) -> String {
    switch error {
    case CloudWorkspaceError.unauthenticated: Copy.text("login.unauthenticated")
    case CloudWorkspaceError.sessionStorage: Copy.appleSessionError
    case CloudWorkspaceError.unknownWrite: Copy.appleUnknownWrite
    case CloudWorkspaceError.service(let code, let status):
      status == 403
        ? Copy.text("login.forbidden")
        : status == 429
          ? Copy.text("login.rateLimited")
          : Copy.text(code == "logout_unconfirmed" ? "auth.logoutUnconfirmed" : "login.unavailable")
    default: Copy.text("login.network")
    }
  }
}

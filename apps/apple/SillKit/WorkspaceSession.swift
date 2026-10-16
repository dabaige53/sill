import Darwin
import Foundation

public final class WorkspaceSession: Sendable {
  public let store: CardStore
  private let descriptor: Int32

  public init(directory: URL) throws {
    store = try CardStore(directory: directory)
    let file = directory.appendingPathComponent("workspace.lock")
    let opened = open(file.path, O_CREAT | O_RDWR | O_CLOEXEC | O_NOFOLLOW, 0o600)
    guard opened >= 0 else { throw StoreError.unavailable(errno) }
    guard flock(opened, LOCK_EX | LOCK_NB) == 0 else {
      let failure = errno
      close(opened)
      if failure == EWOULDBLOCK { throw StoreError.workspaceInUse }
      throw StoreError.unavailable(failure)
    }
    descriptor = opened
  }

  deinit {
    flock(descriptor, LOCK_UN)
    close(descriptor)
  }
}

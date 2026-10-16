import Darwin
import Foundation

struct FileLock {
  static func withLock<T>(at url: URL, _ body: () throws -> T) throws -> T {
    let descriptor = open(url.path, O_CREAT | O_RDWR | O_CLOEXEC | O_NOFOLLOW, 0o600)
    guard descriptor >= 0 else { throw StoreError.unavailable(errno) }
    defer { close(descriptor) }
    while flock(descriptor, LOCK_EX) != 0 {
      guard errno == EINTR else { throw StoreError.unavailable(errno) }
    }
    defer { flock(descriptor, LOCK_UN) }
    return try body()
  }
}

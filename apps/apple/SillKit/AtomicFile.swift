import Darwin
import Foundation

enum AtomicFile {
  static func write(_ data: Data, to url: URL, fault: FileFault? = nil) throws {
    try fault?(.beforeWrite, url)
    let temporary = url.deletingLastPathComponent().appendingPathComponent("." + UUID().uuidString)
    let descriptor = open(temporary.path, O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC, 0o600)
    guard descriptor >= 0 else { throw StoreError.unavailable(errno) }
    var renamed = false
    defer {
      close(descriptor)
      if !renamed { unlink(temporary.path) }
    }
    try data.withUnsafeBytes { buffer in
      guard let start = buffer.baseAddress else { return }
      var offset = 0
      while offset < buffer.count {
        let count = Darwin.write(descriptor, start.advanced(by: offset), buffer.count - offset)
        if count < 0, errno == EINTR { continue }
        guard count > 0 else { throw StoreError.unavailable(errno) }
        offset += count
      }
    }
    guard fsync(descriptor) == 0 else { throw StoreError.unavailable(errno) }
    guard rename(temporary.path, url.path) == 0 else { throw StoreError.unavailable(errno) }
    renamed = true
    do {
      try fault?(.afterRename, url)
      let directory = open(url.deletingLastPathComponent().path, O_RDONLY | O_CLOEXEC)
      guard directory >= 0 else { throw StoreError.unknownWrite }
      defer { close(directory) }
      guard fsync(directory) == 0 else { throw StoreError.unknownWrite }
    } catch { throw StoreError.unknownWrite }
  }
}

import Foundation

public final class DraftStore: Sendable {
  private let queue = DispatchQueue(label: "app.sill.draft", qos: .userInitiated)
  public let url: URL

  public init(directory: URL) { url = directory.appendingPathComponent("draft.json") }

  public func enqueue(_ draft: Draft, onError: @escaping @Sendable () -> Void) {
    queue.async { [self] in
      do { try write(draft) } catch { onError() }
    }
  }

  public func persist(_ draft: Draft) throws { try queue.sync { try write(draft) } }
  public func flush() { queue.sync {} }

  public func restore() throws -> Draft? {
    try queue.sync {
      try FileLock.withLock(at: url.appendingPathExtension("lock")) {
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        return try JSONDecoder().decode(Draft.self, from: Data(contentsOf: url))
      }
    }
  }

  public func discard() throws {
    try queue.sync {
      try FileLock.withLock(at: url.appendingPathExtension("lock")) {
        if FileManager.default.fileExists(atPath: url.path) {
          try FileManager.default.removeItem(at: url)
        }
      }
    }
  }

  private func write(_ draft: Draft) throws {
    try FileLock.withLock(at: url.appendingPathExtension("lock")) {
      try AtomicFile.write(JSONEncoder().encode(draft), to: url)
    }
  }
}

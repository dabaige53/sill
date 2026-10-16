import Foundation

@testable import SillKit

final class FileFaultController: @unchecked Sendable {
  enum Mode { case lostReceipt, readUnavailable, changedBeforeVerification, beforeWrite }
  private let lock = NSLock()
  private let mode: Mode
  private var committed = false
  private var verificationReads = 0
  private var writeAttempts = 0

  init(_ mode: Mode) { self.mode = mode }

  var counts: (writes: Int, reads: Int) {
    lock.withLock { (writeAttempts, verificationReads) }
  }

  func inject(_ phase: FilePhase, url: URL) throws {
    try lock.withLock {
      switch phase {
      case .beforeWrite:
        writeAttempts += 1
        if mode == .beforeWrite { throw StoreError.unavailable(5) }
      case .afterRename:
        committed = true
        throw StoreError.unknownWrite
      case .beforeRead:
        guard committed else { return }
        verificationReads += 1
        if mode == .readUnavailable { throw StoreError.unavailable(5) }
        if mode == .changedBeforeVerification {
          var json = try JSONValue.decode(Data(contentsOf: url))
          var state = json["state"]!
          var cards = state["cards"]!.array!
          cards[0]["title"] = .string("Concurrent edit")
          state["cards"] = .array(cards)
          json["state"] = state
          json["revision"] = .number((json["revision"]?.number ?? 0) + 1)
          try AtomicFile.write(json.encoded(), to: url)
        }
      }
    }
  }
}

import Testing

@testable import SillMobile

@MainActor
struct MobileReadingSessionTests {
  @Test func continuousScrollingSavesTheLatestProgressOnTheTimer() async throws {
    await confirmation("Scheduled progress saved", expectedCount: 1) { saved in
      let session = MobileReadingSession(progress: 0) { seconds, progress in
        #expect(seconds == 0)
        #expect(progress == 0.6)
        saved()
        return .saved
      }
      session.advance(0.2)
      session.advance(0.6)
      try? await Task.sleep(for: .milliseconds(750))
    }
  }

  @Test func backgroundThenCloseSavesProgressAndCountsEachSecondOnce() async {
    var writes: [(Int, Double)] = []
    let session = MobileReadingSession(progress: 0) { seconds, progress in
      writes.append((seconds, progress))
      await Task.yield()
      return .saved
    }
    session.tick()
    session.tick()
    session.advance(0.45)
    async let background = session.flush()
    async let close = session.flush()
    #expect(await background)
    #expect(await close)
    #expect(writes.count == 1)
    #expect(writes.first?.0 == 2)
    #expect(writes.first?.1 == 0.45)
    session.tick()
    #expect(await session.flush(completed: true))
    #expect(writes.last?.0 == 1)
    #expect(writes.last?.1 == 1)
  }

  @Test func progressWithoutAFullSecondStillSavesAndCannotMarkReadEarly() async {
    var writes: [(Int, Double)] = []
    let session = MobileReadingSession(progress: 0) { seconds, progress in
      writes.append((seconds, progress))
      return .saved
    }
    session.advance(1)
    #expect(await session.flush())
    #expect(writes.first?.0 == 0)
    #expect(writes.first?.1 == 0.99)
    #expect(await session.flush(completed: true))
    #expect(writes.last?.1 == 1)
  }

  @Test func unknownWriteIsNotAutomaticallyReplayedOrReportedAsComplete() async {
    var writes = 0
    let session = MobileReadingSession(progress: 0) { _, _ in
      writes += 1
      return .unknown
    }
    session.tick()
    #expect(await session.flush(completed: true) == false)
    #expect(await session.flush(completed: true) == false)
    #expect(writes == 1)
  }

  @Test func confirmedRejectionKeepsActivityForTheCloseFlush() async {
    var writes: [(Int, Double)] = []
    let session = MobileReadingSession(progress: 0) { seconds, progress in
      writes.append((seconds, progress))
      return writes.count == 1 ? .rejected : .saved
    }
    session.tick()
    session.advance(0.45)
    #expect(await session.flush() == false)
    #expect(writes.count == 1)
    #expect(await session.flush())
    #expect(writes.count == 2)
    #expect(writes.last?.0 == 1)
    #expect(writes.last?.1 == 0.45)
  }
}

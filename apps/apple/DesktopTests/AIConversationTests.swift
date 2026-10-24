import Foundation
import Testing

@testable import Sill

/// The same rules as Web `tests/web/ai-conversation.test.ts`.
struct AIConversationTests {
  private func session(
    _ id: String, running: Bool = false, at date: Date = .now, results: [AIResultState] = []
  ) -> AISession {
    AISession(
      id: id, title: id, updatedAt: date, running: running,
      messages: results.isEmpty
        ? []
        : [
          AIMessage(
            id: "m", role: .ai, text: "",
            results: results.map {
              AIResult(cardId: "c", title: "c", kind: .task, change: "", state: $0)
            })
        ])
  }

  @Test func withoutSessionTheBoxNeverGrows() {
    for event in [AIHeightEvent.open, .full, .shrink, .escape] {
      #expect(AIRules.next(.line, event, hasSession: false) == .line)
    }
  }

  @Test func heightsFollowTheHandbookTable() {
    #expect(AIRules.next(.line, .open, hasSession: true) == .panel)
    #expect(AIRules.next(.panel, .full, hasSession: true) == .full)
    #expect(AIRules.next(.full, .shrink, hasSession: true) == .panel)
    #expect(AIRules.next(.full, .escape, hasSession: true) == .panel)
    #expect(AIRules.next(.panel, .escape, hasSession: true) == .line)
    for event in [AIHeightEvent.outside, .detail, .select] {
      #expect(AIRules.next(.panel, event, hasSession: true) == .line)
      #expect(AIRules.next(.full, event, hasSession: true) == .full)
    }
  }

  @Test func onlyFailedOrUnknownWritesAskForAttention() {
    #expect(session("a", running: true).status == .running)
    #expect(session("a", results: [.written]).status == .idle)
    #expect(session("a", results: [.failed]).status == .attention)
    #expect(session("a", running: true, results: [.unknown]).status == .attention)
  }

  @Test func sessionListPutsRunningFirstThenDays() {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "UTC")!
    let now = Date(timeIntervalSince1970: 1_792_756_800)
    let day: TimeInterval = 86_400
    let list = [
      session("old", at: now.addingTimeInterval(-5 * day)),
      session("run", running: true, at: now.addingTimeInterval(-3 * day)),
      session("today", at: now.addingTimeInterval(-3_600)),
      session("yesterday", at: now.addingTimeInterval(-day)),
    ]
    let groups = AIRules.groups(list, now: now, calendar: calendar)
    #expect(groups.map(\.group) == [.running, .today, .yesterday, .earlier])
    #expect(groups.map { $0.sessions.map(\.id) } == [["run"], ["today"], ["yesterday"], ["old"]])
    #expect(AIRules.othersRunning(list, current: "today") == 1)
  }

  @MainActor @Test func contextWithoutSessionStaysOneLine() {
    let context = AIContext()
    context.event(.open)
    #expect(context.height == .line)
    #expect(context.escape() == false)
    context.load([session("a", running: true), session("b")])
    context.event(.open)
    #expect(context.height == .panel)
    context.toggleList()
    #expect(context.escape() == true)
    #expect(context.listOpen == false)
    #expect(context.height == .panel)
    context.event(.full)
    context.event(.detail)
    #expect(context.height == .full)
    context.pick("b")
    #expect(context.session?.id == "b")
    #expect(context.escape() == true)
    #expect(context.height == .panel)
  }
}

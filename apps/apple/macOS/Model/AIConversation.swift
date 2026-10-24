import Foundation
import SillKit

/// AI conversation shapes and rules, the same as Web `data/ai-conversation.ts` (ADR 0064).
/// Nothing here talks to a model: the built-in AI is not connected, so the window holds no
/// sessions and the AI box stays one line.
enum AIHeight: String, Sendable { case line, panel, full }

/// Only a Sill receipt makes a result `written`; an unknown outcome is checked, never resent.
enum AIResultState: String, Sendable { case pending, running, written, failed, unknown }

struct AIResult: Hashable, Sendable {
  let cardId: String
  let title: String
  let kind: CardKind
  /// What changed, in the card's words.
  let change: String
  let state: AIResultState
}

struct AIMessage: Identifiable, Hashable, Sendable {
  enum Role: Sendable { case you, ai }
  let id: String
  let role: Role
  let text: String
  var cards: [String] = []
  var streaming = false
  var results: [AIResult] = []
}

enum AISessionStatus: String, Sendable { case running, attention, unseen, idle }

struct AISession: Identifiable, Hashable, Sendable {
  let id: String
  var title: String
  var updatedAt: Date
  var running: Bool
  /// A result arrived since the person last looked.
  var unseen = false
  var messages: [AIMessage]

  var status: AISessionStatus {
    let results = messages.flatMap(\.results)
    if results.contains(where: { $0.state == .failed || $0.state == .unknown }) {
      return .attention
    }
    if running { return .running }
    return unseen ? .unseen : .idle
  }
}

enum AIHeightEvent: Sendable { case open, collapse, full, shrink, escape, outside, detail, select }

enum AISessionGroup: String, CaseIterable, Sendable { case running, today, yesterday, earlier }

struct AISessionSection: Identifiable, Sendable {
  let group: AISessionGroup
  let sessions: [AISession]
  var id: AISessionGroup { group }
}

enum AIRules {
  /// The height table in the handbook. Without a session the box cannot grow.
  static func next(_ height: AIHeight, _ event: AIHeightEvent, hasSession: Bool) -> AIHeight {
    guard hasSession else { return .line }
    switch event {
    case .open: return height == .line ? .panel : height
    case .collapse: return height == .panel ? .line : height
    case .full: return .full
    case .shrink: return height == .full ? .panel : height
    case .escape: return height == .full ? .panel : .line
    case .outside, .detail, .select: return height == .panel ? .line : height
    }
  }

  /// Sessions running besides the current one, for 「另 N 个进行中」.
  static func othersRunning(_ sessions: [AISession], current: String?) -> Int {
    sessions.filter { $0.running && $0.id != current }.count
  }

  /// Running first, then history by day, newest first. Empty groups drop.
  static func groups(
    _ sessions: [AISession], now: Date = .now, calendar: Calendar = .current
  ) -> [AISessionSection] {
    let sorted = sessions.sorted { $0.updatedAt > $1.updatedAt }
    let today = calendar.startOfDay(for: now)
    let yesterday = calendar.date(byAdding: .day, value: -1, to: today) ?? today
    let groups: [(AISessionGroup, [AISession])] = [
      (.running, sorted.filter(\.running)),
      (.today, sorted.filter { !$0.running && $0.updatedAt >= today }),
      (
        .yesterday,
        sorted.filter { !$0.running && $0.updatedAt >= yesterday && $0.updatedAt < today }
      ),
      (.earlier, sorted.filter { !$0.running && $0.updatedAt < yesterday }),
    ]
    return groups.filter { !$0.1.isEmpty }.map { AISessionSection(group: $0.0, sessions: $0.1) }
  }
}

#if DEBUG
  /// Design sample sessions, the same as Web `data/ai-preview.ts`. Debug builds load them only
  /// with `SILL_AI_PREVIEW=1`; release builds never contain them.
  enum AIPreview {
    static var enabled: Bool { ProcessInfo.processInfo.environment["SILL_AI_PREVIEW"] == "1" }

    static func sessions(_ cards: [CardModel], now: Date = .now) -> [AISession] {
      func of(_ kind: CardKind) -> CardModel? { cards.first { $0.kind == kind } ?? cards.first }
      func result(_ card: CardModel?, _ change: String, _ state: AIResultState) -> [AIResult] {
        guard let card else { return [] }
        return [
          AIResult(
            cardId: card.id, title: card.title, kind: card.kind, change: change, state: state)
        ]
      }
      let task = of(.task)
      let reminder = cards.first { $0.kind == .reminder } ?? of(.mail)
      let event = of(.event)
      let mail = of(.mail)
      let article = of(.article)
      let hour: TimeInterval = 3600
      return [
        AISession(
          id: "preview-week", title: Copy.text("ai.sample.weekTitle"),
          updatedAt: now.addingTimeInterval(-60), running: true,
          messages: [
            AIMessage(
              id: "w1", role: .you, text: Copy.text("ai.sample.weekAsk"),
              cards: [task?.id, mail?.id].compactMap { $0 }),
            AIMessage(
              id: "w2", role: .ai, text: Copy.text("ai.sample.weekReply"),
              results: result(task, Copy.text("ai.sample.changeDue"), .written)
                + result(reminder, Copy.text("ai.sample.changeReminder"), .written)
                + result(event, Copy.text("ai.sample.changeNote"), .running)),
            AIMessage(id: "w3", role: .you, text: Copy.text("ai.sample.followAsk")),
            AIMessage(
              id: "w4", role: .ai, text: Copy.text("ai.sample.followReply"), streaming: true),
          ]),
        AISession(
          id: "preview-read", title: Copy.text("ai.sample.readTitle"),
          updatedAt: now.addingTimeInterval(-300), running: true,
          messages: [AIMessage(id: "r1", role: .you, text: Copy.text("ai.sample.followAsk"))]),
        AISession(
          id: "preview-prep", title: Copy.text("ai.sample.prepTitle"),
          updatedAt: now.addingTimeInterval(-2 * hour), running: false,
          messages: [
            AIMessage(id: "p1", role: .you, text: Copy.text("ai.sample.prepAsk")),
            AIMessage(
              id: "p2", role: .ai, text: Copy.text("ai.sample.prepReply"),
              results: result(event, Copy.text("ai.sample.changeTag"), .written)
                + result(task, Copy.text("ai.sample.changeTag"), .pending)
                + result(article, Copy.text("ai.sample.changeTag"), .failed)
                + result(mail, Copy.text("ai.sample.changeTag"), .unknown)),
          ]),
        AISession(
          id: "preview-sort", title: Copy.text("ai.sample.sortTitle"),
          updatedAt: now.addingTimeInterval(-26 * hour), running: false, messages: []),
        AISession(
          id: "preview-list", title: Copy.text("ai.sample.listTitle"),
          updatedAt: now.addingTimeInterval(-5 * 24 * hour), running: false, messages: []),
      ]
    }
  }
#endif

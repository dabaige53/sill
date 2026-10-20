import Foundation
import SillKit
import Testing

@testable import Sill

@MainActor struct WorkspaceTests {
  private func card(
    _ id: String, type: String = "article", time: Double = 0, priority: Double = 0,
    due: Double? = nil
  ) throws -> Card {
    var fields: [String: JSONValue] = [
      "id": .string(id), "type": .string(type), "title": .string(id), "time": .number(time),
      "priority": .number(priority),
    ]
    if let due { fields["due"] = .number(due) }
    return try Card(json: .object(fields))
  }
  @Test func sourceLineUsesOnlySourcesAndExplicitEstimate() throws {
    let card = try Card(
      json: .object([
        "id": .string("source"), "type": .string("article"), "title": .string("Title"),
        "sources": .array([.object(["name": .string("Source"), "kind": .string("web")])]),
        "authors": .array([.object(["name": .string("Author")])]),
        "publishedAt": .string("2026-10-20T12:30:45.123+08:00"),
        "readingEstimate": .object([
          "seconds": .number(61), "origin": .string("provided"), "scope": .string("available"),
        ]),
      ]))
    #expect(card.sourceLine.hasPrefix("Source · "))
    #expect(card.sourceLine.contains("2"))
    #expect(!card.sourceLine.contains("Author"))
    #expect(card.dateText("published_at") == nil)
    #expect(card.dateText("publishedAt") == "2026-10-20 12:30:45.123+08:00")
  }

  @Test func readerDismissReturnsOneRelatedCardAtATime() throws {
    let model = Workspace(autoload: false)
    model.cards = try [card("first"), card("second"), card("third")]
    model.selected = "first"
    model.selected = "second"
    model.selected = "third"
    model.dismissReader()
    #expect(model.selected == "second")
    model.dismissReader()
    #expect(model.selected == "first")
    model.dismissReader()
    #expect(model.selected == nil)
    #expect(model.readerTrail.isEmpty)
  }

  @Test func readerDismissSkipsRemovedCardsAndClearsHistoryWhenClosed() throws {
    let model = Workspace(autoload: false)
    model.cards = try [card("first"), card("third")]
    model.selected = "first"
    model.selected = "removed"
    model.selected = "third"
    model.dismissReader()
    #expect(model.selected == "first")
    model.selected = nil
    model.selected = "third"
    model.dismissReader()
    #expect(model.selected == nil)
  }

  @Test func searchDoesNotFilterHomeAndMatchesNotesAndTags() throws {
    let model = Workspace(autoload: false)
    model.cards = try [card("first"), card("second")]
    model.items = [
      "first": .object([
        "note": .string("needle"), "tags": .array([.string("work")]), "tagsEdited": .bool(true),
      ])
    ]
    model.page = "search"
    model.query = "needle"
    model.tagFilter = "work"
    #expect(model.visible.map(\.id) == ["first"])
    #expect(model.homeCards.count == 2)
    model.page = "home"
    #expect(model.visible.count == 2)
    model.page = "search"
    #expect(model.visible.map(\.id) == ["first"])
  }
  @Test func homeKeepsReadAndCompletedCardsUntilExplicitArchive() throws {
    let model = Workspace(autoload: false)
    model.cards = try [card("read"), card("archived"), card("reminder", type: "reminder")]
    model.items = [
      "read": .object(["read": .bool(true)]), "archived": .object(["archived": .bool(true)]),
      "reminder": .object(["reminderDone": .bool(true)]),
    ]
    #expect(Set(model.homeCards.map(\.id)) == ["read", "reminder"])
  }
  @Test func timelyPriorityAndStableUnreadSortMatchWeb() throws {
    let model = Workspace(autoload: false)
    model.cards = try [
      card("first", time: 5), card("important", time: 1, priority: 10),
      card("due", type: "reminder", due: Date.now.timeIntervalSince1970 * 1000 - 1),
    ]
    #expect(model.homeCards.map(\.id) == ["due", "important", "first"])
    model.preferences = ["sort": .string("unread")]
    model.items = ["first": .object(["read": .bool(true)])]
    #expect(model.homeCards.map(\.id) == ["important", "due", "first"])
    model.preferences = ["floatTimely": .bool(false)]
    #expect(model.homeCards.map(\.id) == ["first", "important", "due"])
  }
  @Test func explicitTaskStateOverridesCardDefaults() throws {
    let model = Workspace(autoload: false)
    let task = JSONValue.object([
      "id": .string("one"), "text": .string("Synthetic"), "done": .bool(true),
    ])
    let value = try Card(
      json: .object([
        "id": .string("task"), "type": .string("task"), "title": .string("Synthetic"),
        "tasks": .array([task]),
      ]))
    #expect(model.taskDone(value, task))
    model.items = [value.id: .object(["taskDone": .array([])])]
    #expect(!model.taskDone(value, task))
  }
}

struct ToastLifetimeTests {
  @Test func pauseKeepsRemainingTimeUntilResumed() {
    let start = ContinuousClock.now
    var lifetime = ToastLifetime(duration: .seconds(5.5))
    lifetime.resume(at: start)
    lifetime.pause(at: start.advanced(by: .seconds(2)))
    #expect(lifetime.remaining == .seconds(3.5))
    lifetime.pause(at: start.advanced(by: .seconds(20)))
    #expect(lifetime.remaining == .seconds(3.5))
    lifetime.resume(at: start.advanced(by: .seconds(20)))
    lifetime.resume(at: start.advanced(by: .seconds(21)))
    lifetime.pause(at: start.advanced(by: .seconds(22)))
    #expect(lifetime.remaining == .seconds(1.5))
  }

  @Test func replacementStartsWithItsOwnDurationAndExpirationClampsToZero() {
    let start = ContinuousClock.now
    var lifetime = ToastLifetime(duration: .seconds(5.5))
    lifetime.resume(at: start)
    lifetime = ToastLifetime(duration: .seconds(3.2))
    lifetime.resume(at: start.advanced(by: .seconds(1)))
    lifetime.pause(at: start.advanced(by: .seconds(5)))
    #expect(lifetime.remaining == .zero)
  }
}

@MainActor struct MotionStateTests {
  @Test func navigationCommitsLatestIntentWithoutDelayedSettings() async throws {
    let model = Workspace(autoload: false)
    model.presentNavigation("settings")
    #expect(model.settingsPresented)
    model.settingsPresented = false
    try await Task.sleep(for: .milliseconds(180))
    #expect(!model.settingsPresented)
    model.presentNavigation("settings")
    model.presentNavigation("search")
    try await Task.sleep(for: .milliseconds(180))
    #expect(!model.settingsPresented)
    #expect(model.page == "search")
    model.presentNavigation("settings")
    model.presentNavigation("home")
    #expect(!model.settingsPresented)
    #expect(model.page == "home")
  }

  @Test func closingReaderDoesNotRemoveNewSelection() {
    var detail = DetailPresentation()
    _ = detail.prepare("a")
    detail.visible = true
    let closing = detail.prepare(nil)
    detail.visible = false
    _ = detail.prepare("b")
    detail.visible = true
    detail.finishClose(closing)
    #expect(detail.cardID == "b")
    let latest = detail.prepare(nil)
    detail.visible = false
    detail.finishClose(latest)
    #expect(detail.cardID == nil)
  }

  @Test func interruptedExitKeepsConfirmedChoice() {
    var selection = DeckSelection()
    selection.confirm(1)
    #expect(selection.index == 0)
    selection.settle(count: 3)  // Loss of focus or enabling reduced motion.
    #expect(selection.index == 1)
    #expect(selection.pendingTarget == nil)
    selection.settle(count: 3)  // Canceling an unreleased drag leaves the choice unchanged.
    #expect(selection.index == 1)
  }

  @Test func repeatedGestureAndKeyboardStartAfterConfirmedChoice() {
    var selection = DeckSelection()
    selection.confirm(1)
    selection.settle(count: 4)  // New gesture takes over the confirmed incoming card.
    let next = DeckNavigation.target(
      index: selection.index, count: 4,
      translation: -120, velocity: -1, width: 300)
    selection.confirm(next)
    selection.step(1, count: 4)  // Keyboard takes over before the second exit completes.
    #expect(selection.index == 3)
    selection.confirm(2)
    selection.step(-1, count: 4)
    #expect(selection.index == 1)
    selection.confirm(3)
    selection.settle(count: 1)  // Data changes still clamp the confirmed choice.
    #expect(selection.index == 0)
  }

  @Test func deckUsesDirectionAndDoesNotWrap() {
    #expect(
      DeckNavigation.target(index: 1, count: 3, translation: -100, velocity: 0, width: 300) == 2)
    #expect(
      DeckNavigation.target(index: 1, count: 3, translation: 100, velocity: 0, width: 300) == 0)
    #expect(
      DeckNavigation.target(index: 0, count: 3, translation: 100, velocity: 1, width: 300) == 0)
    #expect(
      DeckNavigation.target(index: 2, count: 3, translation: -100, velocity: -1, width: 300) == 2)
    #expect(
      DeckNavigation.target(index: 0, count: 1, translation: -200, velocity: -1, width: 300) == 0)
    #expect(
      DeckNavigation.target(index: 0, count: 0, translation: -200, velocity: -1, width: 300) == 0)
  }

  @Test func deckRejectsSmallAndOpposingFlicks() {
    #expect(
      DeckNavigation.target(index: 1, count: 3, translation: -20, velocity: -1, width: 300) == 1)
    #expect(
      DeckNavigation.target(index: 1, count: 3, translation: -40, velocity: 1, width: 300) == 1)
    #expect(
      DeckNavigation.target(index: 1, count: 3, translation: -40, velocity: -1, width: 300) == 2)
  }
}

@MainActor struct CardReasonDataTests {
  @Test func removingReasonEntryPreservesCardReasonData() throws {
    let why: JSONValue = .object([
      "reason": .string("Synthetic reason"),
      "basis": .array([.string("Keep evidence")]),
    ])
    let card = try Card(
      json: .object([
        "id": .string("reason-data"), "type": .string("article"),
        "title": .string("Synthetic"), "why": why,
      ]))
    let model = Workspace(autoload: false)
    model.cards = [card]
    model.selected = card.id
    model.selected = nil
    #expect(model.cards.first?.fields["why"] == why)
  }
}

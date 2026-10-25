import Foundation
import SillKit
import Testing

@testable import SillMobile

@MainActor struct MobileFeedStateTests {
  private func card(
    _ id: Int, read: Bool = false, archived: Bool = false,
    time: Double = 5_000_000, source: String = "web"
  ) throws -> MobileCard {
    try MobileCard(
      card: Card(
        json: .object([
          "id": .string("card-\(id)"), "type": .string("article"),
          "title": .string("Article \(id)"),
          "time": .number(time),
          "sources": .array([
            .object(["name": .string("Synthetic source"), "kind": .string(source)])
          ]),
        ])), item: .object(["read": .bool(read), "archived": .bool(archived)]))
  }

  @Test func readChangesKeepMembersUntilRefreshButArchiveRemovesImmediately() throws {
    let state = MobileFeedState()
    let first = try card(1)
    let second = try card(2)
    state.rebuild(scope: "unread", cards: [first, second], catalog: [first, second], stack: false)
    let read = try card(1, read: true)
    state.synchronize(catalog: [read, second], eligible: [second])
    #expect(state.entries.flatMap(\.cards) == [first.id, second.id])
    let archived = try card(1, read: true, archived: true)
    state.synchronize(catalog: [archived, second], eligible: [second])
    #expect(state.entries.flatMap(\.cards) == [second.id])
    state.rebuild(scope: "unread", cards: [second], catalog: [read, second], stack: false)
    #expect(state.entries.flatMap(\.cards) == [second.id])
  }

  @Test func stackNeedsSixUnreadCardsFromOneSourceWithinOneHour() throws {
    let six = try (0..<6).map { try card($0) }
    #expect(MobileFeedState.entries(six, stack: true).count == 1)
    #expect(MobileFeedState.entries(Array(six.prefix(5)), stack: true).count == 5)
    let read = try card(5, read: true)
    #expect(MobileFeedState.entries(Array(six.prefix(5)) + [read], stack: true).count == 6)
    let older = try card(5, time: 1_000_000)
    #expect(MobileFeedState.entries(Array(six.prefix(5)) + [older], stack: true).count == 6)
    let agents = try (0..<6).map { try card($0, source: "agent") }
    #expect(MobileFeedState.entries(agents, stack: true).count == 6)
  }

  @Test func paginationDoesNotReplayInitialEntrancesAndNewCardsEnterOnce() throws {
    let cards = try (0..<81).map { try card($0) }
    let state = MobileFeedState()
    state.rebuild(scope: "all", cards: cards, catalog: cards, stack: false)
    #expect(state.visible.count == 40)
    #expect(state.entrance(cards[0].id) == .initial(0))
    #expect(state.entrance(cards[0].id) == .none)
    state.nextPage()
    #expect(state.visible.count == 80)
    #expect(state.entrance(cards[40].id) == .none)
    let incoming = try card(100)
    state.synchronize(catalog: [incoming] + cards, eligible: [incoming] + cards)
    #expect(state.entries.first?.id == incoming.id)
    #expect(state.entrance(incoming.id) == .added)
  }
}

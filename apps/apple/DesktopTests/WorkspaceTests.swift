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

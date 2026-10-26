import SillKit
import Testing

@testable import SillMobile

@MainActor struct MobileReadAppearanceTests {
  @Test func confirmedReadingStaysHiddenUntilTheSourceLayerCloses() throws {
    let source = try Card(
      json: .object([
        "id": .string("article"), "type": .string("article"), "title": .string("Synthetic article"),
      ]))
    let original = try MobileCard(card: source, item: .object(["progress": .number(0.2)]))
    let confirmed = try MobileCard(
      card: source,
      item: .object([
        "read": .bool(true), "progress": .number(1),
      ]))
    let appearance = MobileReadAppearance()
    appearance.hold(original)
    appearance.hold(confirmed)
    #expect(appearance.value(confirmed).read == false)
    #expect(appearance.value(confirmed).progress == 0.2)
    #expect(confirmed.read)
    appearance.release(original.id)
    #expect(appearance.value(confirmed).read)
    #expect(appearance.value(confirmed).progress == 1)
    appearance.hold(original)
    appearance.clear()
    #expect(appearance.value(confirmed).read)
  }

  @Test func completedReminderStateAlsoStopsEventAndTaskNotifications() throws {
    for type in ["event", "task", "reminder"] {
      var raw: JSONValue = .object([
        "id": .string(type), "type": .string(type), "title": .string("Synthetic completion"),
      ])
      if type == "event" {
        raw["start"] = .number(1_000)
        raw["end"] = .number(2_000)
      } else if type == "task" {
        raw["tasks"] = .array([
          .object([
            "id": .string("unfinished"), "text": .string("Open task"), "done": .bool(false),
          ])
        ])
      }
      let card = try Card(json: raw)
      let completed = try MobileCard(card: card, item: .object(["reminderDone": .bool(true)]))
      #expect(completed.completed)
    }
  }
}

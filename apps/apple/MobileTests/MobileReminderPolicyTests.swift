import SillKit
import Testing

@testable import SillMobile

@Suite struct MobileReminderPolicyTests {
  private let now = 10_000_000.0

  private func card(
    _ type: String = "reminder", fields: [String: JSONValue] = [:],
    item: [String: JSONValue] = [:]
  ) throws -> MobileCard {
    var values: [String: JSONValue] = [
      "id": .string("synthetic"), "type": .string(type), "title": .string("Synthetic reminder"),
    ]
    switch type {
    case "event":
      values["start"] = .number(now + 15 * 60_000)
      values["end"] = .number(now + 3_600_000)
    case "task":
      values["due"] = .number(now + 30 * 60_000)
      values["tasks"] = .array([
        .object(["id": .string("first"), "text": .string("First task"), "done": .bool(false)]),
        .object(["id": .string("second"), "text": .string("Second task"), "done": .bool(false)]),
      ])
    case "reminder": values["due"] = .number(now)
    default: break
    }
    values.merge(fields) { _, value in value }
    return try MobileCard(card: Card(json: .object(values)), item: .object(item))
  }

  @Test func notificationTimesMatchEachTypeAndWaitUntilDue() throws {
    for type in ["event", "task", "reminder"] {
      let value = try card(type)
      #expect(MobileReminderPolicy.trigger(value) == now)
      #expect(!MobileReminderPolicy.eligible(value, now: now - 1))
      #expect(MobileReminderPolicy.eligible(value, now: now))
    }
  }

  @Test func cooldownAllowsExactlyOneMinuteAndOldKeysDoNotReplay() throws {
    let original = try card()
    let repeated = try card(item: ["lastReminderKey": .string(MobileReminderPolicy.key(original))])
    #expect(!MobileReminderPolicy.eligible(repeated, now: now + 60_000))
    let recent = try card(item: [
      "lastReminderKey": .string("synthetic:earlier"), "lastNotifiedAt": .number(now - 59_999),
    ])
    #expect(!MobileReminderPolicy.eligible(recent, now: now))
    #expect(MobileReminderPolicy.eligible(recent, now: now + 1))
    let neverShown = try card(item: ["lastNotifiedAt": .number(0)])
    #expect(MobileReminderPolicy.eligible(neverShown, now: now))
  }

  @Test func snoozeChangesOnlyTheEffectiveReminderTimeAndKey() throws {
    let snoozed = try card(item: ["snoozedUntil": .number(now + 600_000)])
    #expect(MobileReminderPolicy.trigger(snoozed) == now + 600_000)
    #expect(MobileReminderPolicy.key(snoozed) == "synthetic:10600000")
    #expect(MobileReminderPolicy.key(snoozed, snoozedUntil: 0) == "synthetic:10000000")
    #expect(!MobileReminderPolicy.eligible(snoozed, now: now))
    #expect(MobileReminderPolicy.eligible(snoozed, now: now + 600_000))
    #expect(snoozed.due == now)
  }

  @Test func completedAndDismissedCardsDoNotNotify() throws {
    let allTasks = try card(
      "task", item: ["taskDone": .array([.string("first"), .string("second")])])
    let oneTask = try card("task", item: ["taskDone": .array([.string("first")])])
    #expect(!MobileReminderPolicy.eligible(allTasks, now: now))
    #expect(MobileReminderPolicy.eligible(oneTask, now: now))
    for type in ["event", "task", "reminder"] {
      for flag in ["reminderDone", "dismissed", "archived"] {
        let hidden = try card(type, item: [flag: .bool(true)])
        #expect(!MobileReminderPolicy.eligible(hidden, now: now))
      }
    }
  }

  @Test func endedEventAndNonReminderCannotBecomeDueThroughSnooze() throws {
    let ended = try card(
      "event",
      fields: [
        "start": .number(now - 3_600_000), "end": .number(now),
      ], item: ["snoozedUntil": .number(now - 1)])
    #expect(!MobileReminderPolicy.eligible(ended, now: now))
    let note = try card("note", item: ["snoozedUntil": .number(now - 1)])
    #expect(!MobileReminderPolicy.eligible(note, now: now))
    let missing = try MobileCard(
      card: Card(
        json: .object([
          "id": .string("missing"), "type": .string("reminder"), "title": .string("No time"),
        ])))
    #expect(!MobileReminderPolicy.eligible(missing, now: now))
  }

  @Test func fractionalTimestampKeepsTheSharedWebReminderKey() throws {
    let fractional = try card(fields: ["due": .number(now + 0.25)])
    #expect(MobileReminderPolicy.key(fractional) == "synthetic:10000000.25")
    let repeated = try card(
      fields: ["due": .number(now + 0.25)],
      item: [
        "lastReminderKey": .string("synthetic:10000000.25")
      ])
    #expect(!MobileReminderPolicy.eligible(repeated, now: now + 1))
  }
}

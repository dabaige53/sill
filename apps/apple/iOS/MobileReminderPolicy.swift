import Foundation

/// Mirrors Web FeedPolicy: snoozes affect notification time, never home membership.
enum MobileReminderPolicy {
  static func trigger(_ card: MobileCard, snoozedUntil: Double? = nil) -> Double {
    let snooze = snoozedUntil ?? card.item["snoozedUntil"]?.number ?? 0
    if snooze > 0 { return snooze }
    switch card.type {
    case "event": return (card.start ?? .nan) - 15 * 60_000
    case "task": return (card.due ?? .nan) - 30 * 60_000
    case "reminder": return card.due ?? .nan
    default: return .nan
    }
  }

  static func key(_ card: MobileCard, snoozedUntil: Double? = nil) -> String {
    let at = trigger(card, snoozedUntil: snoozedUntil)
    let value = at.isFinite ? (at.rounded() == at ? String(format: "%.0f", at) : String(at)) : "NaN"
    return "\(card.id):\(value)"
  }

  static func eligible(_ card: MobileCard, now: Double) -> Bool {
    let at = trigger(card)
    let last = card.item["lastNotifiedAt"]?.number ?? 0
    return ["event", "task", "reminder"].contains(card.type)
      && at.isFinite && at > 0 && at <= now && !card.archived && !card.dismissed
      && !card.reminderDone && !card.completed
      && !(card.type == "event" && (card.end ?? .infinity) <= now)
      && card.item["lastReminderKey"]?.string != key(card)
      && (last == 0 || now - last >= 60_000)
  }
}

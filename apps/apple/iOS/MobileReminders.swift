#if os(iOS)
import Foundation
import Observation
import SillKit
import UserNotifications

/// Device notifications are a schedule of the last account snapshot, not a push service.
@MainActor @Observable final class MobileReminders: NSObject, UNUserNotificationCenterDelegate {
  static let shared = MobileReminders()
  private(set) var enabled = false
  private(set) var busy = false
  private(set) var scheduled = 0
  private(set) var remaining = 0
  var message: String?
  var onOpen: ((String) -> Void)? {
    didSet { deliverPending() }
  }
  private weak var workspace: MobileWorkspace?
  private let center = UNUserNotificationCenter.current()
  private let defaults = UserDefaults.standard
  private let prefix = "sill.ios.reminder:"
  private var generation = 0
  private var scheduling: Task<Void, Never>?
  private var pendingOpen: (owner: String, card: String)?

  private override init() {
    super.init()
    center.delegate = self
  }

  func setEnabled(_ value: Bool, workspace: MobileWorkspace) async {
    guard let owner = workspace.owner, !busy else { return }
    busy = true
    defer { busy = false }
    do {
      if value {
        let allowed = try await center.requestAuthorization(options: [.alert, .sound, .badge])
        guard workspace.owner == owner else { return }
        guard allowed else {
          message = Copy.text("reminders.deniedMac")
          return
        }
      }
      defaults.set(value, forKey: "sill.reminders.enabled." + owner)
      await reconcile(workspace)
    } catch { message = Copy.text("reminders.failed") }
  }

  func reconcile(_ workspace: MobileWorkspace) async {
    self.workspace = workspace
    generation += 1
    let token = generation
    let previous = scheduling
    let next = Task { [weak self] in
      await previous?.value
      guard let self, token == self.generation else { return }
      await self.schedule(workspace, token: token)
    }
    scheduling = next
    await next.value
  }

  private func schedule(_ workspace: MobileWorkspace, token: Int) async {
    let owner = workspace.owner
    // Preserve a restored account's schedule until its identity has actually been checked.
    guard workspace.sessionChecked else { return }
    enabled = owner.map { defaults.bool(forKey: "sill.reminders.enabled." + $0) } ?? false
    let now = Date().timeIntervalSince1970 * 1000
    let plans = enabled ? Self.plans(workspace.cards, now: now) : []
    let accepted = await center.pendingNotificationRequests()
    let delivered = await center.deliveredNotifications()
    guard token == generation, workspace.owner == owner else { return }
    let selected = Array(plans.prefix(64))
    let desired = Set(selected.map { prefix + (owner ?? "") + ":" + $0.key })
    center.removePendingNotificationRequests(
      withIdentifiers: accepted.map(\.identifier).filter { $0.hasPrefix(prefix) && !desired.contains($0) })
    center.removeDeliveredNotifications(
      withIdentifiers: delivered.map { $0.request.identifier }
        .filter { $0.hasPrefix(prefix) && !desired.contains($0) })
    scheduled = 0
    remaining = max(0, plans.count - selected.count)
    guard enabled, let owner else {
      message = nil
      pendingOpen = nil
      return
    }
    let settings = await center.notificationSettings()
    guard token == generation, workspace.owner == owner else { return }
    guard [.authorized, .provisional, .ephemeral].contains(settings.authorizationStatus) else {
      message = Copy.text("reminders.deniedMac")
      return
    }
    let existing = Dictionary(uniqueKeysWithValues: accepted.map { ($0.identifier, $0) })
    do {
      for plan in selected {
        guard token == generation, workspace.owner == owner else { return }
        let id = prefix + owner + ":" + plan.key
        if existing[id]?.content.title != plan.title {
          let content = UNMutableNotificationContent()
          content.title = plan.title
          content.body = Copy.text("reminders.body")
          content.sound = .default
          content.userInfo = ["owner": owner, "card": plan.card]
          let trigger = UNTimeIntervalNotificationTrigger(
            timeInterval: max(1, (plan.at - Date().timeIntervalSince1970 * 1000) / 1000),
            repeats: false)
          try await center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
          guard token == generation, workspace.owner == owner else {
            center.removePendingNotificationRequests(withIdentifiers: [id])
            return
          }
        }
        scheduled += 1
      }
      message = nil
      deliverPending()
    } catch { message = Copy.text("reminders.failed") }
  }

  struct Plan: Equatable {
    let card: String
    let title: String
    let at: Double
    var key: String { card + ":" + String(format: "%.0f", at) }
  }

  /// Match Web and Mac lead times. Past reminders stay visible in the feed, without replaying alerts.
  static func plans(_ cards: [MobileCard], now: Double) -> [Plan] {
    cards.compactMap { card -> Plan? in
      guard let plan = plan(card), plan.at > now,
        !(card.type == "event" && (card.end ?? .infinity) <= now)
      else { return nil }
      return plan
    }.sorted { $0.at == $1.at ? $0.key < $1.key : $0.at < $1.at }
  }

  private static func plan(_ card: MobileCard) -> Plan? {
    guard !card.archived, !card.dismissed, !card.completed else { return nil }
    let snooze = card.item["snoozedUntil"]?.number ?? 0
    let at: Double
    switch card.type {
    case "event": at = snooze > 0 ? snooze : (card.start ?? .nan) - 15 * 60_000
    case "task": at = snooze > 0 ? snooze : (card.due ?? .nan) - 30 * 60_000
    case "reminder": at = snooze > 0 ? snooze : card.due ?? .nan
    default: return nil
    }
    guard at.isFinite, at > 0 else { return nil }
    return Plan(card: card.id, title: card.title, at: at)
  }

  private func deliverPending() {
    guard let pendingOpen, let workspace, let onOpen,
      workspace.owner == pendingOpen.owner, workspace.card(pendingOpen.card) != nil
    else { return }
    self.pendingOpen = nil
    onOpen(pendingOpen.card)
  }

  nonisolated func userNotificationCenter(
    _ center: UNUserNotificationCenter, willPresent notification: UNNotification
  ) async -> UNNotificationPresentationOptions {
    let owner = notification.request.content.userInfo["owner"] as? String
    let cardID = notification.request.content.userInfo["card"] as? String
    let identifier = notification.request.identifier
    return await MainActor.run {
      guard let owner, owner == self.workspace?.owner, self.enabled,
        let cardID, let card = self.workspace?.card(cardID),
        let plan = Self.plan(card), identifier == self.prefix + owner + ":" + plan.key,
        !(card.type == "event" && (card.end ?? .infinity) <= Date().timeIntervalSince1970 * 1000)
      else { return [] }
      return [.banner, .sound]
    }
  }

  nonisolated func userNotificationCenter(
    _ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse
  ) async {
    let owner = response.notification.request.content.userInfo["owner"] as? String
    let cardID = response.notification.request.content.userInfo["card"] as? String
    await MainActor.run {
      guard let owner, let cardID else { return }
      if owner == self.workspace?.owner || self.workspace?.sessionChecked != true {
        self.pendingOpen = (owner, cardID)
        self.deliverPending()
      }
    }
  }
}
#endif

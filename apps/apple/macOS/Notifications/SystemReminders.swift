import AppKit
import Observation
import SillKit
import SwiftUI
import UserNotifications

struct ScheduledReminder: Equatable {
  let id: String
  let owner: String
  let card: String
  let title: String
}

/// The system boundary is replaceable in tests; test runs never request OS permission or post alerts.
@MainActor protocol ReminderNotificationClient {
  func install(delegate: any UNUserNotificationCenterDelegate)
  func requestAuthorization() async throws -> Bool
  func authorized() async -> Bool
  func pending() async -> [ScheduledReminder]
  func delivered() async -> [ScheduledReminder]
  func removePending(_ ids: [String])
  func removeDelivered(_ ids: [String])
  func add(_ request: ScheduledReminder, after delay: Double) async throws
}

@MainActor private struct NativeReminderNotifications: ReminderNotificationClient {
  private var center: UNUserNotificationCenter { .current() }
  func install(delegate: any UNUserNotificationCenterDelegate) { center.delegate = delegate }
  func requestAuthorization() async throws -> Bool {
    try await center.requestAuthorization(options: [.alert, .sound])
  }
  func authorized() async -> Bool {
    let status = await center.notificationSettings().authorizationStatus
    return status == .authorized || status == .provisional
  }
  private func value(_ request: UNNotificationRequest) -> ScheduledReminder {
    ScheduledReminder(
      id: request.identifier,
      owner: request.content.userInfo["owner"] as? String ?? "",
      card: request.content.userInfo["card"] as? String ?? "", title: request.content.title)
  }
  func pending() async -> [ScheduledReminder] {
    await center.pendingNotificationRequests().map(value)
  }
  func delivered() async -> [ScheduledReminder] {
    await center.deliveredNotifications().map { value($0.request) }
  }
  func removePending(_ ids: [String]) {
    center.removePendingNotificationRequests(withIdentifiers: ids)
  }
  func removeDelivered(_ ids: [String]) {
    center.removeDeliveredNotifications(withIdentifiers: ids)
  }
  func add(_ request: ScheduledReminder, after delay: Double) async throws {
    let content = UNMutableNotificationContent()
    content.title = request.title
    content.body = Copy.text("reminders.body")
    content.sound = .default
    content.userInfo = ["owner": request.owner, "card": request.card]
    try await center.add(
      UNNotificationRequest(
        identifier: request.id, content: content,
        trigger: UNTimeIntervalNotificationTrigger(timeInterval: max(1, delay), repeats: false)))
  }
}

/// Notifications belong to this device and account. They never change a card's read state.
@MainActor @Observable final class SystemReminders: NSObject, UNUserNotificationCenterDelegate {
  static let shared = SystemReminders()
  private(set) var enabled = false
  private(set) var busy = false
  private(set) var message: String?
  private(set) var scheduledCount = 0
  private(set) var deferredCount = 0
  var needsBackgroundScheduling: Bool { enabled && deferredCount > 0 }
  @ObservationIgnored private weak var workspace: Workspace?
  @ObservationIgnored private var account: () -> String? = { nil }
  @ObservationIgnored private var openCard: (String) -> Void = { _ in }
  @ObservationIgnored private var work: Task<Void, Never>?
  @ObservationIgnored private var refill: Task<Void, Never>?
  @ObservationIgnored private var generation = 0
  @ObservationIgnored private var sessionVersion = 0
  @ObservationIgnored private var activeOwner: String?
  @ObservationIgnored private var permitsUnresolvedDelivery = true
  @ObservationIgnored private var lastPlans: [ReminderPlan]?
  @ObservationIgnored private var queuedPlans: [ReminderPlan]?
  @ObservationIgnored private var pendingOpen: (owner: String, card: String)?
  @ObservationIgnored private let client: any ReminderNotificationClient
  @ObservationIgnored private let defaults: UserDefaults
  @ObservationIgnored private let now: () -> Double
  @ObservationIgnored private var pendingLimit: Int
  @ObservationIgnored private let refillInterval: Duration?
  private(set) var scheduling = false
  static let prefix = "sill-reminder:"

  init(
    client: (any ReminderNotificationClient)? = nil, defaults: UserDefaults = .standard,
    now: @escaping () -> Double = { Format.milliseconds() }, pendingLimit: Int = 64,
    refillInterval: Duration? = .seconds(30)
  ) {
    self.client = client ?? NativeReminderNotifications()
    self.defaults = defaults
    self.now = now
    self.pendingLimit = max(1, pendingLimit)
    self.refillInterval = refillInterval
    super.init()
  }

  func install() { client.install(delegate: self) }

  func start(
    workspace: Workspace, account: @escaping () -> String?, open: @escaping (String) -> Void
  ) {
    self.workspace = workspace
    self.account = account
    openCard = open
    install()
    workspace.remindersChanged = { [weak self] in self?.update() }
    refill?.cancel()
    if let refillInterval {
      refill = Task { [weak self] in
        while !Task.isCancelled {
          do { try await Task.sleep(for: refillInterval) } catch { return }
          guard let self else { return }
          self.update(force: true)
        }
      }
    }
    update()
  }

  func setEnabled(_ value: Bool) async {
    guard let owner = account(), workspace?.backend != nil, !busy else { return }
    let session = sessionVersion
    busy = true
    defer { busy = false }
    message = nil
    do {
      if value {
        let granted = try await client.requestAuthorization()
        guard account() == owner, session == sessionVersion else { return }
        guard granted else {
          message = Copy.text("reminders.deniedMac")
          return
        }
      }
      defaults.set(value, forKey: "sill.reminders.enabled." + owner)
      update(force: true)
    } catch {
      if session == sessionVersion { message = Copy.text("reminders.failed") }
    }
  }

  func update(force: Bool = false) {
    guard let workspace else { return }
    // Missing backend during startup/refresh is not an explicit sign-out.
    let loading: Bool
    switch workspace.phase {
    case .connecting, .unavailable: loading = true
    default: loading = workspace.backend == nil && workspace.phase != .signedOut
    }
    if loading || workspace.preservesUnresolvedReminders {
      generation += 1
      sessionVersion += 1
      activeOwner = nil
      lastPlans = nil
      queuedPlans = nil
      enabled = false
      return
    }
    let owner = workspace.backend == nil ? nil : account()
    permitsUnresolvedDelivery = owner != nil
    let ownerChanged = owner != activeOwner
    if ownerChanged {
      sessionVersion += 1
      lastPlans = nil
    }
    enabled = owner.map { defaults.bool(forKey: "sill.reminders.enabled." + $0) } ?? false
    let plans = enabled ? ReminderPlan.make(workspace, now: now()) : []
    if let pendingOpen, owner == pendingOpen.owner, workspace.model(pendingOpen.card) != nil {
      self.pendingOpen = nil
      openCard(pendingOpen.card)
    }
    let unchanged = queuedPlans.map { $0 == plans } ?? (plans == lastPlans)
    guard force || ownerChanged || !unchanged else { return }
    activeOwner = owner
    queuedPlans = plans
    generation += 1
    let token = generation
    scheduling = true
    let previous = work
    work = Task { [weak self] in
      await previous?.value
      guard let self else { return }
      guard token == self.generation else {
        if self.queuedPlans == nil { self.scheduling = false }
        return
      }
      let success = await self.reconcile(plans, owner: owner, token: token)
      if token == self.generation {
        self.lastPlans = success ? plans : nil
        self.queuedPlans = nil
        self.scheduling = false
      } else if self.queuedPlans == nil {
        self.scheduling = false
      }
    }
  }

  func finishScheduling() async {
    while true {
      let token = generation
      await work?.value
      if token == generation {
        scheduling = false
        return
      }
    }
  }

  private func history(_ owner: String) -> Set<String> {
    Set(defaults.stringArray(forKey: "sill.reminders.scheduled." + owner) ?? [])
  }
  private func storeHistory(_ ids: Set<String>, owner: String) {
    defaults.set(Array(ids), forKey: "sill.reminders.scheduled." + owner)
  }
  private func cancel(_ requests: [ScheduledReminder]) {
    for (owner, values) in Dictionary(grouping: requests, by: \.owner) {
      storeHistory(history(owner).subtracting(values.map(\.id)), owner: owner)
    }
    client.removePending(requests.map(\.id))
  }

  private func reconcile(_ plans: [ReminderPlan], owner: String?, token: Int) async -> Bool {
    let scheduled = await client.pending()
    let delivered = await client.delivered()
    guard token == generation else { return false }
    let desired = Set(plans.map { Self.prefix + (owner ?? "") + ":" + $0.key })
    // Only pending requests have cancellation history removed. Already delivered keys remain deduplicated.
    cancel(scheduled.filter { $0.id.hasPrefix(Self.prefix) && !desired.contains($0.id) })
    client.removeDelivered(
      delivered.map(\.id).filter { $0.hasPrefix(Self.prefix) && !desired.contains($0) })
    scheduledCount = 0
    deferredCount = 0
    guard enabled, let owner else {
      message = nil
      return true
    }
    guard await client.authorized() else {
      if token == generation { message = Copy.text("reminders.deniedMac") }
      return false
    }
    guard token == generation else { return false }
    let existing = Dictionary(uniqueKeysWithValues: scheduled.map { ($0.id, $0) })
    let deliveredIDs = Set(delivered.map(\.id))
    var sent = history(owner).union(deliveredIDs.filter { $0.hasPrefix(Self.prefix + owner + ":") })
    storeHistory(sent, owner: owner)
    let candidates = plans.filter { plan in
      let id = Self.prefix + owner + ":" + plan.key
      return !deliveredIDs.contains(id)
        && !(existing[id] == nil && sent.contains(id) && plan.at <= now())
    }
    let selected = Array(candidates.prefix(pendingLimit))
    let selectedIDs = Set(selected.map { Self.prefix + owner + ":" + $0.key })
    cancel(scheduled.filter { desired.contains($0.id) && !selectedIDs.contains($0.id) })
    sent = history(owner)
    deferredCount = max(0, candidates.count - selected.count)
    for plan in selected {
      guard token == generation else { return false }
      let id = Self.prefix + owner + ":" + plan.key
      if existing[id]?.title == plan.title {
        scheduledCount += 1
        continue
      }
      do {
        try await client.add(
          ScheduledReminder(id: id, owner: owner, card: plan.card, title: plan.title),
          after: (plan.at - now()) / 1000)
        guard token == generation else {
          cancel([ScheduledReminder(id: id, owner: owner, card: plan.card, title: plan.title)])
          return false
        }
        sent.insert(id)
        storeHistory(sent, owner: owner)
        scheduledCount += 1
      } catch {
        if token == generation { message = Copy.text("reminders.failed") }
        return false
      }
    }
    let accepted = await client.pending()
    guard token == generation else { return false }
    let acceptedIDs = Set(accepted.map(\.id))
    let missing = selected.filter {
      $0.at > now() && !acceptedIDs.contains(Self.prefix + owner + ":" + $0.key)
    }.count
    if missing > 0 {
      scheduledCount = selected.count - missing
      deferredCount += missing
      if scheduledCount > 0 { pendingLimit = min(pendingLimit, scheduledCount) }
      message = Copy.text("reminders.failed")
      return false
    }
    message = nil
    return true
  }

  func presentationAllowed(_ notification: ScheduledReminder) -> Bool {
    guard notification.id.hasPrefix(Self.prefix), let workspace else { return false }
    if activeOwner == nil && permitsUnresolvedDelivery {
      // A notification may become due while the saved account is still being restored.
      return defaults.bool(forKey: "sill.reminders.enabled." + notification.owner)
    }
    guard notification.owner == activeOwner, enabled,
      let model = workspace.model(notification.card)
    else { return false }
    let state = workspace.state(notification.card)
    return !state.completed(model) && !state.dismissed && !state.archived
      && notification.id == Self.prefix + notification.owner + ":"
        + FeedPolicy.key(model, state: state)
  }

  nonisolated func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification
  ) async -> UNNotificationPresentationOptions {
    let owner = notification.request.content.userInfo["owner"] as? String
    let card = notification.request.content.userInfo["card"] as? String
    let identifier = notification.request.identifier
    let title = notification.request.content.title
    return await MainActor.run {
      guard let owner, let card,
        self.presentationAllowed(
          ScheduledReminder(
            id: identifier, owner: owner, card: card, title: title))
      else { return [] }
      return [.banner, .sound]
    }
  }

  nonisolated func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse
  ) async {
    let owner = response.notification.request.content.userInfo["owner"] as? String
    let id = response.notification.request.content.userInfo["card"] as? String
    await MainActor.run {
      guard let owner, let id else { return }
      guard owner == self.activeOwner, self.workspace?.model(id) != nil else {
        if self.activeOwner == nil { self.pendingOpen = (owner, id) }
        return
      }
      NSApplication.shared.activate(ignoringOtherApps: true)
      self.openCard(id)
    }
  }
}

struct ReminderPlan: Equatable {
  let card: String
  let key: String
  let title: String
  let at: Double

  @MainActor static func make(_ workspace: Workspace, now: Double) -> [ReminderPlan] {
    workspace.cards.compactMap { card in
      let state = workspace.state(card.id)
      let at = FeedPolicy.trigger(card, state: state)
      guard card.kind.remindable, at.isFinite, at > 0, !state.archived, !state.dismissed,
        !state.completed(card), !(card.kind == .event && (card.end ?? .infinity) <= now)
      else { return nil }
      return ReminderPlan(
        card: card.id, key: FeedPolicy.key(card, state: state), title: card.title, at: at)
    }.sorted { $0.at == $1.at ? $0.key < $1.key : $0.at < $1.at }
  }
}

struct SystemReminderSettingsView: View {
  @State private var reminders = SystemReminders.shared
  var body: some View {
    SettingsCard {
      SettingRow(
        label: Copy.text("reminders.title"), example: Copy.text("reminders.macHint"), first: true
      ) {
        SettingSwitch(label: Copy.text("reminders.title"), on: reminders.enabled) { value in
          Task { await reminders.setEnabled(value) }
        }.disabled(reminders.busy)
      }
      if let message = reminders.message {
        SettingLine { Text(message).foregroundStyle(AppleColors.secondary) }
      }
      if reminders.needsBackgroundScheduling {
        SettingLine {
          Text(
            Copy.text("reminders.capacityMac")
              .replacingOccurrences(of: "{scheduled}", with: String(reminders.scheduledCount))
              .replacingOccurrences(of: "{remaining}", with: String(reminders.deferredCount))
          )
          .foregroundStyle(AppleColors.secondary)
        }
      }
    }
    .padding(.top, AppleMetrics.space16)
  }
}

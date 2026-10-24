import Foundation
import Testing
import UserNotifications

@testable import Sill
@testable import SillKit

@MainActor struct SystemReminderTests {
  @Test func schedulingUsesSnoozeAndExcludesCompletedArchivedAndEndedCards() async throws {
    let now = 2_000_000.0
    let workspace = Workspace(autoload: false)
    let cards: [JSONValue] = [
      .object([
        "id": .string("reminder"), "type": .string("reminder"), "title": .string("Reminder"),
        "due": .number(now + 10_000),
      ]),
      .object([
        "id": .string("done"), "type": .string("task"), "title": .string("Done"),
        "due": .number(now),
        "tasks": .array([.object(["id": .string("step"), "text": .string("Step")])]),
      ]),
      .object([
        "id": .string("event"), "type": .string("event"), "title": .string("Ended"),
        "start": .number(100), "end": .number(200),
      ]),
      .object([
        "id": .string("archived"), "type": .string("reminder"), "title": .string("Archived"),
        "due": .number(now),
      ]),
    ]
    let snapshot = try Snapshot(
      json: .object([
        "revision": .number(1),
        "state": .object([
          "cards": .array(cards),
          "items": .object([
            "reminder": .object(["snoozedUntil": .number(now + 600_000)]),
            "done": .object(["taskDone": .array([.string("step")])]),
            "archived": .object(["archived": .bool(true)]),
          ]), "preferences": .object([:]), "seconds": .number(0),
        ]),
      ]))
    await withCheckedContinuation { continuation in
      workspace.accept(snapshot) { continuation.resume() }
    }
    let plans = ReminderPlan.make(workspace, now: now)
    #expect(plans.count == 1)
    #expect(plans.first?.card == "reminder")
    #expect(plans.first?.at == now + 600_000)
    workspace.state("reminder").apply(["dismissed": .bool(true)])
    #expect(ReminderPlan.make(workspace, now: now).isEmpty)
  }
}

@MainActor private final class ReminderClientStub: ReminderNotificationClient {
  var requests: [String: ScheduledReminder] = [:]
  var deliveredValues: [ScheduledReminder] = []
  var attempts = 0
  var failAt: Int?
  var allowed = true
  var maximumPending: Int?
  func install(delegate: any UNUserNotificationCenterDelegate) {}
  func requestAuthorization() async throws -> Bool { allowed }
  func authorized() async -> Bool { allowed }
  func pending() async -> [ScheduledReminder] { Array(requests.values) }
  func delivered() async -> [ScheduledReminder] { deliveredValues }
  func removePending(_ ids: [String]) { for id in ids { requests[id] = nil } }
  func removeDelivered(_ ids: [String]) { deliveredValues.removeAll { ids.contains($0.id) } }
  func add(_ request: ScheduledReminder, after delay: Double) async throws {
    attempts += 1
    if attempts == failAt { throw StoreError.invalidSnapshot }
    requests[request.id] = request
    if let maximumPending, requests.count > maximumPending,
      let oldest = requests.keys.sorted().first
    {
      requests[oldest] = nil
    }
  }
  func deliver(_ id: String) {
    if let request = requests.removeValue(forKey: id) { deliveredValues.append(request) }
  }
}

private actor ReminderBackendStub: WorkspaceBackend {
  nonisolated let isLocal = false
  let snapshot: Snapshot
  private var write: CheckedContinuation<Snapshot, any Error>?
  var waiting: Bool { write != nil }
  init(_ snapshot: Snapshot) { self.snapshot = snapshot }
  func read() async throws -> Snapshot { snapshot }
  func apply(_ operations: [WorkspaceOperation], expectedRevision: Int) async throws -> Snapshot {
    try await withCheckedThrowingContinuation { write = $0 }
  }
  func reject() {
    write?.resume(throwing: StoreError.invalidSnapshot)
    write = nil
  }
}

@MainActor private func reminderSnapshot(_ values: [(String, Double)]) throws -> Snapshot {
  try Snapshot(
    json: .object([
      "revision": .number(1),
      "state": .object([
        "cards": .array(
          values.map { id, at in
            .object([
              "id": .string(id), "type": .string("reminder"), "title": .string(id),
              "due": .number(at),
            ])
          }), "items": .object([:]), "preferences": .object([:]), "seconds": .number(0),
      ]),
    ]))
}

@MainActor private func loadReminderWorkspace(_ snapshot: Snapshot, into workspace: Workspace) async
  -> ReminderBackendStub
{
  let backend = ReminderBackendStub(snapshot)
  workspace.connect(backend, initial: snapshot)
  for _ in 0..<200 where workspace.phase != .ready { try? await Task.sleep(for: .milliseconds(5)) }
  return backend
}

@MainActor private func reminderDefaults() -> (UserDefaults, String) {
  let name = "sill-test-reminders-" + UUID().uuidString
  let defaults = UserDefaults(suiteName: name)!
  defaults.set(true, forKey: "sill.reminders.enabled.a")
  return (defaults, name)
}

@MainActor extension SystemReminderTests {
  @Test func startupPreservesPendingUntilExplicitSignout() async throws {
    let (defaults, suite) = reminderDefaults()
    defer { defaults.removePersistentDomain(forName: suite) }
    let client = ReminderClientStub()
    let request = ScheduledReminder(
      id: "sill-reminder:a:future:5000", owner: "a", card: "future", title: "future")
    client.requests[request.id] = request
    defaults.set([request.id], forKey: "sill.reminders.scheduled.a")
    let workspace = Workspace(autoload: false)
    let reminders = SystemReminders(
      client: client, defaults: defaults, now: { 1000 }, refillInterval: nil)
    var owner: String?
    reminders.start(workspace: workspace, account: { owner }, open: { _ in })
    await reminders.finishScheduling()
    #expect(client.requests[request.id] != nil)
    #expect(reminders.presentationAllowed(request))
    owner = "a"
    _ = await loadReminderWorkspace(try reminderSnapshot([("future", 5000)]), into: workspace)
    await reminders.finishScheduling()
    #expect(client.requests[request.id] != nil)
    #expect(client.attempts == 0)
    workspace.signOutLocally(preservingReminders: true)
    await reminders.finishScheduling()
    #expect(client.requests[request.id] != nil)
    workspace.signOutLocally()
    await reminders.finishScheduling()
    #expect(client.requests.isEmpty)
    #expect(!reminders.presentationAllowed(request))
    workspace.beginConnection()
    #expect(!reminders.presentationAllowed(request))
    #expect(defaults.stringArray(forKey: "sill.reminders.scheduled.a") == [])
  }

  @Test func deliveredOld64DoNotBlockFutureAndCapacityRefills() async throws {
    let (defaults, suite) = reminderDefaults()
    defer { defaults.removePersistentDomain(forName: suite) }
    let client = ReminderClientStub()
    let old = (0..<64).map { ("old-\($0)", 1000.0) }
    client.deliveredValues = old.map { id, _ in
      ScheduledReminder(id: "sill-reminder:a:\(id):1000", owner: "a", card: id, title: id)
    }
    let workspace = Workspace(autoload: false)
    _ = await loadReminderWorkspace(
      try reminderSnapshot(old + [("next", 5000), ("later", 6000)]), into: workspace)
    var now = 2000.0
    let reminders = SystemReminders(
      client: client, defaults: defaults, now: { now }, pendingLimit: 1, refillInterval: nil)
    reminders.start(workspace: workspace, account: { "a" }, open: { _ in })
    await reminders.finishScheduling()
    #expect(client.requests.keys.sorted() == ["sill-reminder:a:next:5000"])
    #expect(reminders.deferredCount == 1)
    #expect(reminders.needsBackgroundScheduling)
    now = 5001
    client.deliver("sill-reminder:a:next:5000")
    reminders.update(force: true)
    await reminders.finishScheduling()
    #expect(client.requests.keys.sorted() == ["sill-reminder:a:later:6000"])
    #expect(reminders.deferredCount == 0)
  }

  @Test func partialAddFailureRetriesIdenticalPlans() async throws {
    let (defaults, suite) = reminderDefaults()
    defer { defaults.removePersistentDomain(forName: suite) }
    let client = ReminderClientStub()
    client.failAt = 2
    let workspace = Workspace(autoload: false)
    _ = await loadReminderWorkspace(
      try reminderSnapshot([("one", 5000), ("two", 6000), ("three", 7000)]), into: workspace)
    let reminders = SystemReminders(
      client: client, defaults: defaults, now: { 1000 }, refillInterval: nil)
    reminders.start(workspace: workspace, account: { "a" }, open: { _ in })
    await reminders.finishScheduling()
    #expect(client.requests.count == 1)
    #expect(reminders.message != nil)
    reminders.update()
    await reminders.finishScheduling()
    #expect(client.requests.count == 3)
    #expect(client.attempts == 4)
    #expect(reminders.message == nil)
  }

  @Test func optimisticCompletionCancelsAndFailedWriteRequeuesAfterDue() async throws {
    let (defaults, suite) = reminderDefaults()
    defer { defaults.removePersistentDomain(forName: suite) }
    let client = ReminderClientStub()
    let workspace = Workspace(autoload: false)
    let backend = await loadReminderWorkspace(
      try reminderSnapshot([("one", 5000)]), into: workspace)
    var now = 1000.0
    let reminders = SystemReminders(
      client: client, defaults: defaults, now: { now }, refillInterval: nil)
    reminders.start(workspace: workspace, account: { "a" }, open: { _ in })
    await reminders.finishScheduling()
    #expect(client.requests.count == 1)
    #expect(workspace.changeReminder("one", .complete) != nil)
    await reminders.finishScheduling()
    #expect(client.requests.isEmpty)
    #expect(defaults.stringArray(forKey: "sill.reminders.scheduled.a") == [])
    for _ in 0..<200 {
      if await backend.waiting { break }
      try? await Task.sleep(for: .milliseconds(5))
    }
    now = 6000
    await backend.reject()
    for _ in 0..<200 where !workspace.queue.idle { try? await Task.sleep(for: .milliseconds(5)) }
    await reminders.finishScheduling()
    #expect(!workspace.state("one").reminderDone)
    #expect(client.requests.keys.sorted() == ["sill-reminder:a:one:5000"])
  }

  @Test func grantingPermissionAndEnablingAgainRetriesUnchangedPlans() async throws {
    let (defaults, suite) = reminderDefaults()
    defer { defaults.removePersistentDomain(forName: suite) }
    let client = ReminderClientStub()
    client.allowed = false
    let workspace = Workspace(autoload: false)
    _ = await loadReminderWorkspace(try reminderSnapshot([("one", 5000)]), into: workspace)
    let reminders = SystemReminders(
      client: client, defaults: defaults, now: { 1000 }, refillInterval: nil)
    reminders.start(workspace: workspace, account: { "a" }, open: { _ in })
    await reminders.finishScheduling()
    #expect(reminders.message != nil)
    client.allowed = true
    await reminders.setEnabled(true)
    await reminders.finishScheduling()
    #expect(client.requests.count == 1)
    #expect(reminders.message == nil)
  }
}

@MainActor extension SystemReminderTests {
  @Test func rapidRollbackSupersedesQueuedCancellationEvenWhenPlansMatchLastSuccess() async throws {
    let (defaults, suite) = reminderDefaults()
    defer { defaults.removePersistentDomain(forName: suite) }
    let client = ReminderClientStub()
    let workspace = Workspace(autoload: false)
    _ = await loadReminderWorkspace(try reminderSnapshot([("one", 5000)]), into: workspace)
    let reminders = SystemReminders(
      client: client, defaults: defaults, now: { 1000 }, refillInterval: nil)
    reminders.start(workspace: workspace, account: { "a" }, open: { _ in })
    await reminders.finishScheduling()
    workspace.state("one").apply(["reminderDone": .bool(true)])
    reminders.update()
    workspace.state("one").revert()
    reminders.update()
    await reminders.finishScheduling()
    #expect(client.requests.keys.sorted() == ["sill-reminder:a:one:5000"])
    #expect(client.attempts == 1)
  }

  @Test func systemCapacityIsVisibleAndNextPassKeepsNearestRequests() async throws {
    let (defaults, suite) = reminderDefaults()
    defer { defaults.removePersistentDomain(forName: suite) }
    let client = ReminderClientStub()
    client.maximumPending = 2
    let workspace = Workspace(autoload: false)
    _ = await loadReminderWorkspace(
      try reminderSnapshot([("a", 5000), ("b", 6000), ("c", 7000)]), into: workspace)
    let reminders = SystemReminders(
      client: client, defaults: defaults, now: { 1000 }, refillInterval: nil)
    reminders.start(workspace: workspace, account: { "a" }, open: { _ in })
    await reminders.finishScheduling()
    #expect(reminders.scheduledCount == 2)
    #expect(reminders.deferredCount == 1)
    #expect(reminders.message != nil)
    reminders.update()
    await reminders.finishScheduling()
    #expect(client.requests.keys.sorted() == ["sill-reminder:a:a:5000", "sill-reminder:a:b:6000"])
    #expect(reminders.needsBackgroundScheduling)
    #expect(reminders.message == nil)
  }
}

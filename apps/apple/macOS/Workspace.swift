import Combine
import Foundation
import SillKit
import SwiftUI

@MainActor final class Workspace: ObservableObject {
  @Published var cards: [Card] = []
  @Published var items: [String: JSONValue] = [:]
  @Published var preferences: [String: JSONValue] = [:]
  @Published var page = "home"
  @Published var feedScope: FeedScope = .all
  @Published var aiFocusRequest = 0
  var scrollOffsets: [String: CGFloat] = [:]
  @Published var selection: Set<String> = []
  @Published var aiCards: [String] = []
  @Published var aiDraft = ""
  @Published var typeFilter = "all"
  @Published var tagFilter = ""
  @Published var settingsPresented = false
  @Published var query = ""
  var filter: String {
    get { feedScope.label }
    set { feedScope = FeedScope.allCases.first { $0.label == newValue } ?? .all }
  }
  var searchPresented: Bool {
    get { !query.isEmpty || feedScope != .all || typeFilter != "all" || !tagFilter.isEmpty }
    set { if newValue { searchFocusRequest += 1 } else { clearSearch() } }
  }
  var preferredAppearance: ColorScheme? {
    switch preferences["theme"]?.string {
    case "dark": .dark
    case "light": .light
    default: nil
    }
  }
  var readerPresented: Bool {
    get { selected != nil }
    set { if !newValue { selected = nil } }
  }
  func clearSearch() {
    query = ""
    feedScope = .all
    typeFilter = "all"
    tagFilter = ""
  }
  @Published var searchFocusRequest = 0
  @Published var selected: String? {
    didSet {
      guard selected != oldValue else { return }
      if selected == nil {
        readerTrail.removeAll()
      } else if !returningToReader, let oldValue {
        readerTrail.append(oldValue)
      }
    }
  }
  private(set) var readerTrail: [String] = []
  private var returningToReader = false

  func dismissReader() {
    returningToReader = true
    defer { returningToReader = false }
    while let previous = readerTrail.popLast() {
      if cards.contains(where: { $0.id == previous }) {
        selected = previous
        return
      }
    }
    selected = nil
  }
  @Published var draft: Draft?
  @Published var error: String?
  @Published var ready = false
  @Published var owner: String?
  @Published var connecting = true
  @Published var capturePresented = false
  @Published var needsPasswordSetup = false
  @Published var loginMessage: String?
  private let cloud = CloudWorkspace()
  private let localMode = ProcessInfo.processInfo.arguments.contains("--data-directory")
  private var accountGeneration = 0
  private var cloudSnapshot: JSONValue?
  private var pendingReading = 0
  @Published var busy = false
  @Published var loading = false
  private var refreshTask: Task<Void, Never>?
  private var store: CardStore?
  private var session: WorkspaceSession?
  private(set) var revision = 0
  @Published var seconds = 0.0

  init(autoload: Bool = true) {
    if autoload { refresh() } else { connecting = false }
  }

  func tags(_ card: Card) -> [String] {
    let item = items[card.id]
    return item?["tagsEdited"]?.bool == true
      ? item?["tags"]?.strings ?? [] : card.fields["tags"]?.strings ?? []
  }

  func taskDone(_ card: Card, _ task: JSONValue) -> Bool {
    if let ids = items[card.id]?["taskDone"]?.strings {
      return ids.contains(task["id"]?.string ?? "")
    }
    return task["done"]?.bool ?? false
  }

  func toggleTask(_ card: Card, _ task: JSONValue) {
    let id = task["id"]?.string ?? ""
    var done = (card.fields["tasks"]?.array ?? []).filter { taskDone(card, $0) }.compactMap {
      $0["id"]?.string
    }
    if done.contains(id) { done.removeAll { $0 == id } } else { done.append(id) }
    patch([card.id], values: ["taskDone": .array(done.map(JSONValue.string))])
  }

  func patch(_ ids: [String], values: [String: JSONValue], expectedRevision: Int? = nil) {
    guard !busy, ready else { return }
    if !localMode {
      applyCloud(
        ids.map {
          .object(["op": .string("item.patch"), "id": .string($0), "values": .object(values)])
        }, expectedRevision: expectedRevision ?? revision)
      return
    }
    guard let store else { return }
    let expected = expectedRevision ?? revision
    busy = true
    Task {
      defer { busy = false }
      do {
        accept(
          try await store.patchItems(
            Dictionary(uniqueKeysWithValues: Set(ids).map { ($0, .object(values)) }),
            expectedRevision: expected))
        error = nil
      } catch { report(error) }
    }
  }

  func batchPatch(_ patches: [String: JSONValue], expectedRevision: Int) {
    guard !busy, ready else { return }
    if !localMode {
      applyCloud(
        patches.map {
          .object(["op": .string("item.patch"), "id": .string($0.key), "values": $0.value])
        }, expectedRevision: expectedRevision)
      return
    }
    guard let store else { return }
    busy = true
    Task {
      defer { busy = false }
      do {
        accept(try await store.patchItems(patches, expectedRevision: expectedRevision))
        error = nil
      } catch { report(error) }
    }
  }

  func setPreference(_ key: String, _ value: JSONValue) {
    guard !busy, ready else { return }
    if !localMode {
      applyCloud(
        [.object(["op": .string("preferences.patch"), "values": .object([key: value])])],
        expectedRevision: revision)
      return
    }
    guard let store else { return }
    let expected = revision
    busy = true
    Task {
      defer { busy = false }
      do {
        accept(try await store.patchPreferences(.object([key: value]), expectedRevision: expected))
        error = nil
      } catch { report(error) }
    }
  }

  func discussSelection() {
    appendAIContext(cards.filter { selection.contains($0.id) }.map(\.id))
    selection.removeAll()
  }

  func appendAIContext(_ ids: [String]) {
    for id in ids where cards.contains(where: { $0.id == id }) && !aiCards.contains(id) {
      aiCards.append(id)
    }
    aiFocusRequest += 1
  }

  private func localStore() throws -> CardStore {
    if let store { return store }
    let arguments = ProcessInfo.processInfo.arguments
    let directory: URL
    if let index = arguments.firstIndex(of: "--data-directory"),
      arguments.indices.contains(index + 1), arguments[index + 1].hasPrefix("/")
    {
      directory = URL(fileURLWithPath: arguments[index + 1], isDirectory: true).standardizedFileURL
    } else {
      directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[
        0
      ]
      .appendingPathComponent("Sill", isDirectory: true)
    }
    let created = try WorkspaceSession(directory: directory)
    session = created
    store = created.store
    return created.store
  }

  private func accept(_ snapshot: Snapshot) {
    guard snapshot.revision >= revision else { return }
    revision = snapshot.revision
    let incomingSeconds = snapshot.json["state"]?["seconds"]?.number ?? 0
    if seconds != incomingSeconds { seconds = incomingSeconds }
    if cards.count != snapshot.cards.count
      || !zip(cards, snapshot.cards).allSatisfy({ (try? $0.0.raw) == (try? $0.1.raw) })
    {
      cards = snapshot.cards
    }
    if items != snapshot.items { items = snapshot.items }
    let incomingPreferences = snapshot.json["state"]?["preferences"]?.object ?? [:]
    if preferences != incomingPreferences { preferences = incomingPreferences }
    selection.formIntersection(Set(cards.map(\.id)))
    if let selected, !cards.contains(where: { $0.id == selected }) { self.selected = nil }
  }

  func refresh() {
    if !localMode {
      refreshCloud()
      return
    }
    connecting = false
    guard refreshTask == nil else { return }
    refreshTask = Task {
      loading = true
      defer {
        loading = false
        refreshTask = nil
      }
      do {
        let store = try localStore()
        accept(try await store.read())
        ready = true
        error = nil
        if draft == nil, let saved = try store.drafts.restore() {
          draft = saved
          error = Copy.appleDraftRestored
        }
      } catch StoreError.workspaceInUse { self.error = Copy.appleWorkspaceInUse } catch {
        self.error = Copy.appleReadError
      }
    }
  }

  func toggle(_ key: String, card: Card) {
    var values: [String: JSONValue] = [key: .bool(items[card.id]?[key]?.bool != true)]
    if key == "read" {
      values["readAt"] = .number(
        items[card.id]?[key]?.bool == true ? 0 : Date.now.timeIntervalSince1970 * 1000)
    }
    patch([card.id], values: values)
  }

  func edit(_ card: Card? = nil) {
    guard ready, card == nil else { return }
    capturePresented = true
  }

  private func legacyDraft(_ card: Card? = nil) {
    guard draft == nil, ready, card == nil else { return }
    draft = Draft(
      id: card?.id ?? UUID().uuidString, title: card?.title ?? "",
      body: card?.body ?? "", revision: revision,
      original: card.flatMap { try? JSONEncoder().encode($0) })
  }

  func scheduleDraftPersistence() {
    guard let draft, let store else { return }
    store.drafts.enqueue(draft) { [weak self] in
      Task { @MainActor in self?.error = Copy.appleDraftError }
    }
  }

  func persistDraft() {
    guard let draft, let store else { return }
    do { try store.drafts.persist(draft) } catch { self.error = Copy.appleDraftError }
  }

  func discardDraft() {
    guard let store else { return }
    do {
      try store.drafts.discard()
      draft = nil
    } catch { self.error = Copy.appleDraftError }
  }

  var draftIsDirty: Bool { draft?.isDirty ?? false }

  func saveDraft() async {
    guard !busy, let draft, let store,
      !draft.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    else { return }
    busy = true
    defer { busy = false }
    do {
      let snapshot = try await store.save(draft)
      accept(snapshot)
      self.draft = nil
      error = nil
    } catch { report(error) }
  }

  func delete(_ card: Card) {
    guard !busy, ready else { return }
    if !localMode {
      applyCloud(
        [.object(["op": .string("card.delete"), "id": .string(card.id), "before": card.fields])],
        expectedRevision: revision)
      return
    }
    guard let store else { return }
    let expected = revision
    Task {
      do {
        accept(try await store.delete(id: card.id, expectedRevision: expected))
        error = nil
      } catch { report(error) }
    }
  }

  private func report(_ failure: any Error) {
    switch failure {
    case CloudWorkspaceError.unauthenticated:
      disconnect()
      error = Copy.text("login.unauthenticated")
    case CloudWorkspaceError.unknownWrite: error = Copy.appleUnknownWrite
    case CloudWorkspaceError.service(let code, let status):
      if status == 409 {
        error = Copy.appleConflict
      } else if status == 403 {
        error = Copy.text("login.forbidden")
      } else if status == 429 {
        error = Copy.text("login.rateLimited")
      } else {
        error = Copy.text(
          code == "invalid_request" ? "web.agent.invalidRequest" : "login.unavailable")
      }
    case CloudWorkspaceError.sessionStorage: error = Copy.appleSessionError
    case StoreError.conflict: error = Copy.appleConflict
    case StoreError.unknownWrite: error = Copy.appleUnknownWrite
    case is CardValidationError: error = Copy.appleInvalidCard
    default: error = Copy.appleWriteError
    }
  }
  private func acceptCloud(_ state: CloudWorkspaceState, generation: Int) throws {
    guard generation == accountGeneration else { return }
    if let owner, owner != state.owner { throw CloudWorkspaceError.unauthenticated }
    owner = state.owner
    needsPasswordSetup = state.needsPasswordSetup
    cloudSnapshot = state.json
    accept(try Snapshot(json: state.json))
    ready = true
  }

  private func refreshCloud() {
    guard refreshTask == nil, !busy else { return }
    let generation = accountGeneration
    refreshTask = Task {
      loading = true
      defer {
        loading = false
        connecting = false
        refreshTask = nil
      }
      do {
        if owner != nil {
          try acceptCloud(try await cloud.read(), generation: generation)
        } else if let state = try await cloud.restoreSession() {
          try acceptCloud(state, generation: generation)
        }
        error = await cloud.pendingWriteKey == nil ? nil : Copy.appleUnknownWrite
      } catch { if generation == accountGeneration { report(error) } }
    }
  }

  func login(email: String, password: String) {
    guard !busy else { return }
    accountGeneration += 1
    let generation = accountGeneration
    busy = true
    error = nil
    Task {
      defer {
        busy = false
        connecting = false
      }
      do {
        try acceptCloud(
          try await cloud.login(email: email, password: password), generation: generation)
      } catch { if generation == accountGeneration { report(error) } }
    }
  }

  func requestLoginLink(email: String, setupPassword: Bool = false) {
    guard !busy else { return }
    busy = true
    error = nil
    Task {
      defer { busy = false }
      do {
        let result = try await cloud.requestLoginLink(email: email, setupPassword: setupPassword)
        loginMessage = result["message"]?.string ?? Copy.text("server.http.f868232da331")
      } catch { report(error) }
    }
  }

  func completeLogin(_ url: URL) {
    guard !busy else { return }
    let generation = accountGeneration
    busy = true
    connecting = true
    Task {
      defer {
        busy = false
        connecting = false
      }
      do {
        try acceptCloud(try await cloud.completeLogin(url: url), generation: generation)
        error = nil
      } catch { report(error) }
    }
  }

  func setPassword(_ password: String) {
    guard !busy, needsPasswordSetup else { return }
    let generation = accountGeneration
    busy = true
    Task {
      defer { busy = false }
      do {
        try acceptCloud(try await cloud.setPassword(password: password), generation: generation)
        error = nil
      } catch { report(error) }
    }
  }

  private func disconnect() {
    accountGeneration += 1
    cards = []
    items = [:]
    preferences = [:]
    selection = []
    aiCards = []
    aiDraft = ""
    selected = nil
    owner = nil
    ready = false
    revision = 0
    cloudSnapshot = nil
    query = ""
    filter = Copy.appleAll
    page = "home"
    settingsPresented = false
    scrollOffsets = [:]
    capturePresented = false
    pendingReading = 0
    seconds = 0
    typeFilter = "all"
    tagFilter = ""
    needsPasswordSetup = false
    loginMessage = nil
  }

  func logout() {
    guard !busy else { return }
    busy = true
    Task {
      defer { busy = false }
      do {
        try await cloud.logout()
        disconnect()
        error = nil
      } catch CloudWorkspaceError.unknownWrite { report(CloudWorkspaceError.unknownWrite) } catch {
        disconnect()
        report(error)
      }
    }
  }

  private func applyCloud(
    _ operations: [JSONValue], expectedRevision: Int, after: (() -> Void)? = nil
  ) {
    guard !busy, owner != nil else { return }
    let generation = accountGeneration
    busy = true
    Task {
      defer { busy = false }
      do {
        let result = try await cloud.apply(
          operations: operations, expectedRevision: .number(Double(expectedRevision)))
        guard generation == accountGeneration else { return }
        try acceptCloud(result, generation: generation)
        error = nil
        after?()
      } catch { if generation == accountGeneration { report(error) } }
    }
  }

  func capture(_ text: String) {
    guard !busy, ready else { return }
    let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !value.isEmpty, value.utf16.count <= 4000 else { return }
    let first = value.components(separatedBy: .whitespacesAndNewlines).first ?? ""
    let url = URL(string: first).flatMap {
      ["https", "http"].contains($0.scheme ?? "") && $0.host != nil ? $0 : nil
    }
    let rest = String(value.dropFirst(first.count)).trimmingCharacters(in: .whitespacesAndNewlines)
    let title =
      url.map { rest.isEmpty ? ($0.host ?? "") + $0.path : rest }
      ?? String(value.components(separatedBy: .newlines).first!.prefix(60))
    var json: JSONValue = .object([
      "id": .string(UUID().uuidString), "type": .string(url == nil ? "note" : "article"),
      "title": .string(String(title.prefix(200))),
      "summary": .string(url == nil ? String(value.prefix(300)) : ""),
      "sources": .array([
        .object([
          "name": .string(url?.host ?? Copy.text("web.cards.e727b8cc2df0")),
          "kind": .string(url == nil ? "capture" : "web"),
        ])
      ]),
      "tags": .array([]),
      "body": .array(
        (url == nil ? value.components(separatedBy: "\n\n") : rest.isEmpty ? [] : [rest]).map(
          JSONValue.string)),
      "time": .number(Date.now.timeIntervalSince1970 * 1000),
    ])
    if let url { json["url"] = .string(url.absoluteString) }
    if cards.contains(where: { card in
      url != nil
        ? card.value.url == url?.absoluteString
        : card.title == title && card.fields["body"] == json["body"]
    }) {
      error = Copy.text("web.app.17ebeb500554")
      return
    }
    do {
      let card = try Card(json: json)
      if !localMode {
        applyCloud(
          [.object(["op": .string("card.upsert"), "card": card.fields, "before": .null])],
          expectedRevision: revision
        ) { [weak self] in
          self?.capturePresented = false
          self?.settingsPresented = false
        }
      } else if let store {
        let expected = revision
        busy = true
        Task {
          defer { busy = false }
          do {
            accept(try await store.upsert(card, expectedRevision: expected))
            capturePresented = false
            settingsPresented = false
            error = nil
          } catch { report(error) }
        }
      }
    } catch { report(error) }
  }

  func exportWorkspace() {
    let panel = NSSavePanel()
    panel.nameFieldStringValue = "sill-workspace.json"
    guard panel.runModal() == .OK, let url = panel.url else { return }
    do {
      let state: JSONValue = .object([
        "cards": .array(try cards.map { try $0.raw }), "items": .object(items),
        "preferences": .object(preferences), "seconds": .number(seconds),
      ])
      try state.encoded().write(to: url, options: .atomic)
    } catch { self.error = Copy.appleExportError }
  }

  func clearAll() {
    guard !cards.isEmpty else { return }
    if !localMode {
      applyCloud(
        cards.map {
          .object(["op": .string("card.delete"), "id": .string($0.id), "before": $0.fields])
        }, expectedRevision: revision)
    } else if let store, !busy {
      let expected = revision
      let ids = Set(cards.map(\.id))
      busy = true
      Task {
        defer { busy = false }
        do {
          accept(try await store.deleteMany(ids: ids, expectedRevision: expected))
          error = nil
        } catch { report(error) }
      }
    }
  }

  func recordReadingSecond() {
    guard ready else { return }
    pendingReading += 1
    if pendingReading >= 5 { flushReading() }
  }

  func flushReading() {
    guard pendingReading > 0, !busy, ready else { return }
    let amount = min(86400, pendingReading)
    pendingReading -= amount
    if !localMode {
      applyCloud(
        [.object(["op": .string("reading.add"), "seconds": .number(Double(amount))])],
        expectedRevision: revision)
    } else if let store {
      let expected = revision
      busy = true
      Task {
        defer { busy = false }
        do {
          accept(try await store.addReading(seconds: amount, expectedRevision: expected))
          error = nil
        } catch { report(error) }
      }
    }
  }

}

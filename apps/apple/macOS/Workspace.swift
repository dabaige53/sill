import Foundation
import SillKit
import SwiftUI

@MainActor final class Workspace: ObservableObject {
  @Published var cards: [Card] = []
  @Published var items: [String: JSONValue] = [:]
  @Published var query = ""
  @Published var filter = Copy.appleAll
  @Published var searchPresented = false
  @Published var searchFocusRequest = 0
  @Published var selected: String?
  @Published var draft: Draft?
  @Published var error: String?
  @Published var ready = false
  @Published var busy = false
  @Published var loading = false
  private var refreshTask: Task<Void, Never>?
  private var store: CardStore?
  private var session: WorkspaceSession?
  private var revision = 0

  init() { refresh() }

  var visible: [Card] {
    cards.filter { card in
      let item = items[card.id]
      let matches =
        query.isEmpty
        || [card.title, card.body, card.summary, card.source]
          .joined(separator: " ").localizedCaseInsensitiveContains(query)
      return matches
        && (!query.isEmpty || item?["archived"]?.bool != true)
        && (filter == Copy.appleAll
          || filter == Copy.appleBookmarks && item?["bookmarked"]?.bool == true
          || filter == Copy.appleLater && item?["later"]?.bool == true)
    }
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
    cards = snapshot.cards
    items = snapshot.items
    if let selected, !cards.contains(where: { $0.id == selected }) { self.selected = nil }
  }

  func refresh() {
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
    guard let store else { return }
    let expected = revision
    Task {
      do {
        accept(try await store.toggle(id: card.id, key: key, expectedRevision: expected))
        error = nil
      } catch { report(error) }
    }
  }

  func edit(_ card: Card? = nil) {
    guard draft == nil, ready else { return }
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
    case StoreError.conflict: error = Copy.appleConflict
    case StoreError.unknownWrite: error = Copy.appleUnknownWrite
    case is CardValidationError: error = Copy.appleInvalidCard
    default: error = Copy.appleWriteError
    }
  }
}

import SillKit
import SwiftUI

// @design ai-conversation
/// The desktop AI box: bottom center, 28 from the bottom, 640×60 glass. With a session it grows
/// into the panel and the full view (ADR 0064). The built-in AI is not connected, so add, voice
/// and send stay disabled; nothing is sent and no reply is invented. Input and context cards live
/// only in this window's session.
@MainActor @Observable final class AIContext {
  var draft = ""
  var minimized = false
  var horizontalOffset: CGFloat = 0
  private(set) var cards: [String] = []
  private(set) var deferred: Set<String> = []
  /// Bumped to put focus in the input.
  private(set) var focusRequest = 0
  /// Bumped when a click lands outside the box; the input gives up focus.
  private(set) var blurRequest = 0
  /// Input focus keeps the bottom toolbar visible while typing.
  var focused = false
  /// The built-in AI is not connected: no sessions arrive and nothing is sent.
  let connected = false
  private(set) var sessions: [AISession] = []
  private(set) var sessionId: String?
  private(set) var height: AIHeight = .line
  private(set) var listOpen = false

  var session: AISession? { sessions.first { $0.id == sessionId } ?? sessions.first }

  func requestFocus() {
    minimized = false
    focusRequest += 1
  }
  func blur() { blurRequest += 1 }

  func add(_ ids: [String], handoff: Bool = false) {
    minimized = false
    for id in ids where !cards.contains(id) {
      if handoff && !Motion.keyboardDriven {
        deferred.insert(id)
        cards.append(id)
        Task { [weak self] in
          do { try await Task.sleep(for: .seconds(AppleMetrics.aiHandoffDelay)) } catch { return }
          guard let self else { return }
          withAnimation(Motion.keyboardDriven ? nil : Motion.contextReveal) {
            _ = self.deferred.remove(id)
          }
        }
      } else {
        withAnimation(Motion.keyboardDriven ? nil : Motion.contextReveal) { cards.append(id) }
      }
    }
  }
  func remove(_ id: String) {
    withAnimation(Motion.keyboardDriven ? nil : Motion.contextReveal) {
      cards.removeAll { $0 == id }
      deferred.remove(id)
    }
  }
  func prune(_ exists: (String) -> Bool) {
    let kept = cards.filter(exists)
    if kept != cards { cards = kept }
  }

  /// The handbook's height table, with the card spring; keyboard changes land at once.
  func event(_ event: AIHeightEvent) {
    let next = AIRules.next(height, event, hasSession: session != nil)
    guard next != height else { return }
    let change = {
      self.height = next
      if next != .panel { self.listOpen = false }
    }
    if Motion.keyboardDriven {
      Motion.instantly(change)
    } else {
      withAnimation(Motion.card, change)
    }
  }
  /// Escape steps back one level: the session list, then full → panel → one line.
  func escape() -> Bool {
    if listOpen {
      withAnimation(Motion.menuClose) { listOpen = false }
      return true
    }
    guard height != .line else { return false }
    event(.escape)
    return true
  }
  func toggleList() {
    withAnimation(listOpen ? Motion.menuClose : Motion.menuOpen) { listOpen.toggle() }
  }
  func pick(_ id: String) {
    guard let index = sessions.firstIndex(where: { $0.id == id }) else { return }
    sessions[index].unseen = false
    sessionId = id
    withAnimation(Motion.menuClose) { listOpen = false }
  }
  /// Sessions come only from the built-in AI, or from debug design samples.
  func load(_ sessions: [AISession]) {
    self.sessions = sessions
    sessionId = sessions.first?.id
  }
}

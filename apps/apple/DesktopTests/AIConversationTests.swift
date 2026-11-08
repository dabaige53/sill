import Testing

@testable import Sill

/// The same rules as Web `tests/web/ai-conversation.test.ts`.
struct AIConversationTests {
  // @wu-test type=behavior | scope=AI box | protects=Keep the AI box collapsed without a session
  @Test func withoutSessionTheBoxNeverGrows() {
    for event in [AIHeightEvent.open, .full, .shrink, .escape] {
      #expect(AIRules.next(.line, event, hasSession: false) == .line)
    }
  }
}

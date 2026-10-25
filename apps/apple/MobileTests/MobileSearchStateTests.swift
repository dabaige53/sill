import SillKit
import Testing

@testable import SillMobile

@MainActor struct MobileSearchStateTests {
  @Test func hashFragmentIsNotSearchedAndTokensDeleteFromTheEnd() {
    let state = MobileSearchState()
    state.category = "article"
    state.query = "climate #wor"
    #expect(state.text == "climate")
    #expect(state.hash == "wor")
    state.choose("tag:work")
    state.query = "#"
    state.choose("bookmarks")
    #expect(state.conditions == ["tag:work", "bookmarks"])
    state.backspace()
    #expect(state.conditions == ["tag:work"])
    state.backspace()
    #expect(state.category == "article")
    state.backspace()
    #expect(state.category == nil)
  }

  @Test func textAndAllConditionsMustMatchTheSameCard() throws {
    let card = try MobileCard(
      card: Card(
        json: .object([
          "id": .string("one"), "type": .string("article"), "title": .string("Climate report"),
          "tags": .array([.string("work")]),
        ])), item: .object(["bookmarked": .bool(true), "read": .bool(false)]))
    let state = MobileSearchState()
    state.query = "climate"
    state.conditions = ["bookmarks", "unread", "tag:work"]
    #expect(state.matches(card))
    state.conditions.append("later")
    #expect(!state.matches(card))
  }

  @Test func typeOffsetsAndPageLimitsAreIndependentOfHome() {
    let search = MobileSearchState()
    search.query = "report"
    search.type = "article"
    search.offsets[search.positionKey] = 230
    search.limits[search.positionKey] = 80
    search.type = "media"
    #expect(search.offsets[search.positionKey] == nil)
    #expect(search.limit == 40)
    search.type = "article"
    #expect(search.offsets[search.positionKey] == 230)
    #expect(search.limit == 80)
    search.reset()
    #expect(search.browsing)
    #expect(search.offsets.isEmpty)
  }
}

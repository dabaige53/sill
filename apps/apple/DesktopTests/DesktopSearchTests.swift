import Foundation
import Observation
import Testing

@testable import Sill
@testable import SillKit

@MainActor struct DesktopSearchTests {
  // @wu-test type=behavior | scope=Feed search token parsing | protects=Exclude an unfinished hash token from the text query
  @Test func hashFragmentNeverFiltersTheText() {
    #expect(Feed.searchText("Synthetic #wo") == "Synthetic")
    #expect(Feed.hashFragment("Synthetic #wo") == "wo")
    #expect(Feed.hashFragment("Synthetic #") == "")
    #expect(Feed.hashFragment("Synthetic") == nil)
    #expect(Feed.hashFragment("a#b") == nil)
  }

  // @wu-test type=behavior | scope=Feed search tokens | protects=Apply a selected tag without retaining its input fragment
  @Test func pickedHashOptionBecomesATokenAndLeavesTheText() async {
    let (workspace, _) = await ready(["a"], extra: [syntheticMail])
    let feed = Feed(workspace: workspace)
    feed.search("Synthetic #")
    #expect(feed.entries.count == 2)
    let options = feed.hashOptions("")
    #expect(
      options.map(\.value) == [.mark(.unread), .mark(.saved), .mark(.later), .tag("Work")])
    let rest = feed.pick(HashOption(value: .tag("Work")), in: "Synthetic #")
    #expect(rest == "Synthetic")
    #expect(feed.query == "Synthetic" && feed.tag == "Work")
    #expect(feed.entries == [.card("m")])
    #expect(!feed.hashOptions("").contains(HashOption(value: .tag("Work"))))
    // The tab's own status is already a token, so the list leaves it out.
    feed.select(.unread)
    #expect(!feed.hashOptions("").contains(HashOption(value: .mark(.unread))))
    feed.clearTokens()
    #expect(feed.tag == nil && feed.mark == nil && feed.scope == .all)
  }

  // @wu-test type=behavior | scope=Feed scope and search filters | protects=Avoid retaining a duplicate status when selecting its matching scope
  @Test func scopeAbsorbsMatchingStatusWithoutRestrictingAllCards() async {
    let (workspace, _) = await ready(["a", "b"])
    let marked = await withCheckedContinuation { continuation in
      workspace.change("b", ["read": .bool(true)]) { continuation.resume(returning: $0) }
    }
    #expect(marked)
    let feed = Feed(workspace: workspace)
    feed.pick(HashOption(value: .mark(.unread)), in: "")
    #expect(feed.entries == [.card("a")])
    feed.select(.unread)
    #expect(feed.mark == nil)
    #expect(feed.entries == [.card("a")])
    feed.select(.all)
    #expect(feed.scope == .all && feed.mark == nil)
    #expect(feed.entries == [.card("a"), .card("b")])
    feed.search("Synthetic")
    #expect(feed.entries == [.card("a"), .card("b")])
  }

  // @wu-test type=behavior | scope=Feed search type filters | protects=Show available types and clear the selected type with search
  @Test func typeChipsListTypesWithResultsAndLeaveWithTheText() async {
    let (workspace, _) = await ready(["a"], extra: [syntheticMail])
    let feed = Feed(workspace: workspace)
    #expect(feed.kinds.isEmpty)
    feed.search("Synthetic")
    #expect(feed.kinds == [.article, .mail])
    feed.selectKind(.mail)
    #expect(feed.entries == [.card("m")])
    #expect(feed.kinds == [.article, .mail])
    feed.search("")
    #expect(feed.kind == nil && feed.kinds.isEmpty)
  }
}

import Foundation
import Observation
import Testing

@testable import Sill
@testable import SillKit

@MainActor struct WebAlignmentTests {
  // @wu-test type=behavior | scope=Batch bookmarks | protects=Undo a batch bookmark while retaining selection
  @Test func batchBookmarkCanBeUndoneWithoutLosingSelection() async {
    let (workspace, _) = await ready(["a", "b"])
    let selection = Selection(workspace: workspace)
    selection.set(["a", "b"])
    workspace.mark(selection.ids, .bookmarked, value: !selection.allBookmarked)
    await until { workspace.queue.idle }
    #expect(selection.allBookmarked)
    #expect(selection.ids == ["a", "b"])
    workspace.mark(selection.ids, .bookmarked, value: !selection.allBookmarked)
    await until { workspace.queue.idle }
    #expect(!selection.allBookmarked)
    #expect(!workspace.state("a").bookmarked && !workspace.state("b").bookmarked)
    #expect(selection.ids == ["a", "b"])
  }

  // @wu-test type=behavior | scope=Search suggestions | protects=Restrict suggestions to the active filters
  @Test func searchSuggestionsFollowTheCurrentFilters() async {
    let (workspace, _) = await ready(["a", "b"])
    let feed = Feed(workspace: workspace)
    workspace.toggleBookmark("b")
    await until { workspace.queue.idle }
    feed.select(.saved)
    let suggestions = feed.suggestions("")
    #expect(suggestions.count == 1)
    if case .card(let id, _, _) = suggestions.first?.value {
      #expect(id == "b")
    } else {
      Issue.record("Expected a matching card suggestion")
    }
    feed.search("no matching title")
    #expect(feed.suggestions("no matching title").isEmpty)
  }

  // @wu-test type=behavior | scope=AI composer context | protects=Keep the draft and restore the composer when adding cards
  @Test func addingAIContextRestoresTheComposerAndKeepsTheDraft() {
    let context = AIContext()
    context.draft = "Keep this draft"
    context.minimized = true
    context.add(["a", "a"])
    #expect(!context.minimized)
    #expect(context.cards == ["a"])
    #expect(context.draft == "Keep this draft")
  }
}

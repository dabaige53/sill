import Foundation
import Observation
import Testing

@testable import Sill
@testable import SillKit

@MainActor struct EditorTests {
  @Test func bulkSaveTagsAllAndNotesFirst() async {
    let (workspace, _) = await ready()
    let baseline = workspace.editBaseline(["a", "b"])
    let result = Box<Workspace.EditResult>()
    workspace.saveEdits(["a", "b"], tags: ["工作"], note: "只给第一张", baseline: baseline) {
      result.value = $0
    }
    await until { result.value != nil }
    #expect(result.value == .saved)
    #expect(workspace.state("a").personalTags == ["工作"])
    #expect(workspace.state("b").personalTags == ["工作"])
    #expect(workspace.state("a").tagsEdited && workspace.state("b").tagsEdited)
    #expect(workspace.state("a").note == "只给第一张")
    #expect(workspace.state("b").note.isEmpty)
    #expect(workspace.notice?.text == Copy.text("web.app.5fa0ce52b47e") || !workspace.isLocal)
  }

  @Test func changedBaselineIsAConflictAndWritesNothing() async {
    let (workspace, backend) = await ready()
    let baseline = workspace.editBaseline(["a"])
    workspace.change("a", ["note": .string("别处写的")])
    await until { workspace.queue.idle && !workspace.state("a").isWriting }
    let writes = await backend.writes
    let result = Box<Workspace.EditResult>()
    workspace.saveEdits(["a"], tags: [], note: "我的输入", baseline: baseline) { result.value = $0 }
    #expect(result.value == .conflict)
    #expect(workspace.state("a").note == "别处写的")
    #expect(await backend.writes == writes)
  }

  @Test func tagInputIsCleaned() {
    #expect(EditorPanel.split(" #Work，AI\nwork, 阅读 ") == ["Work", "AI", "阅读"])
    #expect(!EditorPanel.suggestions(card: nil, chosen: ["ai"]).contains("AI"))
    #expect(EditorPanel.clean("  #阅读 ") == "阅读")
    #expect(EditorPanel.clean(String(repeating: "长", count: 40)).count == 30)
    #expect(!EditorPanel.suggestions(card: nil, chosen: ["AI"]).contains("AI"))
  }
}

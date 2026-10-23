import Foundation
import Testing

@testable import SillKit

struct MarkdownBodyTests {
  @Test func blocksAndInlineStylesPreserveContent() {
    let body = MarkdownBody(
      "## Heading\n\n3. **First**\n4. *Second*\n\n> Quote\n\n```swift\nlet x = 1\n```")
    #expect(body.blocks.map(\.text) == ["Heading", "First", "Second", "Quote", "let x = 1"])
    #expect(body.blocks[0].heading == 2)
    #expect(body.blocks[1].marker == "3.")
    #expect(body.blocks[1].runs[0].bold)
    #expect(body.blocks[2].runs[0].italic)
    #expect(body.blocks[3].quoteDepth == 1)
    #expect(body.blocks[4].code)
  }

  @Test func htmlImagesAndLinksStayPassiveUnlessAllowed() {
    let body = MarkdownBody(
      "<script>alert(1)</script>\n\n![Alt](https://example.com/image.png)\n\n[Safe](https://example.com) [Mail](mailto:a@example.com) [Bad](javascript:alert(1)) [File](file:///tmp/test)"
    )
    #expect(body.plainText.contains("<script>alert(1)</script>"))
    #expect(body.blocks[1].text == "Alt")
    #expect(body.blocks[1].runs.allSatisfy { $0.link == nil })
    #expect(
      body.blocks.flatMap(\.runs).compactMap(\.link).map(\.absoluteString) == [
        "https://example.com", "mailto:a@example.com",
      ])
    #expect(body.plainText.contains("[Bad](javascript:alert(1))"))
    #expect(body.plainText.contains("[File](file:///tmp/test)"))
  }

  @Test func tablesAndSoftBreaksKeepVisibleText() {
    let body = MarkdownBody("| Name | Value |\n| --- | --- |\n| **A** | 42 |\n\nSoft\nwrap")
    #expect(body.blocks.map(\.text) == ["Name\tValue", "A\t42", "Soft wrap"])
    #expect(body.blocks[1].cells[0][0].bold)
  }

  @Test func nestedListsKeepTheirDepthAndLiteralPunctuation() {
    let body = MarkdownBody("- One -- unchanged\n  - Nested `code`\n\nPlain \"quotes\"")
    #expect(body.blocks.map(\.text) == ["One -- unchanged", "Nested code", "Plain \"quotes\""])
    #expect(body.blocks[1].depth == 2)
    #expect(body.blocks[1].runs.last?.code == true)
  }
}

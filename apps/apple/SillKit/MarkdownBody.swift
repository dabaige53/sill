import Foundation
import Markdown

/// Parsed once with each card. Views only draw these values; body links never load images.
public struct MarkdownBody: Equatable, Sendable {
  public struct Run: Equatable, Sendable {
    public var text: String
    public var bold = false
    public var italic = false
    public var code = false
    public var strike = false
    public var link: URL?
  }

  public struct Block: Equatable, Sendable {
    public var runs: [Run]
    public var heading = 0
    public var code = false
    public var quoteDepth = 0
    public var depth = 0
    public var marker = ""
    public var rule = false
    public var cells: [[Run]] = []
    public var text: String { runs.map(\.text).joined() }
  }

  public let blocks: [Block]
  public var plainText: String { blocks.map(\.text).joined(separator: "\n") }

  public init(_ source: String) {
    blocks = Self.blocks(in: Document(parsing: source, options: .disableSmartOpts))
  }

  public static func safeURL(_ destination: String?) -> URL? {
    guard let destination, let url = URL(string: destination),
      let scheme = url.scheme?.lowercased(), ["http", "https", "mailto"].contains(scheme)
    else { return nil }
    return url
  }

  private static func runs(in node: any Markup) -> [Run] {
    if let text = node as? Markdown.Text { return [Run(text: text.string)] }
    if let code = node as? InlineCode { return [Run(text: code.code, code: true)] }
    if let html = node as? InlineHTML { return [Run(text: html.rawHTML)] }
    if node is SoftBreak { return [Run(text: " ")] }
    if node is LineBreak { return [Run(text: "\n")] }
    let children = node.children.flatMap { runs(in: $0) }
    if node is Image { return [Run(text: children.map(\.text).joined())] }
    if let link = node as? Markdown.Link {
      guard let url = safeURL(link.destination) else {
        return [Run(text: "[\(children.map(\.text).joined())](\(link.destination ?? ""))")]
      }
      return children.map {
        var run = $0
        run.link = url
        return run
      }
    }
    return children.map {
      var run = $0
      if node is Strong { run.bold = true }
      if node is Emphasis { run.italic = true }
      if node is Strikethrough { run.strike = true }
      return run
    }
  }

  private static func blocks(in node: any Markup, depth: Int = 0, quote: Int = 0) -> [Block] {
    if let paragraph = node as? Paragraph {
      return [Block(runs: runs(in: paragraph), quoteDepth: quote, depth: depth)]
    }
    if let heading = node as? Heading {
      return [
        Block(runs: runs(in: heading), heading: heading.level, quoteDepth: quote, depth: depth)
      ]
    }
    if let code = node as? CodeBlock {
      return [
        Block(
          runs: [Run(text: code.code.trimmingCharacters(in: .newlines), code: true)], code: true,
          quoteDepth: quote, depth: depth)
      ]
    }
    if let html = node as? HTMLBlock {
      return [
        Block(
          runs: [Run(text: html.rawHTML.trimmingCharacters(in: .newlines))], quoteDepth: quote,
          depth: depth)
      ]
    }
    if node is Table.Head || node is Table.Row {
      let cells = node.children.map { runs(in: $0) }
      let text = cells.map { $0.map(\.text).joined() }.joined(separator: "\t")
      return [
        Block(
          runs: [Run(text: text)], heading: node is Table.Head ? 1 : 0,
          quoteDepth: quote, depth: depth, cells: cells)
      ]
    }
    if node is ThematicBreak { return [Block(runs: [], rule: true)] }
    if node is OrderedList || node is UnorderedList {
      let start = (node as? OrderedList)?.startIndex
      return node.children.enumerated().flatMap { index, item in
        var result = blocks(in: item, depth: depth + 1, quote: quote)
        if !result.isEmpty { result[0].marker = start.map { "\($0 + UInt(index))." } ?? "•" }
        return result
      }
    }
    return node.children.flatMap {
      blocks(in: $0, depth: depth, quote: quote + (node is BlockQuote ? 1 : 0))
    }
  }
}

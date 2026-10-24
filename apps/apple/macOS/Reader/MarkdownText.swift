import SillKit
import SwiftUI

/// Draw the shared parsed body with the reader's existing type scale.
struct MarkdownText: View {
  let document: MarkdownBody
  let size: CGFloat
  let leading: CGFloat
  @Environment(\.contentAppearance) private var appearance
  var outline = false
  @Environment(Reader.self) private var reader
  @Environment(Workspace.self) private var workspace

  var body: some View {
    VStack(
      alignment: .leading,
      spacing: AppleMetrics.rhythmItem * workspace.preferences.readerSpacing.scale
    ) {
      ForEach(Array(document.blocks.enumerated()), id: \.offset) { index, block in
        if block.rule {
          Rectangle().fill(AppleColors.line).frame(height: AppleMetrics.lineWidth)
        } else if !block.cells.isEmpty {
          HStack(alignment: .top, spacing: AppleMetrics.space16) {
            ForEach(Array(block.cells.enumerated()), id: \.offset) { _, runs in
              Text(attributed(runs, heading: block.heading))
                .textStyle(size, leading: leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled)
            }
          }
        } else {
          HStack(alignment: .top, spacing: AppleMetrics.space8) {
            if !block.marker.isEmpty { Text(block.marker).textStyle(size, leading: leading) }
            Text(attributed(block.runs, heading: block.heading))
              .textStyle(block.heading > 0 ? AppleMetrics.font17 : size, leading: leading)
              .frame(maxWidth: .infinity, alignment: .leading)
              .fixedSize(horizontal: false, vertical: true)
              .textSelection(.enabled)
              .accessibilityAddTraits(block.heading > 0 ? .isHeader : [])
          }
          .id(outline && block.heading > 0 ? "reader-section-\(index)" : "reader-block-\(index)")
          .background {
            if outline && block.heading > 0 {
              GeometryReader { geometry in
                Color.clear.preference(
                  key: ReaderHeadingPositions.self,
                  value: [index: geometry.frame(in: .named("article-reading")).minY])
              }
            }
          }
          .padding(.leading, CGFloat(block.depth) * AppleMetrics.space16)
          .padding(.leading, block.quoteDepth > 0 ? AppleMetrics.space18 : 0)
          .overlay(alignment: .leading) {
            if block.quoteDepth > 0 {
              Rectangle().fill(AppleColors.line).frame(width: AppleMetrics.space2)
            }
          }
        }
      }
    }
    .foregroundStyle(AppleColors.primary)
    .tint(AppleColors.accent)
    .environment(
      \.openURL,
      OpenURLAction { url in
        guard let route = Self.cardRoute(url), workspace.model(route.id) != nil else {
          _ = ExternalLink.open(url, workspace: workspace)
          return .handled
        }
        reader.open(route.id, full: route.full)
        return .handled
      })
  }

  static func cardRoute(_ url: URL) -> (id: String, full: Bool)? {
    let local =
      ["127.0.0.1", "localhost", "::1", "[::1]"].contains(url.host ?? "")
      && [4318, 5173].contains(url.port ?? 0)
    let cloud =
      url.scheme == "https"
      && url.host == "sill-web-preview.scs1213-temp-email.workers.dev"
      && (url.port == nil || url.port == 443)
    guard ["http", "https"].contains(url.scheme ?? ""), local || cloud,
      url.path.isEmpty || url.path == "/", let fragment = url.fragment
    else { return nil }
    let parts = fragment.split(separator: "/", omittingEmptySubsequences: false)
    guard parts.count == 2, ["card", "read"].contains(parts[0]),
      !parts[1].isEmpty,
      parts[1].allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-" || $0 == "_") })
    else { return nil }
    return (String(parts[1]), parts[0] == "read")
  }

  private func attributed(_ runs: [MarkdownBody.Run], heading: Int) -> AttributedString {
    runs.reduce(into: AttributedString()) { result, run in
      var text = AttributedString(run.text)
      var font: Font =
        run.code
        ? .system(size: size * appearance.scale, design: .monospaced)
        : .sans((heading > 0 ? AppleMetrics.font17 : size) * appearance.scale)
      font = font.weight(appearance.weight(run.bold || heading > 0 ? .semibold : .regular))
      if run.italic { font = font.italic() }
      text.font = font
      text.strikethroughStyle = run.strike ? .single : nil
      text.link = run.link
      result.append(text)
    }
  }
}

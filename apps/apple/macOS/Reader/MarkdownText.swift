import SillKit
import SwiftUI

/// Draw the shared parsed body with the reader's existing type scale.
struct MarkdownText: View {
  let document: MarkdownBody
  let size: CGFloat
  let leading: CGFloat

  var body: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space16) {
      ForEach(Array(document.blocks.enumerated()), id: \.offset) { _, block in
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
            if !block.marker.isEmpty { Text(block.marker).font(.sans(size)) }
            Text(attributed(block.runs, heading: block.heading))
              .textStyle(block.heading > 0 ? AppleMetrics.font17 : size, leading: leading)
              .frame(maxWidth: .infinity, alignment: .leading)
              .fixedSize(horizontal: false, vertical: true)
              .textSelection(.enabled)
              .accessibilityAddTraits(block.heading > 0 ? .isHeader : [])
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
  }

  private func attributed(_ runs: [MarkdownBody.Run], heading: Int) -> AttributedString {
    runs.reduce(into: AttributedString()) { result, run in
      var text = AttributedString(run.text)
      var font: Font =
        run.code
        ? .system(size: size, design: .monospaced) : .sans(heading > 0 ? AppleMetrics.font17 : size)
      if run.bold || heading > 0 { font = font.weight(.semibold) }
      if run.italic { font = font.italic() }
      text.font = font
      text.strikethroughStyle = run.strike ? .single : nil
      text.link = run.link
      result.append(text)
    }
  }
}

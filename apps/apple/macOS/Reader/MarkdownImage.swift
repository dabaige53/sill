import SillKit
import SwiftUI

/// Images remain in the article's lazy stack; the native sheet leaves its scroll intact.
struct MarkdownImage: View {
  let url: URL
  let alt: String
  var link: URL?
  @State private var enlarged = false
  @Environment(Workspace.self) private var workspace

  var body: some View {
    AsyncImage(url: url) { phase in
      if let image = phase.image {
        Button {
          if let link { ExternalLink.open(link, workspace: workspace) } else { enlarged = true }
        } label: {
          image.resizable().aspectRatio(contentMode: .fit)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(alt.isEmpty ? Copy.text("web.markdown.openImage") : alt)
        .help(Copy.text("web.markdown.openImage"))
        .sheet(isPresented: $enlarged) {
          VStack(alignment: .trailing, spacing: AppleMetrics.space12) {
            ToolButton(icon: "x", label: Copy.text("web.photo.close")) { enlarged = false }
            image.resizable().aspectRatio(contentMode: .fit)
              .accessibilityLabel(alt)
          }
          .padding(AppleMetrics.space24)
          .frame(width: AppleMetrics.lightboxImageMaxWidth)
          .frame(maxHeight: AppleMetrics.lightboxImageMaxWidth)
        }
      } else {
        VStack(alignment: .leading, spacing: AppleMetrics.space8) {
          Text(
            Copy.text(phase.error == nil ? "web.markdown.loadingImage" : "web.markdown.failedImage")
          )
          if !alt.isEmpty { Text(alt) }
        }
        .font(.sans(AppleMetrics.font14))
        .foregroundStyle(AppleColors.secondary)
        .padding(AppleMetrics.space12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppleColors.surface)
      }
    }
    .frame(maxWidth: .infinity)
  }
}

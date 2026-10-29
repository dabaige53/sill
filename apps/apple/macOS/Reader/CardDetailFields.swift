import SillKit
import SwiftUI

extension CardModel {
  var displaySourceLine: String {
    [
      [.article, .media, .note, .suggestion].contains(kind) ? publicationName : sourceName,
      [.media, .note, .suggestion].contains(kind) ? publicationDate ?? "" : "",
      readingTime,
    ]
    .filter { !$0.isEmpty }.joined(separator: " · ")
  }
  /// The detail shows the publication date only where the source line does not carry it.
  var detailDate: String? {
    [.article, .media, .mail, .event, .task, .reminder, .note, .file, .suggestion].contains(kind)
      ? nil : publicationDate
  }
}

struct DetailFiles: View {
  let files: [CardModel.FileItem]
  var label = Copy.text("web.card.files")
  var body: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.rhythmClose) {
      if !files.isEmpty {
        Text(label).textStyle(AppleMetrics.font13, .semibold).foregroundStyle(
          AppleColors.secondary)
      }
      VStack(spacing: 0) {
        ForEach(Array(files.enumerated()), id: \.offset) { index, file in
          let row = DetailRow(
            icon: file.isImage ? "image" : "file", title: file.name,
            detail: file.detail,
            trailing: file.modifiedAt.flatMap(ReaderContent.fullDate) ?? "",
            divider: index > 0, navigable: file.url != nil)
          if let url = file.url { Link(destination: url) { row }.buttonStyle(.plain) } else { row }
        }
      }
    }
  }
}

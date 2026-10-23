import SillKit
import SwiftUI

extension CardModel {
  var displaySourceLine: String {
    [
      [.article, .media, .note, .suggestion].contains(kind) ? publicationName : sourceName,
      [.media, .note, .suggestion].contains(kind)
        ? publication.date ?? "" : "",
      readingTime,
    ]
    .filter { !$0.isEmpty }.joined(separator: " · ")
  }
  var detailPublication: Publication {
    var result = publication
    if [.article, .media, .mail, .event, .task, .reminder, .note, .file, .suggestion].contains(kind)
    {
      result.dateTitle = nil
    }
    if [.article, .media, .note, .file, .suggestion, .mail].contains(kind) {
      result.rows.removeAll {
        $0.label == Copy.text("web.metadata.authors")
          || $0.label == Copy.text("web.metadata.publisher")
      }
    }
    if kind == .task { result.rows.removeAll { $0.label == Copy.text("web.metadata.project") } }
    if kind == .mail { result.rows.removeAll { $0.label == Copy.text("web.metadata.sent") } }
    if kind == .event { result.rows.removeAll { $0.value == raw["timeZone"]?.string } }
    return result
  }
}

struct DetailFiles: View {
  let files: [CardModel.FileItem]
  var label = Copy.text("web.card.files")
  var attachment = false
  var body: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space10) {
      if !files.isEmpty {
        Text(label).font(.sans(AppleMetrics.font13, .semibold)).foregroundStyle(
          AppleColors.secondary)
      }
      VStack(spacing: 0) {
        ForEach(Array(files.enumerated()), id: \.offset) { index, file in
          let row = DetailRow(
            icon: file.isImage ? "image" : "file", title: file.name,
            detail: attachment ? "" : file.detail,
            trailing: attachment
              ? file.detail : file.modifiedAt.flatMap(ReaderContent.fullDate) ?? "",
            divider: index > 0, navigable: file.url != nil)
          if let url = file.url { Link(destination: url) { row }.buttonStyle(.plain) } else { row }
        }
      }
    }
  }
}

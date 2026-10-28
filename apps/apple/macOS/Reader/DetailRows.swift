import SillKit
import SwiftUI

/// Source icon and source name over the title: secondary, one line.
struct MetaRow<Label: View>: View {
  let icon: AnyView?
  var size = AppleMetrics.font13
  @ViewBuilder var label: Label
  var body: some View {
    HStack(spacing: AppleMetrics.space6) {
      if let icon { icon.foregroundStyle(AppleColors.iconSecondary) }
      label.lineLimit(1).truncationMode(.tail)
    }
    .textStyle(size)
    .foregroundStyle(AppleColors.iconSecondary)
  }
}

/// Small non-interactive tags under the title.
struct ReaderTags: View {
  let tags: [String]
  var body: some View {
    if !tags.isEmpty {
      FlowRow(spacing: AppleMetrics.space6) {
        ForEach(tags, id: \.self) { tag in
          Text("#\(tag)")
            .textStyle(AppleMetrics.font12)
            .foregroundStyle(AppleColors.secondary)
            .padding(.vertical, AppleMetrics.space3).padding(.horizontal, AppleMetrics.space8)
            .background(Capsule().fill(AppleColors.surface))
        }
      }
    }
  }
}

/// Publication date and author rows: small grey text, no box (Medium-style).
struct PublicationRows: View {
  let publication: CardModel.Publication
  /// Off in article reading, where the date sits in the source line instead.
  var showsDate = true
  var body: some View {
    let date = showsDate ? publication.date : nil
    if date != nil || !publication.rows.isEmpty {
      VStack(alignment: .leading, spacing: AppleMetrics.space6) {
        if let date {
          Text(date).help(publication.dateTitle ?? "")
        }
        ForEach(Array(publication.rows.enumerated()), id: \.offset) { _, row in
          Text(row.label.isEmpty ? row.value : "\(row.label) · \(row.value)")
        }
      }
      .textStyle(AppleMetrics.font12)
      .foregroundStyle(AppleColors.iconSecondary)
    }
  }
}

/// The personal note at the end of the text, in a light bordered box labelled 备注.
struct NoteBox: View {
  let note: String
  var body: some View {
    if !note.isEmpty {
      VStack(alignment: .leading, spacing: AppleMetrics.space4) {
        Text(Copy.text("web.metadata.note")).textStyle(AppleMetrics.font12)
        Text(note).textStyle(AppleMetrics.font14, leading: AppleMetrics.previewLeadLeading)
          .fixedSize(horizontal: false, vertical: true)
          .textSelection(.enabled)
      }
      .foregroundStyle(AppleColors.iconSecondary)
      .padding(.vertical, AppleMetrics.space12).padding(.horizontal, AppleMetrics.space14)
      .frame(maxWidth: .infinity, alignment: .leading)
      .overlay(
        RoundedRectangle(cornerRadius: AppleMetrics.space14)
          .strokeBorder(AppleColors.lineCard, lineWidth: AppleMetrics.lineWidth)
      )
      .accessibilityElement(children: .combine)
    }
  }
}

struct DetailRow: View {
  let icon: String
  let title: String
  var detail = ""
  var trailing = ""
  var divider = false
  var navigable = false
  var tone: Color? = nil
  var wrapping = false
  var body: some View {
    HStack(spacing: AppleMetrics.space12) {
      Icon(icon, size: AppleMetrics.space16)
        .foregroundStyle(tone ?? AppleColors.secondary)
        .frame(width: AppleMetrics.space18, height: AppleMetrics.space18)
      VStack(alignment: .leading, spacing: 0) {
        Text(title).lineLimit(wrapping ? nil : 1).fixedSize(horizontal: false, vertical: true)
          .truncationMode(.tail)
        if !detail.isEmpty {
          Text(detail).textStyle(AppleMetrics.font12).foregroundStyle(AppleColors.secondary)
            .lineLimit(wrapping ? nil : 1).fixedSize(horizontal: false, vertical: true)
            .truncationMode(.tail)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      if !trailing.isEmpty {
        Text(trailing).textStyle(AppleMetrics.font12, number: true).foregroundStyle(
          AppleColors.secondary
        )
        .lineLimit(1)
      }
      if navigable {
        Icon("chevron", size: AppleMetrics.space14).foregroundStyle(AppleColors.secondary)
      }
    }
    .textStyle(AppleMetrics.font14)
    .foregroundStyle(tone ?? AppleColors.primary)
    .frame(minHeight: AppleMetrics.detailRowHeight)
    .overlay(alignment: .top) {
      if divider { Rectangle().fill(AppleColors.line).frame(height: AppleMetrics.lineWidth) }
    }
  }
}

/// The first row of a detail reports its height; the floating discs center on it.
struct FirstRowHeight: PreferenceKey {
  static let defaultValue: CGFloat = 0
  static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
    value = max(value, nextValue())
  }
}

extension View {
  func firstRow() -> some View {
    background(
      GeometryReader { Color.clear.preference(key: FirstRowHeight.self, value: $0.size.height) })
  }
}

extension Array where Element: Hashable {
  func uniqued() -> [Element] {
    var seen = Set<Element>()
    return filter { seen.insert($0).inserted }
  }
}

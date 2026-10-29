import SillKit
import SwiftUI

/// A read-only introduction. Listening position belongs to the shared workspace record.
struct PodcastDetail: View {
  let card: CardModel
  let state: CardState

  var body: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.rhythmSection) {
      HStack(alignment: .top, spacing: AppleMetrics.space32) {
        CoverImage(name: card.cover)
          .frame(width: AppleMetrics.podcastCoverSize, height: AppleMetrics.podcastCoverSize)
          .background(AppleColors.surface)
          .overlay {
            if card.cover == nil {
              VStack(alignment: .leading, spacing: AppleMetrics.space12) {
                Text(card.publicationName).font(.sans(AppleMetrics.font13))
                  .foregroundStyle(AppleColors.secondary)
                Text(card.title).font(.sans(AppleMetrics.font20, .semibold)).lineLimit(5)
              }
              .padding(AppleMetrics.space24)
              .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
            }
          }
          .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.coverRadius))
        VStack(alignment: .leading, spacing: AppleMetrics.rhythmItem) {
          if let date = card.publicationDate {
            Text(date).font(.number(AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
          }
          Text(card.title).textStyle(AppleMetrics.previewTitle, .semibold)
          if let url = card.url {
            Link(destination: url) {
              MetaRow(icon: AnyView(SourceIcon(card: card))) {
                Text(card.publicationName)
                Icon("external", size: AppleMetrics.space14)
              }
            }.buttonStyle(.plain)
          } else {
            MetaRow(icon: AnyView(SourceIcon(card: card))) { Text(card.publicationName) }
          }
          ReaderTags(tags: state.tags(of: card))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.trailing, AppleMetrics.space32)
      }
      HStack(spacing: AppleMetrics.space8) {
        Icon("headphones", size: AppleMetrics.space16)
        Text(Copy.text("web.media.listening"))
        Text(Format.duration(Int(state.playbackPosition))).fontWeight(.semibold)
        Text("/ " + (card.duration.map(Format.duration) ?? Copy.text("web.media.unknownDuration")))
      }.font(.number(AppleMetrics.font14)).foregroundStyle(AppleColors.secondary)
      if !card.markdown.blocks.isEmpty {
        MarkdownText(
          document: card.markdown, size: AppleMetrics.font15,
          leading: AppleMetrics.previewBodyLeading)
      }
      if !card.chapters.isEmpty {
        section("web.media.chapters") {
          ForEach(Array(card.chapters.enumerated()), id: \.offset) { _, chapter in
            HStack(alignment: .top, spacing: AppleMetrics.space16) {
              Text(Format.duration(Int(chapter.start)))
                .font(.number(AppleMetrics.font14)).foregroundStyle(AppleColors.secondary)
              Text(chapter.title).frame(maxWidth: .infinity, alignment: .leading)
            }.padding(.vertical, AppleMetrics.space12)
              .overlay(alignment: .bottom) { Divider() }
          }
        }
      }
      if !card.transcript.isEmpty {
        section("web.media.transcript") {
          Text(Copy.text("web.media.excerpt")).font(.sans(AppleMetrics.font12))
            .foregroundStyle(AppleColors.secondary)
          ForEach(Array(card.transcript.prefix(5).enumerated()), id: \.offset) { _, line in
            Text(line.text).font(.system(size: AppleMetrics.font17, design: .serif))
              .fixedSize(horizontal: false, vertical: true)
              .padding(.top, AppleMetrics.space12)
          }
        }
      }
      if !(card.sources.first?.name ?? "").isEmpty || !card.authors.isEmpty
        || card.publicationDate != nil || card.duration != nil
      {
        section("web.media.information") {
          fact("web.media.program", card.sources.first?.name ?? "")
          fact(
            "web.media.host",
            card.authors.map(\.name).joined(separator: "、"))
          fact("web.media.published", card.publicationDate ?? "")
          if let duration = card.duration {
            fact(
              "web.media.duration",
              String(max(1, Int((Double(duration) / 60).rounded())))
                + Copy.text("web.templates.40de54344d22"))
          }
        }
      }
    }.foregroundStyle(AppleColors.primary).font(.sans(AppleMetrics.font15))
  }

  private func section<Content: View>(_ key: String, @ViewBuilder content: () -> Content)
    -> some View
  {
    VStack(alignment: .leading, spacing: AppleMetrics.space8) {
      Text(Copy.text(key)).font(.sans(AppleMetrics.font17, .semibold))
      VStack(alignment: .leading, spacing: 0, content: content)
    }
  }

  @ViewBuilder private func fact(_ key: String, _ value: String) -> some View {
    if !value.isEmpty {
      HStack(alignment: .top, spacing: AppleMetrics.space16) {
        Text(Copy.text(key)).foregroundStyle(AppleColors.secondary)
        Spacer(minLength: 0)
        Text(value).multilineTextAlignment(.trailing)
      }.padding(.vertical, AppleMetrics.space12)
        .overlay(alignment: .bottom) { Divider() }
    }
  }
}

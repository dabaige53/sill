import SillKit
import SwiftUI

struct MediaDetail: View {
  let card: CardModel
  let state: CardState
  var full = false
  var availableWidth: CGFloat?
  var availableHeight: CGFloat?
  @Environment(Workspace.self) private var workspace
  @Environment(MediaPlayback.self) private var playback
  private var primary: some View {
    VStack(
      alignment: .leading, spacing: AppleMetrics.space16 * workspace.preferences.readerSpacing.scale
    ) {
      source.frame(minHeight: AppleMetrics.space36, alignment: .leading)
        .padding(.bottom, -AppleMetrics.space10)
      Text(card.title).textStyle(AppleMetrics.previewTitle, .semibold)
        .frame(maxWidth: .infinity, alignment: .leading)
      ReaderTags(tags: state.tags(of: card))
      SummaryOverview(card: card)
      if let id = OfficialVideoPlayer.videoID(card.url) {
        OfficialVideoPlayer(
          videoID: id, initialPosition: state.playbackPosition, playback: playback, save: save
        )
        .aspectRatio(16 / 9, contentMode: .fit).frame(minHeight: AppleMetrics.mediaPlayerMinHeight)
        // The cover stands in until the official player is ready, so a slow or blocked embed never shows an empty box.
        .overlay { if !playback.videoReady { videoPoster } }
        .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.coverRadius))
      } else {
        ZStack {
          CoverImage(name: card.cover)
          VStack(spacing: AppleMetrics.space16) {
            Button {
            } label: {
              Icon("play")
            }.disabled(true)
            Text(Copy.text("web.media.playbackUnavailable"))
          }.padding(AppleMetrics.space16)
        }.aspectRatio(16 / 9, contentMode: .fit)
          .frame(minHeight: AppleMetrics.mediaPlayerMinHeight)
          .background(AppleColors.surface)
          .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.coverRadius))
      }
      if playback.failed {
        VStack(alignment: .leading, spacing: AppleMetrics.space8) {
          Text(
            Copy.text("web.media.playbackUnavailable")
          ).foregroundStyle(AppleColors.secondary)
          Button(Copy.text("web.retry")) {
            playback.retryVideo?()
          }.buttonStyle(TextLinkStyle(padded: false))
        }
      }

    }
  }

  private var source: some View {
    MetaRow(icon: AnyView(SourceIcon(card: card))) {
      Text(
        [
          card.publicationName, card.displayDate,
          card.duration.map(Format.duration) ?? "",
        ].filter { !$0.isEmpty }.joined(
          separator: " · "))
    }.firstRow()
  }
  private var videoPoster: some View {
    ZStack {
      CoverImage(name: card.cover)
      AppleColors.fixedBlack18
      Icon("play", size: AppleMetrics.space24, filled: true)
        .foregroundStyle(AppleColors.primary)
        .frame(width: AppleMetrics.space56, height: AppleMetrics.space56)
        .background(Circle().fill(AppleColors.glassThick))
      VStack {
        Spacer(minLength: 0)
        HStack {
          Text(
            card.duration.map {
              "\(Format.duration(Int(state.playbackPosition))) / \(Format.duration($0))"
            } ?? Copy.text("web.media.unknownDuration")
          )
          .font(.number(AppleMetrics.font12))
          Spacer(minLength: AppleMetrics.space12)
          Text(Copy.text("web.media.youtubePlayer")).font(.sans(AppleMetrics.font12)).opacity(0.7)
        }
        .foregroundStyle(AppleColors.fixedWhite)
        .padding(.horizontal, AppleMetrics.space16).padding(.vertical, AppleMetrics.space12)
        .background(
          LinearGradient(
            colors: [.clear, Color.black.opacity(0.45)], startPoint: .top,
            endPoint: .bottom))
      }
    }
    .background(AppleColors.surface)
    .allowsHitTesting(false)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space16) {
      primary
      if !card.markdown.blocks.isEmpty {
        MarkdownText(
          document: card.markdown, size: AppleMetrics.font15,
          leading: AppleMetrics.previewBodyLeading)
      }
    }
    .font(.sans(AppleMetrics.font15)).foregroundStyle(AppleColors.primary)
    .onAppear {
      if playback.videoView == nil {
        playback.position = state.playbackPosition
        playback.duration = Double(card.duration ?? 0)
      }
    }
  }
  /// Opening already marked the card read, so the end of playback only saves its position.
  private func save(_ position: Double, _: Bool) {
    guard position.isFinite, workspace.model(card.id) != nil, workspace.state(card.id) === state
    else { return }
    workspace.write([.itemPatch(id: card.id, values: ["playbackPosition": .number(position)])])
  }
}

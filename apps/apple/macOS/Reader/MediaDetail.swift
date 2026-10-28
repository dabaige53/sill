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
  @State private var tab = "summary"
  @State private var follow = true
  private var available: Bool {
    OfficialVideoPlayer.videoID(card.url) != nil
  }
  private var active: Int? { card.transcript.lastIndex { $0.start <= playback.position } }
  private var primary: some View {
    VStack(
      alignment: .leading, spacing: AppleMetrics.space16 * workspace.preferences.readerSpacing.scale
    ) {
      source.frame(minHeight: AppleMetrics.space36, alignment: .leading)
        .padding(.bottom, -AppleMetrics.space10)
      Text(card.title).textStyle(AppleMetrics.previewTitle, .semibold)
        .frame(maxWidth: .infinity, alignment: .leading)
      ReaderTags(tags: state.tags(of: card))
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
      if full {
        MediaChapters(
          chapters: card.chapters, duration: playback.duration, position: playback.position,
          seek: playback.seek
        ).disabled(!available)
      }
    }
  }

  private var source: some View {
    MetaRow(icon: AnyView(SourceIcon(card: card))) {
      Text(
        [
          card.publicationName, card.publicationDate ?? "",
          card.duration.map(Format.duration) ?? "",
        ].filter { !$0.isEmpty }.joined(
          separator: " · "))
    }.firstRow()
  }
  private func tabButton(_ value: String, _ label: String) -> some View {
    Button {
      tab = value
    } label: {
      Text(Copy.text(label)).font(.sans(AppleMetrics.font13, .medium))
        .foregroundStyle(tab == value ? AppleColors.primary : AppleColors.secondary)
        .padding(.horizontal, AppleMetrics.space8)
        .frame(minHeight: AppleMetrics.space44)
        .overlay(alignment: .bottom) {
          if tab == value {
            Rectangle().fill(AppleColors.primary).frame(height: AppleMetrics.space2)
          }
        }
    }.buttonStyle(.plain)
      .accessibilityAddTraits(tab == value ? .isSelected : [])
  }
  private var tabHeader: some View {
    HStack(spacing: AppleMetrics.space16) {
      tabButton("transcript", "web.media.transcript")
      tabButton("chapters", "web.media.chapters")
      tabButton("summary", "web.media.summary")
      Spacer(minLength: 0)
      if tab == "transcript" {
        Button {
          follow.toggle()
        } label: {
          HStack(spacing: AppleMetrics.space4) {
            Icon("clock", size: AppleMetrics.font14)
            Text(Copy.text("web.media.follow"))
          }.font(.sans(AppleMetrics.font12)).padding(.horizontal, AppleMetrics.space10).padding(
            .vertical, AppleMetrics.space6
          )
          .foregroundStyle(AppleColors.accent).background(
            Capsule().fill(AppleColors.accentSoft))
        }.buttonStyle(.plain).disabled(!available || card.transcript.isEmpty)
          .accessibilityAddTraits(follow ? .isSelected : [])
      }
    }.frame(maxWidth: .infinity, alignment: .leading)
      .overlay(alignment: .bottom) {
        Rectangle().fill(AppleColors.lineCard).frame(height: AppleMetrics.lineWidth)
      }
  }

  private var secondary: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space16) {
      if full { tabHeader }
      if tab == "summary" {
        if !card.markdown.blocks.isEmpty {
          MarkdownText(
            document: card.markdown, size: AppleMetrics.font15,
            leading: AppleMetrics.previewBodyLeading)
        } else {
          Text(Copy.text("web.media.emptyNotes")).foregroundStyle(AppleColors.secondary)
        }
      } else if tab == "chapters" {
        if card.chapters.isEmpty {
          Text(Copy.text("web.media.emptyChapters")).foregroundStyle(AppleColors.secondary)
        }
        ForEach(Array(card.chapters.enumerated()), id: \.offset) { index, chapter in
          Button {
            playback.seek(chapter.start)
          } label: {
            DetailRow(
              icon: "play", title: chapter.title, trailing: Format.duration(Int(chapter.start)))
          }.buttonStyle(.plain).disabled(!available)
            .background(
              playback.position >= chapter.start
                && playback.position
                  < (index + 1 < card.chapters.count ? card.chapters[index + 1].start : .infinity)
                ? AppleColors.accentSoft : Color.clear)
        }
      } else {
        if card.transcript.isEmpty {
          Text(Copy.text("web.media.emptyTranscript")).foregroundStyle(AppleColors.secondary)
        }
        ScrollViewReader { proxy in
          ScrollView {
            VStack(alignment: .leading, spacing: AppleMetrics.space8) {
              ForEach(Array(card.transcript.enumerated()), id: \.offset) { index, line in
                Button {
                  playback.seek(line.start)
                } label: {
                  HStack(alignment: .top, spacing: AppleMetrics.space12) {
                    Text(Format.duration(Int(line.start))).textStyle(
                      AppleMetrics.font13, number: true)
                    Text(line.text).textStyle(
                      AppleMetrics.font14, leading: AppleMetrics.previewBodyLeading
                    ).frame(maxWidth: .infinity, alignment: .leading)
                  }.padding(AppleMetrics.space8)
                    .background(index == active ? AppleColors.accentSoft : Color.clear)
                }.buttonStyle(.plain).disabled(!available).id(index)
              }
            }
          }.frame(maxHeight: AppleMetrics.previewMaxHeight / 2)
            .background(TranscriptScrollIntent { follow = false })
            .onChange(of: active) { _, index in
              if follow, playback.playing, let index { proxy.scrollTo(index) }
            }
        }
      }
    }
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
    let split =
      full
      && (availableWidth ?? AppleMetrics.readerColumnsBreakpoint)
        >= AppleMetrics.readerColumnsBreakpoint
    let layout =
      split
      ? AnyLayout(HStackLayout(alignment: .top, spacing: AppleMetrics.space32))
      : AnyLayout(VStackLayout(alignment: .leading, spacing: AppleMetrics.space16))
    layout {
      if split {
        ScrollView { primary.padding(.bottom, AppleMetrics.space24) }
          .frame(
            width: max(
              0, (availableWidth ?? AppleMetrics.readerColumnsBreakpoint) - AppleMetrics.space30)
              * (1.6 / 2.6)
          )
          .frame(height: availableHeight)
          .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.coverRadius))
        ScrollView { secondary }
          .frame(maxWidth: .infinity)
          .frame(height: availableHeight)
      } else if full {
        primary.frame(maxWidth: .infinity)
        secondary.frame(maxWidth: .infinity, alignment: .topLeading)
      } else {
        primary.frame(maxWidth: .infinity)
        secondary.frame(maxWidth: .infinity, alignment: .topLeading)
      }
    }
    .font(.sans(AppleMetrics.font15)).foregroundStyle(AppleColors.primary)
    .onAppear {
      if full && !card.transcript.isEmpty { tab = "transcript" }
      if playback.videoView == nil {
        playback.position = state.playbackPosition
        playback.duration = Double(card.duration ?? 0)
      }
    }
  }
  private func save(_ position: Double, _ ended: Bool) {
    guard position.isFinite, workspace.model(card.id) != nil, workspace.state(card.id) === state
    else { return }
    var values: [String: JSONValue] = ["playbackPosition": .number(position)]
    if ended {
      values["read"] = .bool(true)
      values["readAt"] = .number(Format.milliseconds())
    }
    workspace.write([.itemPatch(id: card.id, values: values)])
  }
}

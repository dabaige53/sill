import SillKit
import SwiftUI

struct MediaDetail: View {
  let card: CardModel
  let state: CardState
  var full = false
  var availableHeight: CGFloat?
  var scrollOffset: CGFloat = 0
  var bottomRoom: CGFloat = 0
  var returnToPlayer: () -> Void = {}
  @State private var primaryHeight: CGFloat = 0
  @Environment(Workspace.self) private var workspace
  @State private var playback = MediaPlayback()
  @State private var tab = "summary"
  @State private var follow = true
  private var available: Bool {
    card.isPodcast ? card.audioURL != nil : OfficialVideoPlayer.videoID(card.url) != nil
  }
  private var active: Int? { card.transcript.lastIndex { $0.start <= playback.position } }
  private var chapterLabel: String {
    guard let index = card.chapters.lastIndex(where: { $0.start <= playback.position }) else {
      return Copy.text("web.media.emptyChapters")
    }
    return Copy.text("web.media.chapterNumber").replacingOccurrences(
      of: "{number}", with: String(index + 1)) + " · " + card.chapters[index].title
  }
  private var compactPosition: String {
    let chapter =
      card.chapters.lastIndex(where: { $0.start <= playback.position }).map {
        Copy.text("web.media.chapterNumber").replacingOccurrences(
          of: "{number}", with: String($0 + 1)) + " · "
      } ?? ""
    return chapter + Format.duration(Int(playback.position)) + " / "
      + (playback.duration > 0
        ? Format.duration(Int(playback.duration)) : Copy.text("web.media.unknownDuration"))
  }
  private var primary: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space16) {
      if !card.isPodcast {
        source.frame(minHeight: AppleMetrics.space36, alignment: .leading)
          .padding(.bottom, -AppleMetrics.space10)
      }
      if card.isPodcast {
        CoverImage(name: card.image).frame(
          width: full ? AppleMetrics.playerArtSize : AppleMetrics.playerArtSize * 0.8,
          height: full ? AppleMetrics.playerArtSize : AppleMetrics.playerArtSize * 0.8
        )
        .background(AppleColors.surface).clipShape(
          RoundedRectangle(cornerRadius: AppleMetrics.coverRadius)
        )
        .frame(maxWidth: .infinity)
      }
      Text(card.title).font(
        .sans(
          card.isPodcast
            ? (full ? AppleMetrics.previewTitle : AppleMetrics.font22) : AppleMetrics.previewTitle,
          .semibold)
      )
      .multilineTextAlignment(card.isPodcast ? .center : .leading)
      .frame(maxWidth: .infinity, alignment: card.isPodcast ? .center : .leading)
      if card.isPodcast {
        source.frame(maxWidth: .infinity)
      } else {
        ReaderTags(tags: state.tags(of: card))
      }
      if card.isPodcast {
        HStack(spacing: AppleMetrics.space6) {
          Icon("list", size: AppleMetrics.font14)
          Text(
            chapterLabel
          )
        }.foregroundStyle(AppleColors.secondary)
          .font(.sans(AppleMetrics.font12))
          .padding(.horizontal, AppleMetrics.space12).padding(.vertical, AppleMetrics.space6)
          .background(Capsule().fill(AppleColors.surface)).frame(maxWidth: .infinity)
      }
      if card.isPodcast {
        audioControls.disabled(!available)
        if !available {
          Text(Copy.text("web.media.playbackUnavailable")).foregroundStyle(AppleColors.secondary)
        }
      } else if !card.isPodcast, let id = OfficialVideoPlayer.videoID(card.url) {
        OfficialVideoPlayer(
          videoID: id, initialPosition: state.playbackPosition, playback: playback, save: save
        )
        .aspectRatio(16 / 9, contentMode: .fit).frame(minHeight: AppleMetrics.mediaPlayerMinHeight)
        // The cover stands in until the official player is ready, so a slow or blocked embed never shows an empty box.
        .overlay { if !playback.videoReady { videoPoster } }
        .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.coverRadius))
      } else {
        ZStack {
          CoverImage(name: card.image)
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
        Text(Copy.text("web.media.playbackUnavailable")).foregroundStyle(AppleColors.secondary)
      }
      if full, !card.isPodcast {
        MediaChapters(
          chapters: card.chapters, duration: playback.duration, position: playback.position,
          seek: playback.seek
        ).disabled(!available)
      }
    }.padding(.horizontal, card.isPodcast && full ? AppleMetrics.space64 : 0)
      .padding(.top, card.isPodcast ? AppleMetrics.space32 : 0)
      .onGeometryChange(for: CGFloat.self) {
        $0.size.height
      } action: {
        primaryHeight = $0
      }
  }

  private var source: some View {
    MetaRow(icon: AnyView(SourceIcon(card: card))) {
      Text(
        [
          card.publicationName, card.publication.date ?? "",
          card.isPodcast ? "" : card.duration.map(Format.duration) ?? "",
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
      tabButton("summary", card.isPodcast ? "web.media.notes" : "web.media.summary")
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
                    Text(Format.duration(Int(line.start))).font(.number(AppleMetrics.font13))
                    Text(line.text).frame(maxWidth: .infinity, alignment: .leading)
                  }.padding(AppleMetrics.space8)
                    .background(index == active ? AppleColors.accentSoft : Color.clear)
                }.buttonStyle(.plain).disabled(!available).id(index)
              }
            }
          }.frame(maxHeight: AppleMetrics.previewMaxHeight / 2)
            .background(TranscriptScrollIntent { follow = false })
            .onChange(of: active) { _, index in
              if follow, let index { proxy.scrollTo(index, anchor: .center) }
            }
        }
      }
    }
  }
  private var videoPoster: some View {
    ZStack {
      CoverImage(name: card.image)
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
    let layout =
      full
      ? AnyLayout(HStackLayout(alignment: .top, spacing: AppleMetrics.space32))
      : AnyLayout(VStackLayout(alignment: .leading, spacing: AppleMetrics.space16))
    layout {
      if full {
        ScrollView { primary.padding(.bottom, AppleMetrics.space32) }
          .frame(maxWidth: .infinity, maxHeight: availableHeight)
          .background(card.isPodcast ? Cover.tone(card.image).opacity(0.25) : Color.clear)
          .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.coverRadius))
        ScrollView { secondary }.frame(maxWidth: .infinity, maxHeight: availableHeight)
      } else if card.isPodcast {
        // The pinned section owns space above the transcript. Its hidden player space overlaps
        // only the full player's last rows, then replaces them when the section reaches the top.
        LazyVStack(
          alignment: .leading, spacing: AppleMetrics.space16, pinnedViews: [.sectionHeaders]
        ) {
          primary.frame(maxWidth: .infinity)
            .opacity(compact ? 0 : 1).allowsHitTesting(!compact).accessibilityHidden(compact)
            .padding(.bottom, -stickyPlayerHeight - AppleMetrics.space16)
          Section {
            secondary.frame(
              maxWidth: .infinity,
              minHeight: max(
                0,
                (availableHeight ?? 792) - stickyPlayerHeight
                  - AppleMetrics.space44 - AppleMetrics.space32 - bottomRoom),
              alignment: .topLeading)
          } header: {
            VStack(spacing: AppleMetrics.space16) {
              compactControls
                .padding(.top, AppleMetrics.space64)
                .opacity(compact ? 1 : 0).allowsHitTesting(compact).accessibilityHidden(!compact)
              tabHeader
            }
            .background(compact ? AppleColors.card : Color.clear)
          }
        }
      } else {
        primary.frame(maxWidth: .infinity)
        secondary.frame(maxWidth: .infinity, alignment: .topLeading)
      }
    }
    .font(.sans(AppleMetrics.font15)).foregroundStyle(AppleColors.primary)
    .onAppear {
      if card.isPodcast || full { tab = "transcript" }
      playback.position = state.playbackPosition
      playback.duration = Double(card.duration ?? 0)
      if card.isPodcast, let url = card.audioURL {
        playback.start(url: url, position: state.playbackPosition, save: save)
      }
    }
    .onDisappear { playback.stop() }
  }
  private var stickyPlayerHeight: CGFloat {
    AppleMetrics.space64 + AppleMetrics.space44 + AppleMetrics.space24
      + AppleMetrics.space4 + AppleMetrics.space3
  }
  private var compact: Bool {
    primaryHeight > 0 && scrollOffset > 0
      && scrollOffset >= primaryHeight + AppleMetrics.previewPaddingTop - stickyPlayerHeight - 1
  }
  private var compactControls: some View {
    VStack(spacing: AppleMetrics.space4) {
      HStack(spacing: AppleMetrics.space12) {
        CoverImage(name: card.image).frame(
          width: AppleMetrics.space44, height: AppleMetrics.space44
        )
        .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.space8))
        Button(action: returnToPlayer) {
          VStack(alignment: .leading, spacing: AppleMetrics.space4) {
            Text(card.title).lineLimit(1)
            Text(compactPosition).font(.number(AppleMetrics.font12)).foregroundStyle(
              AppleColors.secondary
            ).lineLimit(1)
          }.frame(maxWidth: .infinity, alignment: .leading)
        }
        Button {
          playback.seek(playback.position - 15)
        } label: {
          Icon("rewind15")
        }.disabled(!available).frame(width: AppleMetrics.space44, height: AppleMetrics.space44)
          .accessibilityLabel(Copy.text("web.preview.podcast.rewind15"))
        Button {
          playback.toggle()
        } label: {
          Icon(playback.playing ? "pause" : "play")
            .frame(
              width: AppleMetrics.space40,
              height: AppleMetrics.space40
            )
            .foregroundStyle(AppleColors.fixedWhite).background(Circle().fill(AppleColors.accent))
        }.disabled(!available).accessibilityLabel(
          Copy.text(playback.playing ? "web.media.pause" : "web.media.play"))
      }.padding(AppleMetrics.space12)
      PlaybackTrack(position: playback.position, duration: playback.duration)
        .frame(height: AppleMetrics.space3)
    }.buttonStyle(.plain).background(AppleColors.card)
      .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.space14))
  }
  private var audioControls: some View {
    VStack(spacing: AppleMetrics.space12) {
      PlaybackScrubber(
        position: playback.position, duration: playback.duration, seek: playback.seek
      )
      .disabled(playback.duration <= 0)
      HStack {
        Text(Format.duration(Int(playback.position)))
        Spacer()
        Text(
          playback.duration > 0
            ? "−" + Format.duration(Int(max(0, playback.duration - playback.position)))
            : Copy.text("web.media.unknownDuration"))
      }
      .font(.number(AppleMetrics.font13))
      HStack(spacing: AppleMetrics.space12) {
        Button("\(playback.rate.formatted(.number.precision(.fractionLength(1...2))))×") {
          playback.changeRate()
        }.accessibilityLabel(
          Copy.text("web.media.rate")
        ).frame(width: AppleMetrics.space44, height: AppleMetrics.space44)
        Button {
          playback.seek(playback.position - 15)
        } label: {
          Icon("rewind15")
        }.frame(width: AppleMetrics.space44, height: AppleMetrics.space44)
          .accessibilityLabel(Copy.text("web.preview.podcast.rewind15"))
        Button {
          playback.toggle()
        } label: {
          Icon(playback.playing ? "pause" : "play")
            .frame(
              width: full ? AppleMetrics.space72 : AppleMetrics.space60,
              height: full ? AppleMetrics.space72 : AppleMetrics.space60
            )
            .foregroundStyle(AppleColors.fixedWhite).background(Circle().fill(AppleColors.accent))
        }.accessibilityLabel(Copy.text(playback.playing ? "web.media.pause" : "web.media.play"))
        Button {
          playback.seek(playback.position + 30)
        } label: {
          Icon("forward30")
        }.frame(width: AppleMetrics.space44, height: AppleMetrics.space44)
          .accessibilityLabel(Copy.text("web.preview.podcast.forward30"))
        Color.clear.frame(width: AppleMetrics.space44, height: AppleMetrics.space44)
      }.buttonStyle(.plain).frame(maxWidth: .infinity)
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

/// The same flat progress track used by the HTML player, without a system bezel.
private struct PlaybackTrack: View {
  let position: Double
  let duration: Double
  var body: some View {
    GeometryReader { geometry in
      ZStack(alignment: .leading) {
        Capsule().fill(AppleColors.lineHover)
        Capsule().fill(AppleColors.primary)
          .frame(width: geometry.size.width * min(1, max(0, position / max(1, duration))))
      }
    }
  }
}

private struct PlaybackScrubber: View {
  let position: Double
  let duration: Double
  let seek: (Double) -> Void
  @Environment(\.isEnabled) private var enabled
  var body: some View {
    GeometryReader { geometry in
      let trackWidth = max(1, geometry.size.width - AppleMetrics.space12)
      ZStack(alignment: .leading) {
        PlaybackTrack(position: position, duration: duration)
          .frame(height: AppleMetrics.space4).padding(.horizontal, AppleMetrics.space6)
        Circle().fill(AppleColors.primary).frame(
          width: AppleMetrics.space12, height: AppleMetrics.space12
        )
        .offset(x: trackWidth * min(1, max(0, position / max(1, duration))))
      }.frame(height: AppleMetrics.space44)
        .contentShape(Rectangle())
        .gesture(
          DragGesture(minimumDistance: 0).onChanged { value in
            if enabled {
              seek(
                min(
                  duration, max(0, (value.location.x - AppleMetrics.space6) / trackWidth * duration)
                ))
            }
          })
    }.frame(height: AppleMetrics.space44)
      .accessibilityElement()
      .accessibilityLabel(Copy.text("web.media.position"))
      .accessibilityValue(Format.duration(Int(position)))
      .accessibilityAdjustableAction { direction in
        guard enabled else { return }
        switch direction {
        case .increment: seek(min(duration, position + 15))
        case .decrement: seek(max(0, position - 15))
        @unknown default: break
        }
      }
  }
}

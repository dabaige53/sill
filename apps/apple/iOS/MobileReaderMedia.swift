#if os(iOS)
  import SillKit
  import SwiftUI

  extension MobileReader {
    func media(_ card: MobileCard) -> some View {
      MobileReaderMediaView(
        card: card, layer: layer, playback: playback, active: isActive,
        topInset: layer.full ? safeArea.top + AppleMetrics.space64 : AppleMetrics.space56,
        textScale: readerScale, bodyScale: readerBodyScale, strong: strongText,
        spacing: readerSpacing,
        openRelated: { id, full in
          relatedFull = full
          relatedID = id
        }, cardExists: { workspace.card($0) != nil },
        save: { position, ended in savePlayback(position, ended: ended) })
    }

    func savePlayback(_ position: Double, ended: Bool) {
      guard position.isFinite, owner == workspace.owner, let current = workspace.card(cardID) else {
        return
      }
      Task { _ = await workspace.recordPlayback(current, position: position, ended: ended) }
    }
  }

  /// The primary remains in the flow while its compact controls blend over the scroll viewport.
  struct MobileReaderMediaView: View {
    let card: MobileCard
    let layer: MobileReaderLayer
    let playback: MediaPlayback
    let active: Bool
    let topInset: CGFloat
    let textScale: CGFloat
    let bodyScale: CGFloat
    let strong: Bool
    let spacing: CGFloat
    let openRelated: (String, Bool) -> Void
    let cardExists: (String) -> Bool
    let save: (Double, Bool) -> Void
    @ScaledMetric(relativeTo: .body) private var dynamicScale: CGFloat = 1
    @State private var primaryBottom: CGFloat = 0
    @State private var mediaTop: CGFloat = 0
    @State private var mounted = false
    @State private var initialized = false
    @State private var playRequested = false
    private var podcast: Bool { card.raw["media"]?.string == "podcast" }
    private var available: Bool {
      podcast ? card.audioURL != nil : MobileOfficialVideoPlayer.videoID(card.url) != nil
    }
    private var blend: CGFloat {
      guard podcast, !layer.full, primaryBottom > 0, layer.scrollOffset > 0 else { return 0 }
      return min(
        1,
        max(
          0,
          (layer.scrollOffset + topInset - primaryBottom + compactHeight * 2)
            / compactHeight))
    }
    private var compactHeight: CGFloat { AppleMetrics.space44 + AppleMetrics.space24 }
    private var duration: Double {
      playback.duration > 0 ? playback.duration : card.raw["duration"]?.number ?? 0
    }
    private var chapterLabel: String {
      let chapters = card.raw["chapters"]?.array ?? []
      guard
        let index = chapters.lastIndex(where: { ($0["start"]?.number ?? 0) <= playback.position })
      else {
        return Copy.text("web.media.emptyChapters")
      }
      return Copy.text("web.media.chapterNumber").replacingOccurrences(
        of: "{number}", with: "\(index + 1)")
        + " · " + (chapters[index]["title"]?.string ?? "")
    }

    var body: some View {
      VStack(alignment: .leading, spacing: AppleMetrics.space16 * spacing) {
        primary
          .opacity(1 - blend)
          .allowsHitTesting(blend < 0.5)
          .accessibilityHidden(blend >= 0.5)
          .background {
            GeometryReader { geometry in
              Color.clear.preference(
                key: MobileMediaGeometry.self,
                value: [
                  "bottom": geometry.frame(in: .named("mobile-reader-content")).maxY,
                  "top": geometry.frame(in: .named("mobile-reader-content")).minY,
                ])
            }
          }
        MobileMediaTabs(
          card: card, playback: playback, available: available,
          height: max(
            AppleMetrics.space220,
            layer.viewport - topInset - compactHeight - AppleMetrics.space44),
          textScale: bodyScale, strong: strong, spacing: spacing, openRelated: openRelated,
          cardExists: cardExists,
          headerOffset: podcast && !layer.full
            ? max(
              0,
              layer.scrollOffset + topInset + compactHeight - primaryBottom - AppleMetrics
                .space16 * spacing) : 0)
        if let url = card.url {
          Link(Copy.text("web.media.sourceOpen"), destination: url)
            .font(.system(size: AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
        }
      }
      .onPreferenceChange(MobileMediaGeometry.self) { value in
        primaryBottom = value["bottom"] ?? 0
        mediaTop = value["top"] ?? 0
      }
      .overlay(alignment: .top) {
        if podcast && !layer.full {
          compact
            .padding(.horizontal, -AppleMetrics.space20)
            .offset(
              y: max(0, layer.scrollOffset + topInset - mediaTop) - AppleMetrics.space8
                * (1 - blend)
            )
            .opacity(blend)
            .allowsHitTesting(blend > 0.5 && active)
            .accessibilityHidden(blend < 0.5)
        }
      }
      .onChange(of: layer.settled, initial: true) { _, settled in
        guard settled else { return }
        mounted = true
        startAudio()
      }
      .onChange(of: active) { _, active in
        if active && mounted { startAudio() } else { playback.stop() }
      }
      .onDisappear { playback.stop() }
    }

    private var primary: some View {
      VStack(alignment: .leading, spacing: AppleMetrics.space16 * spacing) {
        if !podcast {
          source.frame(minHeight: AppleMetrics.space36, alignment: .leading)
            .padding(
              .trailing, layer.full ? 0 : AppleMetrics.hitTarget * 2 + AppleMetrics.railInset * 2)
        }
        if podcast {
          MobileCoverImage(source: card.raw["image"]?.string)
            .frame(
              width: layer.full ? AppleMetrics.playerArtSize : AppleMetrics.compactMinWidth,
              height: layer.full ? AppleMetrics.playerArtSize : AppleMetrics.compactMinWidth
            )
            .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.coverRadius))
            .frame(maxWidth: .infinity)
        }
        Text(card.title)
          .font(
            MobileContentStyle.font(
              layer.full ? AppleMetrics.mobileReaderTitle : AppleMetrics.space24,
              weight: .semibold, scale: textScale * dynamicScale, strong: strong)
          )
          .multilineTextAlignment(podcast ? .center : .leading)
          .frame(maxWidth: .infinity, alignment: podcast ? .center : .leading)
          .accessibilityAddTraits(.isHeader)
        if podcast {
          source.frame(maxWidth: .infinity)
          HStack(spacing: AppleMetrics.space6) {
            MobileIcon("list", size: AppleMetrics.space14)
            Text(chapterLabel).lineLimit(1)
          }.font(.system(size: AppleMetrics.font12)).foregroundStyle(AppleColors.secondary)
            .padding(.horizontal, AppleMetrics.space12).padding(.vertical, AppleMetrics.space6)
            .background(AppleColors.surface, in: Capsule()).frame(maxWidth: .infinity)
          MobileAudioControls(
            playback: playback, duration: duration, available: available,
            large: layer.full
          )
        } else {
          if !card.tags.isEmpty {
            MobileReaderTags(tags: card.tags, scale: textScale, strong: strong)
          }
          video
        }
        if playback.failed {
          VStack(alignment: .leading, spacing: AppleMetrics.space8) {
            Text(Copy.text(podcast ? "web.media.playbackFailed" : "web.media.playbackUnavailable"))
              .foregroundStyle(AppleColors.secondary)
            Button(Copy.text("web.retry")) {
              if podcast {
                playback.toggle()
              } else {
                playRequested = true
                playback.retryVideo?()
              }
            }.buttonStyle(MobilePressStyle()).foregroundStyle(AppleColors.accent)
          }.font(.system(size: AppleMetrics.font13))
        }
      }.padding(.top, podcast ? AppleMetrics.space32 : 0)
    }

    private var source: some View {
      HStack(spacing: AppleMetrics.space6) {
        MobileSourceMark(card: card, size: AppleMetrics.space16)
        Text(
          [
            card.publicationName, card.presentationDate,
            podcast ? "" : (duration > 0 ? MobileFormat.duration(Int(duration)) : ""),
          ]
          .filter { !$0.isEmpty }.joined(separator: " · ")
        )
        .font(
          MobileContentStyle.font(
            AppleMetrics.font13, scale: textScale * dynamicScale, strong: strong))
      }.foregroundStyle(AppleColors.secondary)
    }

    private var video: some View {
      ZStack {
        if mounted, let id = MobileOfficialVideoPlayer.videoID(card.url) {
          MobileOfficialVideoPlayer(
            videoID: id, initialPosition: card.playbackPosition,
            playback: playback, active: active, playRequested: playRequested, save: save)
        }
        if !playback.videoReady || !mounted {
          ZStack {
            MobileCoverImage(source: card.raw["image"]?.string)
            AppleColors.fixedBlack18
            Button {
              playRequested = true
            } label: {
              MobileIcon("play", size: AppleMetrics.space24)
                .frame(width: AppleMetrics.space56, height: AppleMetrics.space56)
                .foregroundStyle(AppleColors.fixedWhite).background(
                  .ultraThinMaterial, in: Circle())
            }.buttonStyle(MobilePressStyle()).disabled(!available)
              .accessibilityLabel(Copy.text("web.media.play"))
            VStack {
              Spacer()
              HStack {
                Text(
                  MobileFormat.duration(Int(playback.position)) + " / "
                    + (duration > 0
                      ? MobileFormat.duration(Int(duration))
                      : Copy.text("web.media.unknownDuration")))
                Spacer()
                if available { Text(Copy.text("web.media.youtubePlayer")) }
              }.font(.system(size: AppleMetrics.font12)).foregroundStyle(AppleColors.fixedWhite)
                .padding(AppleMetrics.space12)
            }
          }
        }
      }.aspectRatio(16 / 9, contentMode: .fit)
        .frame(minHeight: AppleMetrics.mediaPlayerMinHeight)
        .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.coverRadius))
    }

    private var compact: some View {
      VStack(spacing: 0) {
        HStack(spacing: AppleMetrics.space12) {
          Button {
            layer.scrollTo("reader-top")
          } label: {
            HStack(spacing: AppleMetrics.space12) {
              MobileCoverImage(source: card.raw["image"]?.string)
                .frame(width: AppleMetrics.space44, height: AppleMetrics.space44)
                .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.controlRadius))
              VStack(alignment: .leading, spacing: AppleMetrics.space2) {
                Text(card.title).font(.system(size: AppleMetrics.font13, weight: .semibold))
                  .lineLimit(1)
                Text(
                  MobileFormat.duration(Int(playback.position)) + " / "
                    + (duration > 0
                      ? MobileFormat.duration(Int(duration))
                      : Copy.text("web.media.unknownDuration"))
                )
                .font(.system(size: AppleMetrics.font12, design: .rounded)).foregroundStyle(
                  AppleColors.secondary)
              }.frame(maxWidth: .infinity, alignment: .leading)
            }
          }.buttonStyle(MobilePressStyle())
          Button {
            playback.seek(playback.position - 15)
          } label: {
            MobileIcon("rewind15", size: AppleMetrics.space20).frame(
              width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
          }.buttonStyle(MobilePressStyle()).disabled(!available).accessibilityLabel(
            Copy.text("web.preview.podcast.rewind15"))
          Button {
            playback.toggle()
          } label: {
            MobileIcon(playback.playing ? "pause" : "play", size: AppleMetrics.space20)
              .foregroundStyle(AppleColors.fixedWhite).frame(
                width: AppleMetrics.space40, height: AppleMetrics.space40
              )
              .background(AppleColors.accent, in: Circle())
          }.buttonStyle(MobilePressStyle()).disabled(!available)
            .accessibilityLabel(Copy.text(playback.playing ? "web.media.pause" : "web.media.play"))
        }.frame(height: compactHeight - AppleMetrics.space3).padding(
          .horizontal, AppleMetrics.space20)
        GeometryReader { geometry in
          Rectangle().fill(AppleColors.accent)
            .frame(
              width: geometry.size.width * min(1, max(0, playback.position / max(1, duration))))
        }.frame(height: AppleMetrics.space3).background(AppleColors.line)
      }.background(AppleColors.card)
        .overlay(alignment: .bottom) {
          LinearGradient(
            colors: [AppleColors.card, AppleColors.card.opacity(0)], startPoint: .top,
            endPoint: .bottom
          )
          .frame(height: AppleMetrics.space16).offset(y: AppleMetrics.space16).allowsHitTesting(
            false)
        }
    }

    private func startAudio() {
      guard active, podcast, let url = card.audioURL else { return }
      let position = initialized ? playback.position : card.playbackPosition
      initialized = true
      playback.start(url: url, position: position, save: save)
    }
  }

  private struct MobileMediaGeometry: PreferenceKey {
    static let defaultValue: [String: CGFloat] = [:]
    static func reduce(value: inout [String: CGFloat], nextValue: () -> [String: CGFloat]) {
      value.merge(nextValue(), uniquingKeysWith: { _, new in new })
    }
  }
#endif

import SillKit
import SwiftUI

/// The preview: the card lifts into a sheet. Its round discs float over the source row, the
/// glass toolbar floats inside the bottom edge over a soft fade, and the height follows the
/// content up to 88% of the window (at most 900).
struct PreviewSheet: View {
  let card: CardModel
  let state: CardState
  let layer: Reader.Layer
  let below: CardModel?
  let size: CGSize
  @Environment(Reader.self) private var reader
  @Environment(Workspace.self) private var workspace
  let scroll: ReaderScroll
  @State private var contentHeight: CGFloat = 0
  @State private var firstRow: CGFloat = 0

  private var narrowDetail: Bool {
    [.media, .suggestion, .reminder].contains(card.kind) || (card.kind == .note && card.shortDetail)
  }

  private var expandable: Bool { Reader.canExpand(card) }
  private var expandedWorkspace: Bool { card.kind == .media || card.kind == .article }
  private var bottomRoom: CGFloat {
    layer.full
      ? (expandedWorkspace ? AppleMetrics.space24 : AppleMetrics.space160)
      : AppleMetrics.railRow + AppleMetrics.space40
  }

  var body: some View {
    let width =
      layer.full
      ? size.width
      : min(
        card.kind == .media
          ? AppleMetrics.mediaPreviewWidth
          : narrowDetail ? AppleMetrics.compactReaderWidth : AppleMetrics.previewWidth,
        size.width - AppleMetrics.previewMargin)
    let maxHeight = min(
      size.height * AppleMetrics.previewHeightRatio, AppleMetrics.previewMaxHeight)
    // A card may open directly in full mode. Its first preview measurement must not
    // collapse the already visible surface to one point or hide it for a frame.
    let height =
      layer.full ? size.height : (contentHeight > 0 ? min(maxHeight, contentHeight) : maxHeight)
    let target = CGRect(
      x: (size.width - width) / 2,
      y: (size.height - height) / 2,
      width: width, height: height)
    let tools = ReaderTools.actions(
      card: card, state: state, hidden: workspace.preferences.hiddenActions)
    let barRoom =
      tools.isEmpty
      ? AppleMetrics.previewPaddingX
      : AppleMetrics.railRow + (narrowDetail ? AppleMetrics.space24 : AppleMetrics.space40)
    VStack(spacing: 0) {
      if let below, !layer.full {
        Button {
          reader.close()
        } label: {
          UnevenRoundedRectangle(
            topLeadingRadius: AppleMetrics.sheetRadius, topTrailingRadius: AppleMetrics.sheetRadius
          )
          .fill(AppleColors.readCard)
          .overlay(
            UnevenRoundedRectangle(
              topLeadingRadius: AppleMetrics.sheetRadius,
              topTrailingRadius: AppleMetrics.sheetRadius
            ).strokeBorder(AppleColors.lineCard, lineWidth: AppleMetrics.lineWidth)
          )
          .shadow(.sheet)
          .frame(width: width * AppleMetrics.sheetPeekWidth, height: AppleMetrics.space44)
        }
        .buttonStyle(.plain)
        .padding(.bottom, -AppleMetrics.space46)
        .accessibilityLabel(Copy.text("web.peekBack") + below.title)
      }
      ReaderPage(
        card: card, state: state, layer: layer, scroll: scroll,
        content:
          ScrollView(.vertical) {
            ReaderContent(
              card: card, state: state, type: layer.full ? .page : .preview,
              discRoom: layer.full ? 0 : discRoom,
              mediaWidth: layer.full ? size.width - 2 * AppleMetrics.readerPageGutter : nil,
              mediaHeight: layer.full
                ? max(
                  AppleMetrics.mediaPlayerMinHeight,
                  size.height - AppleMetrics.space64 - AppleMetrics.space40)
                : maxHeight,
              mediaBottomRoom: barRoom,
              mediaOffset: scroll.motion.scrollOffset,
              returnToPlayer: { scroll.scrollView?.documentView?.scroll(.zero) }
            )
            .modifier(DetailReveal())
            .padding(
              .top,
              layer.full
                ? (expandedWorkspace ? AppleMetrics.space16 : 0) : AppleMetrics.previewPaddingTop
            )
            .padding(
              .horizontal,
              layer.full
                ? 0
                : (card.kind == .article
                  ? AppleMetrics.articleGutter : AppleMetrics.previewPaddingX)
            )
            .padding(.bottom, layer.full ? bottomRoom : barRoom)
            .frame(maxWidth: workspace.preferences.readerWidth.width)
            .frame(maxWidth: .infinity)
            .onGeometryChange(for: CGFloat.self) {
              $0.size.height
            } action: { value in
              if !layer.full { contentHeight = value }
            }
            .background(ReaderScrollProbe(scroll: scroll))
            .modifier(ReaderPullOffset(motion: scroll.motion))
          }
          .scrollIndicators(.hidden)
          .coordinateSpace(name: "media-scroll")
          .coordinateSpace(name: "article-reading")
          .onPreferenceChange(FirstRowHeight.self) { firstRow = $0 }
      )
      .frame(width: width, height: height)
      .background {
        AppleColors.card.overlay(
          card.isPodcast ? Cover.tone(card.cover).opacity(0.15) : Color.clear)
      }
      .overlay(alignment: .top) { if !layer.full { TopFade(motion: scroll.motion) } }
      .overlay(alignment: .bottom) {
        if !layer.full, !tools.isEmpty { BottomFade(motion: scroll.motion) }
      }
      .overlay(alignment: .top) {
        if !layer.full {
          HeadDiscs(
            motion: scroll.motion,
            firstRow: card.kind == .article && card.cover != nil ? AppleMetrics.space44 : firstRow,
            expand: expandable ? { reader.open(card.id, full: true) } : nil,
            close: { reader.close() }
          )
          .modifier(DetailReveal(tools: true))
        }
      }
      .overlay(alignment: .bottom) {
        if !layer.full {
          ZStack(alignment: .bottom) {
            if !tools.isEmpty {
              ReaderToolbar(card: card, state: state, actions: tools)
                .modifier(ReaderToolsTuck(motion: scroll.motion))
                .padding(.bottom, AppleMetrics.previewBarBottom)
                .modifier(DetailReveal(tools: true))
            }
            // Web `.push-ring`: 24 above the bottom edge, where the toolbar was. The check returns
            // with the surface and its spring instead of fading out ahead of it.
            FinishRing(motion: scroll.motion)
              .padding(.bottom, AppleMetrics.space24)
          }
        }
      }
      // Close, fullscreen and the toolbar belong to the surface that grows out of the card.
      .modifier(
        CardGeometryDestination(
          id: card.id, target: target, ready: layer.full || contentHeight > 0)
      )

    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .modifier(ReaderSurfaceOffset(motion: scroll.motion))
    .onAppear { configure() }
    .onChange(of: layer.full) {
      scroll.cancelGesture()
      scroll.interruptDwell()
      scroll.trailing = bottomRoom
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier(layer.full ? "reader-full" : "reader-preview")
    .onAppear { PerformanceTrace.shared.event(.viewAppeared) }
    .accessibilityLabel(card.title)
    .accessibilityAddTraits(.isModal)
  }

  /// The discs sit over the source row, so the title keeps the whole width.
  private var discRoom: CGFloat { expandable ? AppleMetrics.space92 : AppleMetrics.space48 }

  private func configure() {
    scroll.initialOffset = reader.positions[layer.id] ?? 0
    scroll.initialProgress =
      layer.full && reader.positions[layer.id] == nil && state.progress < 0.98
      ? state.progress : nil
    scroll.trailing = bottomRoom
    scroll.finishEnabled =
      card.kind != .media && card.kind.readable && !card.body.isEmpty
      && workspace.preferences.collapseOnFinish
    let id = card.id
    let layerID = layer.id
    scroll.offsetChanged = { [weak reader] offset in reader?.positions[layerID] = offset }
    scroll.progressChanged = { [weak workspace, weak reader] value in
      guard reader?.sessionActive == true else { return }
      if card.kind != .media { workspace?.recorder.read(id, progress: value) }
    }
    scroll.reachedEnd = { [weak reader] in
      if card.kind != .media && card.kind.readable { reader?.reachedEnd(id) }
    }
    scroll.finished = { [weak reader] done in
      reader?.reachedEnd(id, completion: done) ?? done(false)
    }
    scroll.close = { [weak reader] in reader?.close() }
  }
}

/// Close and fullscreen: glass discs (36, hit 44) centered on the first row; at the top once scrolled.
struct HeadDiscs: View {
  let motion: ReaderMotion
  let firstRow: CGFloat
  var expand: (() -> Void)?
  let close: () -> Void
  var body: some View {
    let center = AppleMetrics.previewPaddingTop + max(firstRow, AppleMetrics.cardHeadHeight) / 2
    HStack(spacing: AppleMetrics.space8) {
      Spacer(minLength: 0)
      DesktopGlassGroup {
        HStack(spacing: AppleMetrics.space8) {
          if let expand {
            Disc(icon: "expand", label: Copy.text("web.preview.fullscreen"), action: expand)
          }
          Disc(icon: "x", label: Copy.text("web.preview.close"), action: close)
        }
      }
    }
    .padding(.horizontal, AppleMetrics.space16)
    .padding(.top, center - AppleMetrics.previewDisc / 2)
    .modifier(ReaderToolsTuck(motion: motion, top: true))
  }
}

struct Disc: View {
  let icon: String
  let label: String
  let action: () -> Void
  var body: some View {
    Button(action: action) {
      Icon(icon, size: AppleMetrics.previewDiscIcon)
        .foregroundStyle(AppleColors.primary)
        .frame(width: AppleMetrics.previewDisc, height: AppleMetrics.previewDisc)
        .desktopGlass(Circle())
        .frame(width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
        .contentShape(Circle())
    }
    .buttonStyle(IconPress(highlight: false))
    .padding(-(AppleMetrics.hitTarget - AppleMetrics.previewDisc) / 2)
    .accessibilityLabel(label)
  }
}

/// Once the text has moved under the discs, a soft edge keeps the two apart.
struct TopFade: View {
  let motion: ReaderMotion
  var body: some View {
    LinearGradient(
      stops: [
        .init(color: AppleColors.card.opacity(AppleMetrics.headerEdgeOpacity), location: 0.3),
        .init(color: AppleColors.card.opacity(0), location: 1),
      ], startPoint: .top, endPoint: .bottom
    )
    .frame(height: AppleMetrics.headerEdgeHeight)
    .opacity(motion.scrolled && !motion.toolsHidden ? 1 : 0)
    .animation(Motion.state, value: motion.scrolled && !motion.toolsHidden)
    .allowsHitTesting(false)
  }
}

/// A short edge fade inside the card mask; the native capsule supplies its own material.
struct BottomFade: View {
  let motion: ReaderMotion
  var body: some View {
    LinearGradient(
      colors: [
        AppleColors.card.opacity(AppleMetrics.readerBottomFadeOpacity), AppleColors.card.opacity(0),
      ],
      startPoint: .bottom, endPoint: .top
    )
    .frame(height: AppleMetrics.readerBottomFadeHeight)
    .opacity(motion.toolsHidden ? 0 : 1)
    .allowsHitTesting(false)
  }
}

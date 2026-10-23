import AppKit
import SillKit
import SwiftUI

/// The fullscreen page: the whole window, card background, a 2px progress line at the top,
/// collapse and close in one glass group top right, all content fills the page with the same preview gutters.
struct ReaderPage: View {
  let card: CardModel
  let state: CardState
  let size: CGSize
  let layer: Reader.Layer
  @Environment(Reader.self) private var reader
  @Environment(Workspace.self) private var workspace
  let scroll: ReaderScroll
  @State private var outlineHidden = false
  @State private var currentHeading: Int?
  @Namespace private var outlineIndicator
  private var expandedWorkspace: Bool { card.kind == .media || card.kind == .article }
  private var headings: [(index: Int, block: MarkdownBody.Block)] {
    card.kind == .article
      ? card.markdown.blocks.enumerated().compactMap {
        $0.element.heading > 0 ? (index: $0.offset, block: $0.element) : nil
      } : []
  }

  var body: some View {
    let target = CGRect(origin: .zero, size: size)
    let tools = ReaderTools.actions(
      card: card, state: state, hidden: workspace.preferences.hiddenActions)
    ZStack(alignment: .top) {
      AppleColors.card
      ScrollViewReader { proxy in
        HStack(alignment: .top, spacing: AppleMetrics.space40) {
          if !headings.isEmpty && !outlineHidden {
            outline(proxy: proxy)
              .frame(width: AppleMetrics.readerOutlineWidth)
              .padding(.top, AppleMetrics.space24)
          }
          ScrollView(.vertical) {
            ReaderContent(
              card: card, state: state, type: .page,
              mediaWidth: size.width - 2 * AppleMetrics.previewPaddingX,
              mediaHeight: max(
                AppleMetrics.mediaPlayerMinHeight,
                size.height - AppleMetrics.space64 - AppleMetrics.space40)
            )
            .modifier(DetailReveal())
            .frame(maxWidth: workspace.preferences.readerWidth.width)
            .padding(.top, expandedWorkspace ? AppleMetrics.space16 : 0)
            .padding(.bottom, expandedWorkspace ? AppleMetrics.space24 : AppleMetrics.space160)
            .frame(maxWidth: .infinity)
            .background(ReaderScrollProbe(scroll: scroll))
            .modifier(ReaderPullOffset(motion: scroll.motion))
          }
          .scrollIndicators(.automatic)
          .coordinateSpace(name: "media-scroll")
          .coordinateSpace(name: "article-reading")
          .onPreferenceChange(ReaderHeadingPositions.self) { positions in
            let passed = headings.last {
              (positions[$0.index] ?? .infinity) <= AppleMetrics.space40
            }
            let view = scroll.scrollView
            let documentHeight = view?.documentView?.bounds.height ?? 0
            let viewport = view?.contentView.bounds ?? .zero
            let atEnd = documentHeight > viewport.height && viewport.maxY >= documentHeight - 1
            let selected = atEnd ? headings.last?.index : passed?.index ?? headings.first?.index
            if selected != currentHeading { currentHeading = selected }
          }
        }
        .padding(.horizontal, AppleMetrics.previewPaddingX)
        .padding(.top, expandedWorkspace ? AppleMetrics.space64 : AppleMetrics.space88)
      }
      if card.kind != .media {
        ReaderProgress(motion: scroll.motion)
          .modifier(DetailReveal(tools: true))
      }
      HStack(spacing: AppleMetrics.space2) {
        if !headings.isEmpty {
          ToolButton(
            icon: "list",
            label: Copy.text(outlineHidden ? "web.reader.showOutline" : "web.reader.hideOutline")
          ) {
            Motion.instantly { outlineHidden.toggle() }
          }
        }
        ToolButton(icon: "collapse", label: Copy.text("web.reader.exitFullscreen")) {
          reader.open(card.id, full: false)
        }
        ToolButton(icon: "x", label: Copy.text("web.reader.close")) { reader.closeAll() }
      }
      .padding(AppleMetrics.space4)
      .desktopGlass(Capsule())
      .accessibilityElement(children: .contain)
      .accessibilityLabel(Copy.text("web.readerTools"))
      .modifier(ReaderToolsTuck(motion: scroll.motion, top: true, enabled: !expandedWorkspace))
      .padding(.top, AppleMetrics.readerToolsTop)
      .padding(.trailing, AppleMetrics.readerToolsRight)
      .frame(maxWidth: .infinity, alignment: .trailing)
      .modifier(DetailReveal(tools: true))
      if expandedWorkspace && !tools.isEmpty {
        ReaderToolbar(card: card, state: state, actions: tools, top: true)
          .padding(.leading, AppleMetrics.space16)
          .padding(.top, AppleMetrics.space4)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      VStack(spacing: AppleMetrics.space12) {
        Spacer(minLength: 0)
        // The check returns with the surface and its spring instead of fading out ahead of it.
        FinishRing(motion: scroll.motion)
        if !expandedWorkspace && !tools.isEmpty {
          ReaderToolbar(card: card, state: state, actions: tools)
            .modifier(ReaderToolsTuck(motion: scroll.motion))
            .modifier(DetailReveal(tools: true))
        }
      }
      .padding(.bottom, AppleMetrics.readerBarBottom)
    }
    // The page and its tools grow out of the card as one surface.
    .modifier(CardGeometryDestination(id: card.id, target: target))
    .ignoresSafeArea()
    .modifier(ReaderSurfaceOffset(motion: scroll.motion))
    .onAppear { configure() }
    .task { await countReadingTime() }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(card.title)
    .accessibilityAddTraits(.isModal)
  }

  private func outline(proxy: ScrollViewProxy) -> some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 0) {
        Text(Copy.text("web.reader.outline"))
          .font(.sans(AppleMetrics.font15, .medium))
          .foregroundStyle(AppleColors.primary)
          .padding(.bottom, AppleMetrics.space12)
        ForEach(headings, id: \.index) { heading in
          let selected = (currentHeading ?? headings.first?.index) == heading.index
          Button {
            let jump = { proxy.scrollTo("reader-section-\(heading.index)", anchor: .top) }
            if Motion.keyboardDriven {
              Motion.instantly(jump)
            } else {
              withAnimation(Motion.layout, jump)
            }
          } label: {
            Text(heading.block.text)
              .font(.sans(AppleMetrics.font14, selected ? .semibold : .regular))
              .foregroundStyle(selected ? AppleColors.accent : AppleColors.secondary)
              .multilineTextAlignment(.leading)
              .fixedSize(horizontal: false, vertical: true)
              .padding(
                .leading,
                AppleMetrics.space12
                  * CGFloat(
                    1
                      + min(
                        2, heading.block.heading - (headings.map { $0.block.heading }.min() ?? 1)))
              )
              .padding(.trailing, AppleMetrics.space12)
              .padding(.vertical, AppleMetrics.space8)
              .frame(maxWidth: .infinity, minHeight: AppleMetrics.space44, alignment: .leading)
              .overlay(alignment: .leading) {
                if selected {
                  Capsule().fill(AppleColors.accent)
                    .frame(width: AppleMetrics.space2, height: AppleMetrics.space20)
                    .matchedGeometryEffect(id: "outline", in: outlineIndicator)
                }
              }
          }.buttonStyle(.plain)
            .accessibilityAddTraits(selected ? .isSelected : [])
        }
      }
      .animation(Motion.keyboardDriven ? nil : Motion.layout, value: currentHeading)
    }.accessibilityLabel(Copy.text("web.reader.outline"))
  }

  private func configure() {
    scroll.initialOffset = card.kind == .media ? 0 : reader.positions[layer.id] ?? 0
    scroll.trailing = expandedWorkspace ? AppleMetrics.space24 : AppleMetrics.space160
    scroll.finishEnabled =
      card.kind != .media && card.kind.readable && !card.body.isEmpty
      && workspace.preferences.collapseOnFinish
    let id = card.id
    let layerID = layer.id
    scroll.offsetChanged = { [weak reader] offset in
      if card.kind != .media { reader?.positions[layerID] = offset }
    }
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

  /// Web: one second per second while the page is open, the app is in front and there was input
  /// within the last minute. Counted in the recorder only; written when the reader closes.
  private func countReadingTime() async {
    let anyInput = CGEventType(rawValue: ~0)!
    while !Task.isCancelled {
      try? await Task.sleep(for: .seconds(1))
      guard !Task.isCancelled, reader.sessionActive else { return }
      let idle = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: anyInput)
      if NSApp.isActive, idle < 60 { workspace.recorder.readingSecond() }
    }
  }
}

/// The 2px reading line. Only this view observes the per-frame progress.
private struct ReaderProgress: View {
  let motion: ReaderMotion
  var body: some View {
    AppleColors.accentFill
      .frame(height: AppleMetrics.readerProgressHeight)
      .scaleEffect(x: motion.progress, y: 1, anchor: .leading)
      .frame(maxWidth: .infinity, alignment: .leading)
      .allowsHitTesting(false)
      .accessibilityHidden(true)
  }
}

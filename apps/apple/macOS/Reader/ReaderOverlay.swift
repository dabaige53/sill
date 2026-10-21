import SillKit
import SwiftUI

/// The reading overlay. The dim covers the whole window, top bar included; no window toolbar is
/// hidden or shown, so nothing in the window lays out again when a card opens.
struct ReaderOverlay: View {
  @Environment(Reader.self) private var reader
  @Environment(Workspace.self) private var workspace
  @Environment(Panels.self) private var panels

  var body: some View {
    if reader.presented {
      GeometryReader { proxy in
        ZStack {
          ForEach(Array(reader.layers.enumerated()), id: \.element.id) { index, layer in
            if index == reader.layers.count - 1 {
              LayerView(
                layer: layer, below: index > 0 ? reader.layers[index - 1] : nil, size: proxy.size
              )
              .transition(
                .asymmetric(
                  insertion: .opacity.combined(with: .offset(y: AppleMetrics.motionDetailEnterY)),
                  removal: .opacity.combined(with: .offset(y: AppleMetrics.motionDetailExitY)))
              )
              .zIndex(Double(index))
            }
          }
        }
        .opacity(reader.matching || reader.shown ? 1 : 0)
        .offset(y: reader.matching || reader.shown ? 0 : AppleMetrics.motionDetailEnterY)
      }
      .ignoresSafeArea()
      // Esc leaves the top layer wherever focus is.
      .background {
        // A panel over the reader takes Esc first.
        Button("") { reader.close() }
          .keyboardShortcut(.cancelAction)
          .disabled(panels.kind != nil)
          .opacity(0)
          .accessibilityHidden(true)
      }
    }
  }
}

/// One layer: the preview sheet, or the fullscreen page.
private struct LayerView: View {
  let layer: Reader.Layer
  let below: Reader.Layer?
  let size: CGSize
  @Environment(Workspace.self) private var workspace
  @Environment(Reader.self) private var reader

  @Environment(DesktopInteraction.self) private var interaction
  @State private var scroll = ReaderScroll()

  var body: some View {
    ZStack {
      ReaderBackdrop(motion: scroll.motion, full: layer.full) { reader.close() }
        .opacity(reader.shown ? 1 : 0)
      content
    }
    .onAppear {
      scroll.inputAllowed = { [interaction] in interaction.canScrollReader }
    }
    .onChange(of: interaction.layer) { _, layer in
      if layer != .reader { scroll.cancelGesture() }
    }
    .onDisappear { scroll.disconnect() }
  }

  @ViewBuilder private var content: some View {
    if let card = workspace.model(layer.card) {
      let state = workspace.state(layer.card)
      if layer.full {
        ReaderPage(card: card, state: state, size: size, layer: layer, scroll: scroll)
          .transition(.opacity)
      } else if card.kind == .photo {
        PhotoLightbox(card: card, state: state)
          .transition(.opacity)
      } else {
        PreviewSheet(
          card: card, state: state, layer: layer,
          below: below.flatMap { workspace.model($0.card) }, size: size, scroll: scroll
        )
        .transition(.opacity)
      }
    }
  }
}

private struct ReaderBackdrop: View {
  let motion: ReaderMotion
  let full: Bool
  let close: () -> Void
  var body: some View {
    AppleColors.dim.opacity(full ? 0 : motion.dimOpacity)
      .contentShape(Rectangle()).onTapGesture(perform: close)
      .accessibilityHidden(true)
  }
}

// Geometry is measured in one window coordinate space. The feed never moves into the overlay.
struct CardGeometrySource: ViewModifier {
  let id: String
  @Environment(Reader.self) private var reader
  func body(content: Content) -> some View {
    content
      .onGeometryChange(for: CGRect.self) {
        $0.frame(in: .named("card-workspace"))
      } action: {
        reader.cardFrames[id] = $0
      }
      .opacity((reader.shown || reader.returning) && reader.matchedCard == id ? 0 : 1)
      .animation(
        reader.shown ? Motion.ease(AppleMetrics.motionDetailFade) : nil,
        value: reader.shown
      )
      .onDisappear { reader.cardFrames.removeValue(forKey: id) }
  }
}

/// Only the already-laid-out surface moves. Target geometry does not change while it travels.
struct CardGeometryDestination: ViewModifier {
  let id: String
  let target: CGRect
  var ready = true
  @Environment(Reader.self) private var reader
  func body(content: Content) -> some View {
    let source = reader.matching && reader.matchedCard == id ? reader.matchedFrame : nil
    let collapsed = source != nil && !reader.shown
    content
      .overlay { CardReturnFace(id: id, target: target) }
      .scaleEffect(
        x: collapsed ? source!.width / max(1, target.width) : 1,
        y: collapsed ? source!.height / max(1, target.height) : 1
      )
      .offset(
        x: collapsed ? source!.midX - target.midX : 0,
        y: collapsed ? source!.midY - target.midY : 0
      )
      .animation(reader.shown ? Motion.ease(AppleMetrics.motionDetailFade) : Motion.cardHandoff) {
        surface in
        surface.opacity(reader.shown || reader.returning || !reader.matching ? 1 : 0)
      }
      .task(id: ready) {
        if ready { reader.geometryReady(id) }
      }
  }
}

/// Text and tools join the same presentation, without sharing its size transform.
struct DetailReveal: ViewModifier {
  var tools = false
  @Environment(Reader.self) private var reader
  func body(content: Content) -> some View {
    let visible = !reader.matching || (tools ? reader.toolsShown : reader.contentShown)
    content.opacity(visible ? 1 : 0)
      .allowsHitTesting(visible)
      .accessibilityHidden(!visible)
      .animation(Motion.ease(AppleMetrics.motionDetailFade), value: visible)
  }
}

/// A noninteractive feed face replaces the detail inside the same opaque returning surface.
private struct CardReturnFace: View {
  let id: String
  let target: CGRect
  @Environment(Reader.self) private var reader
  @Environment(Workspace.self) private var workspace
  @Environment(Feed.self) private var feed

  var body: some View {
    if reader.matching, reader.matchedCard == id,
      let source = reader.matchedFrame, let card = workspace.model(id)
    {
      let state = workspace.state(id)
      let context = CardContext(
        now: feed.now, query: feed.query.trimmingCharacters(in: .whitespaces),
        fadeRead: workspace.preferences.fadeRead)
      let faded = cardFaded(card, state, context)
      CardBody(card: card, state: state, context: context)
        .environment(\.cardFaded, faded)
        .frame(width: source.width, height: source.height, alignment: .topLeading)
        .background(faded ? AppleColors.readCard : AppleColors.card)
        .clipped()
        .scaleEffect(
          x: target.width / max(1, source.width),
          y: target.height / max(1, source.height), anchor: .topLeading
        )
        .frame(width: target.width, height: target.height, alignment: .topLeading)
        .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.sheetRadius, style: .continuous))
        .opacity(reader.returning ? 1 : 0)
        .animation(reader.returning ? Motion.cardContentReturn : nil, value: reader.returning)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
  }
}

/// Tools follow the card's edge with the same spring, while their icons keep their size.
struct CardToolsTravel: ViewModifier {
  let id: String
  let target: CGRect
  var top = false
  @Environment(Reader.self) private var reader

  static func offset(source: CGRect, target: CGRect, top: Bool) -> CGSize {
    CGSize(
      width: source.midX - target.midX,
      height: top ? source.minY - target.minY : source.maxY - target.maxY)
  }

  func body(content: Content) -> some View {
    let source = reader.matching && reader.matchedCard == id ? reader.matchedFrame : nil
    let collapsed = source != nil && !reader.shown
    let offset = source.map { Self.offset(source: $0, target: target, top: top) } ?? .zero
    content.offset(x: collapsed ? offset.width : 0, y: collapsed ? offset.height : 0)
  }
}

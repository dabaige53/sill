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
        .onGeometryChange(for: CGPoint.self) {
          $0.frame(in: .named("card-workspace")).origin
        } action: {
          if reader.overlayOrigin != $0 { reader.overlayOrigin = $0 }
        }
      }
      .ignoresSafeArea()
      // A leaving overlay is only a picture: clicks reach the feed at once, so the next card opens
      // without waiting for the return spring to settle.
      .allowsHitTesting(reader.shown)
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
    let origin = reader.overlayOrigin
    let source =
      reader.matching && reader.matchedCard == id
      ? reader.matchedFrame?.offsetBy(dx: -origin.x, dy: -origin.y) : nil
    content
      .modifier(
        CardFlightSurface(
          id: source == nil ? nil : id, source: source ?? target, target: target,
          progress: source != nil && !reader.shown ? 0 : 1,
          targetRadius: reader.top?.full == true ? 0 : AppleMetrics.sheetRadius)
      )
      .opacity(ready ? 1 : 0)
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
    // Returning to the card: the tools leave first instead of riding the edge back; the text
    // stays in the surface until the handoff.
    let leaving = tools && reader.returning
    let opacity: Double = leaving ? 0 : reader.matching || visible ? 1 : 0
    content.opacity(opacity)
      .allowsHitTesting(visible && !leaving)
      .accessibilityHidden(!visible || leaving)
      .animation(
        reader.matching && !leaving ? nil : Motion.ease(AppleMetrics.motionDetailFade),
        value: opacity)
  }
}

/// Uses the complete live-card appearance, without pointer handlers or focus effects.
private struct CardTransitionFace: View {
  let id: String
  @Environment(Workspace.self) private var workspace
  @Environment(Feed.self) private var feed
  var body: some View {
    if let card = workspace.model(id) {
      let state = workspace.state(id)
      let context = CardContext(
        now: feed.now, query: feed.query.trimmingCharacters(in: .whitespaces),
        fadeRead: workspace.preferences.fadeRead)
      CardFace(card: card, state: state, context: context, faded: cardFaded(card, state, context))
        .allowsHitTesting(false).accessibilityHidden(true)
    }
  }
}

/// The card grows into the detail: one moving, rounded frame clips content laid out once at its
/// final size and pinned to the frame's top-left corner. Text, tools and icons never scale; the
/// frame reveals them as it grows, so close, fullscreen and the toolbar arrive with the card.
struct CardFlightSurface: AnimatableModifier {
  let id: String?
  let source: CGRect
  let target: CGRect
  nonisolated var progress: CGFloat
  var targetRadius: CGFloat
  nonisolated var animatableData: CGFloat {
    get { progress }
    set { progress = newValue }
  }

  static func rect(source: CGRect, target: CGRect, progress: CGFloat) -> CGRect {
    CGRect(
      x: source.minX + (target.minX - source.minX) * progress,
      y: source.minY + (target.minY - source.minY) * progress,
      width: max(1, source.width + (target.width - source.width) * progress),
      height: max(1, source.height + (target.height - source.height) * progress))
  }

  /// The detail text stays drawn until the frame is nearly the card's size, so the part of the
  /// frame below the card face never shows an empty sheet while it closes.
  static func contentOpacity(_ progress: CGFloat) -> Double {
    let value = min(1, max(0, progress / AppleMetrics.cardBlendStart))
    return Double(value * value * (3 - 2 * value))
  }

  static func detailOpacity(_ progress: CGFloat) -> Double {
    let value = min(
      1,
      max(
        0,
        (progress - AppleMetrics.cardBlendStart)
          / (AppleMetrics.cardBlendEnd - AppleMetrics.cardBlendStart)))
    return Double(value * value * (3 - 2 * value))
  }

  func body(content: Content) -> some View {
    let rect = Self.rect(source: source, target: target, progress: progress)
    let blend = id == nil ? 1 : Self.detailOpacity(progress)
    let lift = Double(min(1, max(0, progress)))
    let radius = AppleMetrics.cardRadius + (targetRadius - AppleMetrics.cardRadius) * lift
    let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
    ZStack(alignment: .topLeading) {
      // The card's own shadow turns into the sheet's as it lifts, so nothing swaps at either end.
      shape.fill(AppleColors.card).frame(width: rect.width, height: rect.height)
        .shadow(.card).opacity(1 - lift)
      shape.fill(AppleColors.card).frame(width: rect.width, height: rect.height)
        .shadow(.sheet).opacity(lift)
      ZStack(alignment: .topLeading) {
        AppleColors.card
        content
          .frame(width: target.width, height: target.height, alignment: .topLeading)
          .opacity(id == nil ? 1 : Self.contentOpacity(progress))
        if let id {
          CardTransitionFace(id: id)
            .frame(width: source.width, height: source.height, alignment: .topLeading)
            .opacity(1 - blend)
        }
      }
      .frame(width: target.width, height: target.height, alignment: .topLeading)
      .clipShape(CardFlightMask(size: rect.size, radius: radius))
    }
    .frame(width: target.width, height: target.height, alignment: .topLeading)
    .offset(x: rect.minX - target.minX, y: rect.minY - target.minY)
  }
}

private struct CardFlightMask: Shape {
  var size: CGSize
  var radius: CGFloat
  func path(in rect: CGRect) -> Path {
    Path(roundedRect: CGRect(origin: .zero, size: size), cornerRadius: radius, style: .continuous)
  }
}

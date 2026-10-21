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
              .id(layer.full)
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
        ReaderPage(card: card, state: state, layer: layer, scroll: scroll)
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

// The feed keeps its layout slot. SwiftUI transfers the frame between source and detail.
private struct CardSpaceKey: EnvironmentKey {
  static let defaultValue: Namespace.ID? = nil
}
extension EnvironmentValues {
  var cardSpace: Namespace.ID? {
    get { self[CardSpaceKey.self] }
    set { self[CardSpaceKey.self] = newValue }
  }
}

struct CardGeometrySource: ViewModifier {
  let id: String
  @Environment(Reader.self) private var reader
  @Environment(\.cardSpace) private var namespace
  func body(content: Content) -> some View {
    if let namespace {
      content
        .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: {
          if !reader.presented || reader.matchedCard != id { reader.cardFrames[id] = $0 }
        }
        .matchedGeometryEffect(id: id, in: namespace,
          isSource: !(reader.matching && reader.matchedCard == id && reader.shown))
        .opacity(reader.presented && reader.matchedCard == id ? 0 : 1)
        .onDisappear { reader.cardFrames.removeValue(forKey: id) }
    } else { content }
  }
}

struct CardGeometryDestination: ViewModifier {
  let id: String
  @Environment(Reader.self) private var reader
  @Environment(\.cardSpace) private var namespace
  func body(content: Content) -> some View {
    if let namespace, reader.matching, reader.matchedCard == id {
      content.matchedGeometryEffect(id: id, in: namespace, isSource: reader.shown)
    } else { content }
  }
}

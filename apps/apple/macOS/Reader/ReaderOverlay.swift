import SillKit
import SwiftUI

/// The reading overlay. The dim covers the whole window, top bar included; no window toolbar is
/// hidden or shown, so nothing in the window lays out again when a card opens.
struct ReaderOverlay: View {
  @Environment(Reader.self) private var reader
  @Environment(Workspace.self) private var workspace

  var body: some View {
    if reader.presented {
      GeometryReader { proxy in
        ZStack {
          AppleColors.dim
            .opacity(reader.top?.full == true ? 0 : 1)
            .contentShape(Rectangle())
            .onTapGesture { reader.close() }
            .accessibilityHidden(true)
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
        .opacity(reader.shown ? 1 : 0)
        .offset(y: reader.shown ? 0 : AppleMetrics.motionDetailEnterY)
      }
      .ignoresSafeArea()
      // Esc leaves the top layer wherever focus is.
      .background {
        Button("") { reader.close() }
          .keyboardShortcut(.cancelAction)
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

  var body: some View {
    if let card = workspace.model(layer.card) {
      let state = workspace.state(layer.card)
      if layer.full {
        ReaderPage(card: card, state: state, layer: layer)
          .transition(.opacity)
      } else {
        PreviewSheet(
          card: card, state: state, layer: layer,
          below: below.flatMap { workspace.model($0.card) }, size: size
        )
        .transition(.opacity)
      }
    }
  }
}

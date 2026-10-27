#if os(iOS)
  import SillKit
  import SwiftUI
  import UIKit

  /// The handle only drags the drawer down to close; tapping or pulling up does not resize it.
  struct MobileReaderHandle: UIViewRepresentable {
    let layer: MobileReaderLayer
    func makeCoordinator() -> Coordinator { Coordinator(layer: layer) }
    func makeUIView(context: Context) -> UIView {
      let button = UIView()
      let mark = UIView()
      mark.backgroundColor = .tertiaryLabel
      mark.layer.cornerRadius = AppleMetrics.mobileHandleHeight / 2
      mark.isUserInteractionEnabled = false
      mark.translatesAutoresizingMaskIntoConstraints = false
      button.addSubview(mark)
      NSLayoutConstraint.activate([
        mark.widthAnchor.constraint(equalToConstant: AppleMetrics.mobileHandleWidth),
        mark.heightAnchor.constraint(equalToConstant: AppleMetrics.mobileHandleHeight),
        mark.centerXAnchor.constraint(equalTo: button.centerXAnchor),
        mark.centerYAnchor.constraint(equalTo: button.centerYAnchor),
      ])
      let pan = UIPanGestureRecognizer(
        target: context.coordinator, action: #selector(Coordinator.dragged(_:)))
      pan.maximumNumberOfTouches = 1
      button.addGestureRecognizer(pan)
      return button
    }
    func updateUIView(_ button: UIView, context: Context) {
      button.isUserInteractionEnabled = layer.active && !layer.leaving

    }
    @MainActor final class Coordinator: NSObject {
      let layer: MobileReaderLayer
      init(layer: MobileReaderLayer) { self.layer = layer }
      @objc func dragged(_ pan: UIPanGestureRecognizer) {
        guard layer.active, !layer.leaving else { return }
        let distance = pan.translation(in: pan.view?.window).y
        switch pan.state {
        case .began:
          layer.generation += 1
          fallthrough
        case .changed:
          layer.drag.height =
            distance > 0 ? distance : distance * AppleMetrics.mobileHandleResistance
        case .ended, .cancelled, .failed:
          let decision = MobileReaderPolicy.release(
            .handle, distance: Double(distance), velocity: 0,
            width: 0, cancelled: pan.state != .ended, committed: false)
          switch decision {
          case .close: layer.close()
          default:
            layer.rebound()
          }
        default: break
        }
      }
    }
  }

  struct MobileReaderFinishRing: View {
    let layer: MobileReaderLayer
    var body: some View {
      ZStack {
        Circle().fill(layer.confirmed ? AppleColors.accentFill : AppleColors.card)
        if layer.confirmed {
          MobileIcon("check", size: AppleMetrics.space24).foregroundStyle(AppleColors.fixedWhite)
        } else {
          Circle().trim(from: 0, to: min(1, layer.finish / AppleMetrics.gestureFinishDistance))
            .stroke(
              AppleColors.accent,
              style: StrokeStyle(lineWidth: AppleMetrics.selectionLineWidth, lineCap: .round)
            )
            .rotationEffect(.degrees(-90)).padding(AppleMetrics.space10)
        }
      }
      .frame(width: AppleMetrics.space40, height: AppleMetrics.space40)
      .mobileShadow(.floating)
      .opacity(layer.confirmed ? 1 : min(1, layer.finish / AppleMetrics.gestureFinishReveal))
      .allowsHitTesting(false)
      .accessibilityHidden(true)
    }
  }
#endif

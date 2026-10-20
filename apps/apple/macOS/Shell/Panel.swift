import SillKit
import SwiftUI

/// The window's one panel (Web `#modal.panel`).
/// One at a time; opening another replaces it.
@MainActor @Observable final class Panels {
  enum Kind: Equatable {
    case archive

    var narrow: Bool { self != .archive }
  }

  private(set) var kind: Kind?
  /// Bumped on every open, so the same kind opened again starts fresh.
  private(set) var generation = 0
  /// Where focus goes back when the panel closes.
  @ObservationIgnored var onClosed: ((Kind) -> Void)?

  func open(_ next: Kind) {
    generation += 1
    withAnimation(Motion.keyboardDriven ? nil : Motion.open) { kind = next }
  }

  func close() {
    guard let kind else { return }
    withAnimation(Motion.keyboardDriven ? nil : Motion.close) { self.kind = nil }
    onClosed?(kind)
  }
}

/// Dim over the whole window, the sheet centered: 560 wide (440 for narrow panels), card color,
/// sheet radius and shadow, 28 padding, a round close button at the top right. It enters 10px up
/// in 220ms and leaves the same way. Esc or a click on the dim closes it.
struct PanelOverlay: View {
  @Environment(Panels.self) private var panels

  var body: some View {
    ZStack {
      if let kind = panels.kind {
        AppleColors.dim
          .contentShape(Rectangle())
          .onTapGesture { panels.close() }
          .accessibilityHidden(true)
          .transition(.opacity)
        PanelSheet(narrow: kind.narrow) {
          switch kind {
          case .archive: ArchivePanel()
          }
        }
        .id(panels.generation)
        .transition(.opacity.combined(with: .offset(y: AppleMetrics.motionDetailEnterY)))
        .background {
          Button("") { panels.close() }
            .keyboardShortcut(.cancelAction)
            .opacity(0)
            .accessibilityHidden(true)
        }
      }
    }
    .ignoresSafeArea()
  }
}

private struct PanelSheet<Content: View>: View {
  let narrow: Bool
  @ViewBuilder let content: Content
  @Environment(Panels.self) private var panels

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: AppleMetrics.sheetRadius, style: .continuous)
    content
      .padding(AppleMetrics.space28)
      .frame(maxWidth: narrow ? AppleMetrics.panelNarrowWidth : AppleMetrics.panelWidth)
      .background(shape.fill(AppleColors.card))
      .clipShape(shape)
      .shadow(.sheet)
      .overlay(alignment: .topTrailing) {
        SheetClose { panels.close() }
          .padding(AppleMetrics.sheetCloseInset)
      }
      .padding(AppleMetrics.space16)
      .accessibilityElement(children: .contain)
      .accessibilityAddTraits(.isModal)
  }
}

/// Web `.sheet-close`: a 36 card-colored disc with a hairline and the float shadow.
struct SheetClose: View {
  let action: () -> Void
  @State private var hovered = false
  var body: some View {
    Button(action: action) {
      Icon("x", size: AppleMetrics.font18)
        .foregroundStyle(AppleColors.primary)
        .frame(width: AppleMetrics.sheetCloseSize, height: AppleMetrics.sheetCloseSize)
        .background(Circle().fill(hovered ? AppleColors.surface : AppleColors.card))
        .overlay(Circle().strokeBorder(AppleColors.lineCard, lineWidth: AppleMetrics.lineWidth / 2))
        .shadow(.floating)
        .contentShape(
          Circle().inset(by: -(AppleMetrics.hitTarget - AppleMetrics.sheetCloseSize) / 2))
    }
    .buttonStyle(IconPress(highlight: false))
    .onHover { hovered = $0 }
    .accessibilityLabel(Copy.text("web.close"))
  }
}

/// Web `.panel-head`: the title, and on the right a link or a count clear of the close button.
struct PanelHead<Trailing: View>: View {
  let title: String
  @ViewBuilder var trailing: Trailing
  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: AppleMetrics.space12) {
      Text(title)
        .font(.sans(AppleMetrics.font22, .semibold))
        .tracking(AppleMetrics.font22 * AppleMetrics.panelTitleTracking)
        .foregroundStyle(AppleColors.primary)
        .accessibilityAddTraits(.isHeader)
      Spacer(minLength: 0)
      trailing.padding(.trailing, AppleMetrics.space44)
    }
    .padding(.bottom, AppleMetrics.space14)
  }
}

extension PanelHead where Trailing == EmptyView {
  init(title: String) { self.init(title: title) { EmptyView() } }
}

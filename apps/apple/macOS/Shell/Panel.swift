import SillKit
import SwiftUI

/// The window's one panel (Web `#modal.panel`): settings, the archive, tags and note, or a quick
/// note. One at a time; opening another replaces it.
@MainActor @Observable final class Panels {
  enum Kind: Equatable {
    case archive
    /// Tags and note for these cards; the note belongs to the first.
    case editor([String])
    case capture
    case settings
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
/// sheet radius and shadow, 28 padding, a round close button at the top right. Settings is the
/// wide sheet (Web `#modal.panel.wide`) with its own head. It enters 10px up in 220ms and leaves
/// the same way. Esc or a click on the dim closes it.
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
        sheet(kind)
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

  @ViewBuilder private func sheet(_ kind: Panels.Kind) -> some View {
    switch kind {
    case .settings: SettingsView().padding(AppleMetrics.space16)
    case .archive: PanelSheet(narrow: false) { ArchivePanel() }
    case .editor(let ids): PanelSheet(narrow: true) { EditorPanel(ids: ids) }
    case .capture: PanelSheet(narrow: true) { CapturePanel() }
    }
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

/// Web `.sheet-close`: a 36 card-colored disc with a hairline and the float shadow. In a head
/// (Web `.settings-head .sheet-close`) it is quiet: a 44 faint disc with no rim or shadow.
struct SheetClose: View {
  var quiet = false
  let action: () -> Void
  @State private var hovered = false
  var body: some View {
    let size = quiet ? AppleMetrics.hitTarget : AppleMetrics.sheetCloseSize
    Button(action: action) {
      Icon("x", size: AppleMetrics.font18)
        .foregroundStyle(AppleColors.primary)
        .frame(width: size, height: size)
        .background(
          Circle().fill(
            quiet
              ? (hovered ? AppleColors.surface : AppleColors.faint)
              : (hovered ? AppleColors.surface : AppleColors.card))
        )
        .overlay(
          Circle().strokeBorder(
            quiet ? .clear : AppleColors.lineCard, lineWidth: AppleMetrics.lineWidth / 2)
        )
        .shadow(.floating, visible: !quiet)
        .contentShape(Circle().inset(by: -max(0, AppleMetrics.hitTarget - size) / 2))
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

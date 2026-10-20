import AppKit
import SillKit
import SwiftUI

/// One card in the feed. It observes only its own `CardState`; the content arrives as a value.
/// Hover, press and focus are local view state, so they redraw only this card.
struct CardTile: View {
  let card: CardModel
  let state: CardState
  let context: CardContext
  var selecting = false
  @Environment(\.cardIntents) private var intents
  @State private var hovered = false
  @State private var pressed = false
  @FocusState private var focused: Bool

  var body: some View {
    let faded = cardFaded(card, state, context)
    let lifted = hovered || focused
    surface(faded: faded, lifted: lifted)
      .contentShape(Self.shape)
      .scaleEffect(pressed ? AppleMetrics.motionPressScale : 1)
      .animation(Motion.press, value: pressed)
      .animation(Motion.hover, value: lifted)
      .animation(Motion.read, value: faded)
      .modifier(
        CardPointer(
          id: card.id, pressed: $pressed, hovered: $hovered,
          click: { command in command ? intents.select(card.id) : intents.open(card.id) },
          drag: { intents.beginDrag(card.id) }, secondary: { intents.menu(card.id) })
      )
      .focusable()
      .focusEffectDisabled()
      .focused($focused)
      .onChange(of: state.focusRequest) { focused = true }
      .onKeyPress(.return) {
        intents.open(card.id)
        return .handled
      }
      .onKeyPress(.space) {
        intents.open(card.id)
        return .handled
      }
      .modifier(CardAccessibility(card: card, state: state))
  }

  private static let shape = RoundedRectangle(
    cornerRadius: AppleMetrics.cardRadius, style: .continuous)

  private func surface(faded: Bool, lifted: Bool) -> some View {
    let shape = Self.shape
    let border: Color =
      lifted ? AppleColors.lineHover : faded ? AppleColors.lineRead : AppleColors.lineCard
    let selection: Color =
      state.selected ? AppleColors.accent : selecting ? AppleColors.lineHover : .clear
    return CardBody(card: card, state: state, context: context)
      // Changed text fades in once (`fast`); a running fade continues from where it is.
      .modifier(ContentFade(value: card.fingerprint))
      .environment(\.cardFaded, faded)
      .background(shape.fill(faded ? AppleColors.readCard : AppleColors.card))
      .clipShape(shape)
      .overlay(shape.strokeBorder(border, lineWidth: AppleMetrics.lineWidth))
      .overlay(shape.strokeBorder(selection, lineWidth: AppleMetrics.selectionLineWidth))
      .shadow(lifted ? .hover : .card, visible: !faded)
      .overlay(alignment: .topTrailing) {
        MoreButton(visible: (lifted || state.isWriting) && !selecting) { intents.menu(card.id) }
          .padding(AppleMetrics.moreInset)
      }
      .overlay { focusRing }
  }

  @ViewBuilder private var focusRing: some View {
    if focused, Keyboard.focusVisible {
      Self.shape.inset(by: -AppleMetrics.focusOutset)
        .stroke(AppleColors.accent, lineWidth: AppleMetrics.selectionLineWidth)
        .allowsHitTesting(false)
    }
  }
}

/// VoiceOver: type and title, read state, open as the default action, the menu as a named one.
private struct CardAccessibility: ViewModifier {
  let card: CardModel
  let state: CardState
  @Environment(\.cardIntents) private var intents
  func body(content: Content) -> some View {
    let label =
      card.kind.label + "：" + card.title
      + (state.read ? Copy.text("web.templates.732aa8f1efe5") : "")
    let traits: AccessibilityTraits = state.selected ? [.isButton, .isSelected] : .isButton
    content
      .accessibilityElement(children: .contain)
      .accessibilityLabel(label)
      .accessibilityAddTraits(traits)
      .accessibilityAction { intents.open(card.id) }
      .accessibilityAction(named: Copy.text("web.templates.ee9430845e26")) { intents.menu(card.id) }
  }
}

/// The more button: hidden at rest, a glass circle with bold dots on hover or focus.
struct MoreButton: View {
  let visible: Bool
  let action: () -> Void
  @State private var hovered = false
  var body: some View {
    Button(action: action) {
      Icon("more", size: AppleMetrics.space16, weight: AppleMetrics.moreStroke)
        .foregroundStyle(AppleColors.primary)
        .frame(width: AppleMetrics.moreSize, height: AppleMetrics.moreSize)
        .background(
          Circle().fill(hovered ? AppleColors.card : AppleColors.glass)
            .background(.ultraThinMaterial, in: Circle())
        )
        .overlay(Circle().strokeBorder(AppleColors.fixedWhite72, lineWidth: AppleMetrics.lineWidth))
        .shadow(.more)
        .contentShape(Circle().inset(by: -AppleMetrics.space6))
    }
    // `.card-more-trigger` is an icon button: its own glass disc, the shared press scale.
    .buttonStyle(IconPress(highlight: false))
    .opacity(visible ? 1 : 0)
    .allowsHitTesting(visible)
    .onHover { hovered = $0 }
    .animation(Motion.hover, value: visible)
    .accessibilityLabel(Copy.text("web.templates.ee9430845e26"))
  }
}

/// The card's single pointer decision. A press shows the press scale; releasing without moving
/// is a click (⌘ adds to the selection); moving past the threshold is a drag. Right-click opens
/// the card menu. Buttons inside the card take their own clicks first.
struct CardPointer: ViewModifier {
  let id: String
  @Binding var pressed: Bool
  @Binding var hovered: Bool
  let click: (_ command: Bool) -> Void
  let drag: () -> Void
  let secondary: () -> Void
  @State private var phase = Phase.idle
  private enum Phase { case idle, pressing, dragging }

  func body(content: Content) -> some View {
    content
      .onHover { inside in
        hovered = inside
        PointerRouter.shared.hover(id, inside: inside, secondary: secondary)
      }
      .gesture(
        DragGesture(minimumDistance: 0, coordinateSpace: .global)
          .onChanged { value in
            switch phase {
            case .idle:
              phase = .pressing
              pressed = true
            case .pressing:
              let moved = hypot(value.translation.width, value.translation.height)
              if moved >= AppleMetrics.motionDeckGestureStart {
                phase = .dragging
                pressed = false
                drag()
              }
            case .dragging: break
            }
          }
          .onEnded { _ in
            let wasPressing = phase == .pressing
            phase = .idle
            pressed = false
            if wasPressing { click(NSEvent.modifierFlags.contains(.command)) }
          }
      )
  }
}

/// Right-click goes to the card under the pointer. One window-level monitor for every card.
@MainActor final class PointerRouter {
  static let shared = PointerRouter()
  private var hovered: (id: String, secondary: () -> Void)?
  private var monitor: Any?
  var enabled = true

  func hover(_ id: String, inside: Bool, secondary: @escaping () -> Void) {
    if inside {
      hovered = (id, secondary)
    } else if hovered?.id == id {
      hovered = nil
    }
    install()
  }

  private func install() {
    guard monitor == nil else { return }
    monitor = NSEvent.addLocalMonitorForEvents(matching: .rightMouseDown) { event in
      let handled = MainActor.assumeIsolated {
        guard let router = PointerRouter.shared.hovered, PointerRouter.shared.enabled else {
          return false
        }
        router.secondary()
        return true
      }
      return handled ? nil : event
    }
  }
}

/// Keyboard focus rings show only after keyboard input (Web `data-input-modality`).
@MainActor enum Keyboard {
  private(set) static var focusVisible = false
  private static var monitor: Any?
  static func install() {
    guard monitor == nil else { return }
    monitor = NSEvent.addLocalMonitorForEvents(matching: [.keyDown, .leftMouseDown]) { event in
      let key = event.type == .keyDown
      MainActor.assumeIsolated { focusVisible = key }
      return event
    }
  }
}

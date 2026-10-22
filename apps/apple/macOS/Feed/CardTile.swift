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
    // Web `.tools-open`: a card with its menu open neither lifts nor presses.
    let lifted = (hovered || focused) && !state.menuOpen
    surface(faded: faded, lifted: lifted)
      .contentShape(Self.shape)
      .scaleEffect(pressed && !state.menuOpen ? AppleMetrics.motionPressScale : 1)
      .animation(Motion.press, value: pressed)
      .animation(Motion.hover, value: lifted)
      .animation(Motion.read, value: faded)
      .modifier(
        CardPointer(
          id: card.id, pressed: $pressed, hovered: $hovered,
          click: { modifiers in
            if modifiers.contains(.shift) {
              intents.select(card.id, true)
            } else if modifiers.contains(.command) {
              intents.select(card.id, false)
            } else {
              intents.open(card.id)
            }
          },
          carry: intents.carry, secondary: { point in intents.menu(card.id, point) })
      )
      .overlay {
        if state.menuOpen { CardMenuLayer(card: card, state: state) }
      }
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
      .modifier(CardGeometrySource(id: card.id))
      // Web `.feed-card`: the whole card opens, so the pointer says so.
      .modifier(HandCursor())
  }

  private static let shape = RoundedRectangle(
    cornerRadius: AppleMetrics.cardRadius, style: .continuous)

  private func surface(faded: Bool, lifted: Bool) -> some View {
    CardFace(
      card: card, state: state, context: context, faded: faded,
      lifted: lifted, selecting: selecting
    )
    .allowsHitTesting(!selecting)
    .modifier(ContentFade(value: card.fingerprint))
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

/// Shared appearance for the live tile and its noninteractive transition face.
struct CardFace: View {
  let card: CardModel
  let state: CardState
  let context: CardContext
  let faded: Bool
  var lifted = false
  var selecting = false

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: AppleMetrics.cardRadius, style: .continuous)
    let border =
      lifted ? AppleColors.lineHover : faded ? AppleColors.lineRead : AppleColors.lineCard
    let selection: Color =
      state.selected ? AppleColors.accent : selecting ? AppleColors.lineHover : .clear
    CardBody(card: card, state: state, context: context)
      .environment(\.cardFaded, faded)
      .background(shape.fill(faded ? AppleColors.readCard : AppleColors.card))
      .clipShape(shape)
      .overlay(shape.strokeBorder(border, lineWidth: AppleMetrics.lineWidth))
      .overlay(shape.strokeBorder(selection, lineWidth: AppleMetrics.selectionLineWidth))
      .shadow(lifted ? .hover : .card, visible: !faded)
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
      .accessibilityIdentifier("card-\(card.id)")
      .accessibilityLabel(label)
      .accessibilityAddTraits(traits)
      .accessibilityAction { intents.open(card.id) }
      .accessibilityAction(named: Copy.text("web.templates.ee9430845e26")) {
        intents.menu(card.id, nil)
      }
  }
}

/// The card's single pointer decision (Web `click` and `DragManager`). A press shows the press
/// scale. Releasing without moving is a click: ⌘ toggles the selection, ⇧ extends it as a range.
/// Moving 8px, or holding still for 380ms, picks the card up: it joins the selection and follows
/// the pointer until released. Right-click opens the card menu. Buttons inside the card take
/// their own clicks first.
struct CardPointer: ViewModifier {
  let id: String
  @Binding var pressed: Bool
  @Binding var hovered: Bool
  let click: (_ modifiers: NSEvent.ModifierFlags) -> Void
  let carry: CardCarry
  let secondary: (CGPoint) -> Void
  @State private var phase = Phase.idle
  @State private var hold: Task<Void, Never>?
  private enum Phase { case idle, pressing, carrying }

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
              let start = value.startLocation
              hold = Task {
                try? await Task.sleep(for: .seconds(AppleMetrics.holdToSelect))
                guard !Task.isCancelled, phase == .pressing else { return }
                pickUp(at: start)
              }
            case .pressing:
              let moved = hypot(value.translation.width, value.translation.height)
              if moved > AppleMetrics.dragStartDistance {
                pickUp(at: value.startLocation)
                carry.move(value.location)
              }
            case .carrying:
              carry.move(value.location)
            }
          }
          .onEnded { value in
            hold?.cancel()
            let ended = phase
            phase = .idle
            pressed = false
            switch ended {
            case .pressing: click(NSEvent.modifierFlags)
            case .carrying: carry.end(value.location)
            case .idle: break
            }
          }
      )
  }

  private func pickUp(at point: CGPoint) {
    hold?.cancel()
    phase = .carrying
    pressed = false
    carry.begin(id, point)
  }
}

/// What picking a card up does. Not observable.
struct CardCarry {
  var begin: @MainActor (String, CGPoint) -> Void = { _, _ in }
  var move: @MainActor (CGPoint) -> Void = { _ in }
  var end: @MainActor (CGPoint) -> Void = { _ in }
}

/// Right-click goes to the card under the pointer. One window-level monitor for every card.
@MainActor final class PointerRouter {
  static let shared = PointerRouter()
  private var hovered: (id: String, secondary: (CGPoint) -> Void)?
  private var monitor: Any?
  var enabled = true

  /// `secondary` gets the pointer in window coordinates, top-left origin.
  func hover(_ id: String, inside: Bool, secondary: @escaping (CGPoint) -> Void) {
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
      let location = event.locationInWindow
      let height = event.window?.contentView?.bounds.height ?? 0
      let point = CGPoint(x: location.x, y: height - location.y)
      let handled = MainActor.assumeIsolated {
        guard let router = PointerRouter.shared.hovered, PointerRouter.shared.enabled else {
          return false
        }
        router.secondary(point)
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

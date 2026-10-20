import AppKit
import SillKit
import SwiftUI

struct DesktopSearch: View {
  @Environment(Workspace.self) private var model
  @Binding var query: String
  let focus: FocusState<Bool>.Binding
  @State private var hovered = false
  @State private var drawingWidth = AppleMetrics.searchWidth
  private var width: CGFloat {
    focus.wrappedValue
      ? AppleMetrics.searchFocusedWidth
      : model.feedScope != .all || query.contains("#")
        ? AppleMetrics.searchTaggedWidth : AppleMetrics.searchWidth
  }
  var body: some View {
    HStack(spacing: AppleMetrics.space8) {
      HStack(spacing: AppleMetrics.space8) {
        NativeIcon(name: "search", size: AppleMetrics.space20).foregroundStyle(
          AppleColors.secondary)
        SearchTextField(query: $query, focus: focus)
      }.modifier(SearchContentPosition(width: drawingWidth, destination: width))
      if query.isEmpty {
        Text("⌘ K").font(.system(size: AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
      } else {
        Button {
          query = ""
        } label: {
          NativeIcon(name: "x", size: AppleMetrics.font14)
        }
        .buttonStyle(.plain).accessibilityLabel(Copy.text("web.close"))
      }
    }.padding(.horizontal, AppleMetrics.space12).frame(
      width: width, height: AppleMetrics.searchHeight
    )
    .background {
      SearchSurface(width: drawingWidth, available: width, hovered: hovered)
    }
    .onHover { hovered = $0 }
    .onChange(of: width, initial: true) { _, width in
      withAnimation(
        NSApp.currentEvent?.type == .keyDown ? nil : NativeMotion.ease(AppleMetrics.motionState)
      ) { drawingWidth = width }
    }
    .onExitCommand {
      if !query.isEmpty {
        query = ""
      } else if model.feedScope != .all {
        model.feedScope = .all
      } else {
        focus.wrappedValue = false
      }
    }
  }
}

private struct SearchContentPosition: ViewModifier, Animatable {
  nonisolated var width: CGFloat
  let destination: CGFloat
  nonisolated var animatableData: CGFloat {
    get { width }
    set { width = newValue }
  }
  func body(content: Content) -> some View { content.offset(x: destination - width).clipped() }
}

private struct SearchSurface: View, Animatable {
  nonisolated var width: CGFloat
  let available: CGFloat
  let hovered: Bool
  nonisolated var animatableData: CGFloat {
    get { width }
    set { width = newValue }
  }
  var body: some View {
    SearchShape(width: width).fill(AppleColors.card)
      .overlay(
        SearchShape(width: width).stroke(hovered ? AppleColors.lineHover : AppleColors.lineCard)
      )
      .frame(width: available, height: AppleMetrics.searchHeight)
      .animation(NativeMotion.ease(AppleMetrics.motionHover), value: hovered)
  }
}

private struct SearchShape: Shape {
  var width: CGFloat
  func path(in rect: CGRect) -> Path {
    Path(
      roundedRect: CGRect(x: rect.maxX - width, y: rect.minY, width: width, height: rect.height),
      cornerRadius: rect.height / 2)
  }
}

/// Commit only after IME composition ends, including a final notification with unchanged text.
private struct SearchTextField: NSViewRepresentable {
  @Environment(\.isEnabled) private var enabled
  @Binding var query: String
  let focus: FocusState<Bool>.Binding
  func makeCoordinator() -> Coordinator { Coordinator(parent: self) }
  func makeNSView(context: Context) -> NSTextField {
    let field = NSTextField(string: query)
    field.isBordered = false
    field.drawsBackground = false
    field.focusRingType = .none
    field.placeholderString = Copy.text("web.home.searchPlaceholder")
    field.font = .systemFont(ofSize: AppleMetrics.font14)
    field.textColor = NSColor(AppleColors.primary)
    field.delegate = context.coordinator
    field.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    return field
  }
  func updateNSView(_ field: NSTextField, context: Context) {
    context.coordinator.parent = self
    field.isEnabled = enabled
    let editor = field.currentEditor() as? NSTextView
    if editor?.hasMarkedText() != true && field.stringValue != query { field.stringValue = query }
    if focus.wrappedValue && editor == nil {
      Task { @MainActor [weak field] in
        guard let field, focus.wrappedValue else { return }
        field.window?.makeFirstResponder(field)
      }
    } else if !focus.wrappedValue && editor != nil {
      field.window?.makeFirstResponder(nil)
    }
  }
  final class Coordinator: NSObject, NSTextFieldDelegate {
    var parent: SearchTextField
    init(parent: SearchTextField) { self.parent = parent }
    func controlTextDidBeginEditing(_ notification: Notification) {
      parent.focus.wrappedValue = true
    }
    func controlTextDidChange(_ notification: Notification) {
      guard let field = notification.object as? NSTextField,
        (field.currentEditor() as? NSTextView)?.hasMarkedText() != true
      else { return }
      parent.query = field.stringValue
    }
    func controlTextDidEndEditing(_ notification: Notification) {
      if let field = notification.object as? NSTextField { parent.query = field.stringValue }
      parent.focus.wrappedValue = false
    }
  }
}

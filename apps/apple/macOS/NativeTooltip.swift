import SillKit
import SwiftUI

struct NativeTooltip: ViewModifier {
  let text: String
  var group = ""
  @State private var identity = UUID().uuidString
  @MainActor private static var lastGroup = ""
  @Environment(\.isFocused) private var focused
  @State private var visible = false
  @State private var pending: Task<Void, Never>?
  @MainActor private static var lastVisible: Date = .distantPast
  func body(content: Content) -> some View {
    content.overlay(alignment: .top) {
      if visible {
        Text(text).font(.system(size: AppleMetrics.font12)).fixedSize()
          .padding(AppleMetrics.space8).background(
            AppleColors.primary,
            in: RoundedRectangle(cornerRadius: AppleMetrics.space8)
          )
          .foregroundStyle(AppleColors.card)
          .offset(y: -AppleMetrics.space36).allowsHitTesting(false).accessibilityHidden(true)
          .transition(NativeMotion.fade)
      }
    }
    .onHover { hovering in
      pending?.cancel()
      if hovering {
        let immediate =
          Self.lastGroup == (group.isEmpty ? identity : group)
          && Date.now.timeIntervalSince(Self.lastVisible) < AppleMetrics.tooltipGrace
        pending = Task {
          if !immediate {
            do { try await Task.sleep(for: .seconds(AppleMetrics.tooltipDelay)) } catch { return }
          }
          guard !Task.isCancelled else { return }
          withAnimation(immediate ? nil : NativeMotion.ease(AppleMetrics.motionFast)) {
            visible = true
          }
        }
      } else {
        if visible {
          Self.lastVisible = .now
          Self.lastGroup = group.isEmpty ? identity : group
        }
        visible = focused
      }
    }
    .onChange(of: focused) { _, focus in
      pending?.cancel()
      visible = focus
    }
    .onDisappear { pending?.cancel() }
  }
}

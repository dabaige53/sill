#if os(iOS)
import SillKit
import SwiftUI

struct MobileCapture: View {
  let workspace: MobileWorkspace
  @Environment(\.dismiss) private var dismiss
  @State private var text = ""
  @State private var discard = false
  @FocusState private var focused: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space16) {
      TextEditor(text: $text)
        .font(.system(size: AppleMetrics.font17))
        .scrollContentBackground(.hidden)
        .background(AppleColors.card)
        .focused($focused)
        .accessibilityLabel(Copy.text("web.capture.placeholder"))
        .overlay(alignment: .topLeading) {
          if text.isEmpty {
            Text(Copy.text("web.capture.placeholder"))
              .foregroundStyle(AppleColors.secondary)
              .padding(AppleMetrics.space8).allowsHitTesting(false)
          }
        }
      if text.count > 4000 { Text(Copy.text("mobile.capture.limit")) }
      MobileError(workspace: workspace)
      Button(Copy.text("web.capture.save")) {
        Task { if await workspace.capture(text) { text = ""; dismiss() } }
      }
      .buttonStyle(MobileButtonStyle())
      .disabled(workspace.busy || workspace.unresolvedWrite || text.count > 4000
        || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }
    .padding(AppleMetrics.space16).background(AppleColors.canvas)
    .navigationTitle(Copy.text("web.capture.title"))
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .cancellationAction) {
        Button(Copy.text("apple.cancel")) {
          if text.isEmpty { dismiss() } else { discard = true }
        }
      }
    }
    .interactiveDismissDisabled(!text.isEmpty)
    .confirmationDialog(Copy.text("apple.discardConfirm"), isPresented: $discard, titleVisibility: .visible) {
      Button(Copy.text("apple.discard"), role: .destructive) { dismiss() }
    }
    .task { focused = true }
  }
}
#endif

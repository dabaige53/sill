import SillKit
import SwiftUI

struct CaptureSheet: View {
  @Environment(Workspace.self) private var model: Workspace
  @Binding var text: String
  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack {
        Text(Copy.text("web.capture.title")).font(.headline)
        Spacer()
        Button(Copy.text("web.cancel")) { model.capturePresented = false }
          .keyboardShortcut(.cancelAction).disabled(model.busy)
      }
      CaptureField(text: $text, showsNextEvent: true) { model.capture(text) }
      if let error = model.error {
        Text(error).foregroundStyle(.red).textSelection(.enabled)
      }
    }.padding(24).frame(width: AppleMetrics.editorWidth)
      .interactiveDismissDisabled(model.busy)
  }
}

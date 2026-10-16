import SillKit
import SwiftUI

struct Editor: View {
  @EnvironmentObject var model: Workspace
  @State private var confirmDiscard = false
  @FocusState private var titleFocused: Bool
  var body: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space18) {
      HStack {
        Text(Copy.appleLocalNote).font(.headline)
        Spacer()
        Button(Copy.appleCancel) {
          if model.draftIsDirty { confirmDiscard = true } else { model.discardDraft() }
        }.keyboardShortcut(.cancelAction).disabled(model.busy)
        Button(Copy.appleSave) { Task { await model.saveDraft() } }.keyboardShortcut("s")
          .buttonStyle(.borderedProminent).disabled(
            model.busy
              || model.draft?.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false
          )
      }
      if let error = model.error {
        Text(error).foregroundStyle(AppleColors.error).font(.callout).textSelection(.enabled)
      }
      TextField(
        Copy.appleTitle,
        text: Binding(
          get: { model.draft?.title ?? "" },
          set: {
            model.draft?.title = $0
            model.scheduleDraftPersistence()
          })
      ).font(.title2).textFieldStyle(.plain).accessibilityLabel(Copy.appleTitleLabel).focused(
        $titleFocused
      ).disabled(model.busy).onAppear { titleFocused = true }
      Divider()
      TextEditor(
        text: Binding(
          get: { model.draft?.body ?? "" },
          set: {
            model.draft?.body = $0
            model.scheduleDraftPersistence()
          })
      ).font(.system(size: AppleMetrics.font16)).accessibilityLabel(Copy.appleBodyLabel).disabled(
        model.busy)
      Text(Copy.appleLocalOnly).font(.caption).foregroundStyle(AppleColors.secondary)
    }.padding(AppleMetrics.space24).frame(
      width: AppleMetrics.editorWidth, height: AppleMetrics.editorHeight
    )
    .confirmationDialog(
      Copy.appleDiscardConfirm, isPresented: $confirmDiscard, titleVisibility: .visible
    ) {
      Button(Copy.appleDiscard, role: .destructive) { model.discardDraft() }
      Button(Copy.appleContinueEditing, role: .cancel) {}
    }
  }
}

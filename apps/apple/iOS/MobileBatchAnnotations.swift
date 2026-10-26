#if os(iOS)
  import SillKit
  import SwiftUI

  /// Tags apply to each selected card; the note belongs to the first. Baselines stay frozen.
  struct MobileBatchAnnotations: View {
    let workspace: MobileWorkspace
    let baselines: [MobileCard]
    var onClose: (() -> Void)? = nil
    @Environment(\.dismiss) private var dismiss
    @State private var tags: [String] = []
    @State private var draft = ""
    @State private var note = ""
    @State private var loaded = false
    @State private var discard = false
    @State private var message: String?
    @FocusState private var field: Field?
    private enum Field { case tag, note }
    private var dirty: Bool {
      tags != (baselines.first?.tags ?? []) || note != (baselines.first?.note ?? "")
        || !draft.isEmpty
    }
    private func close() { if let onClose { onClose() } else { dismiss() } }

    var body: some View {
      ScrollView {
        VStack(alignment: .leading, spacing: AppleMetrics.space12) {
          HStack {
            Text(Copy.text("apple.organize")).font(
              .system(size: AppleMetrics.font22, weight: .bold))
            Spacer()
            MobileIconButton("x", label: Copy.text("web.editor.closeTagsAndNote")) {
              if dirty { discard = true } else { close() }
            }.disabled(workspace.busy)
          }
          Text(baselines.first?.title ?? "")
            .font(.system(size: AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
            .lineLimit(2)
            .padding(.bottom, AppleMetrics.space6)
          tagEditor.disabled(workspace.busy)
          suggestions.disabled(workspace.busy)
          noteEditor.disabled(workspace.busy)
          if note.count > 4000 {
            Text(Copy.text("mobile.capture.limit")).font(.system(size: AppleMetrics.font13))
              .foregroundStyle(AppleColors.error)
          }
          if let message {
            Text(message).font(.system(size: AppleMetrics.font13)).foregroundStyle(
              AppleColors.error)
          }
          MobileError(workspace: workspace)
          HStack {
            Text(Copy.text("web.cloud.savedAccount"))
              .font(.system(size: AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
            Spacer()
            Button(Copy.text("web.save"), action: save)
              .buttonStyle(MobileCommitStyle())
              .keyboardShortcut(.return, modifiers: .command)
              .disabled(
                workspace.busy || workspace.unresolvedWrite || note.count > 4000
                  || baselines.isEmpty)
          }.padding(.top, AppleMetrics.space10)
        }
        .padding(AppleMetrics.space20)
      }
      .background(AppleColors.card)
      .toolbar(.hidden, for: .navigationBar)
      .interactiveDismissDisabled(dirty || workspace.busy)
      .confirmationDialog(
        Copy.text("apple.discardConfirm"), isPresented: $discard, titleVisibility: .visible
      ) {
        Button(Copy.text("apple.discard"), role: .destructive, action: close)
          .disabled(workspace.busy)
        Button(Copy.text("apple.continueEditing"), role: .cancel) {}
      }
      .task {
        guard !loaded else { return }
        loaded = true
        tags = baselines.first?.tags ?? []
        note = baselines.first?.note ?? ""
        field = .tag
      }
    }

    private var tagEditor: some View {
      MobileFlowRow {
        ForEach(tags, id: \.self) { tag in
          HStack(spacing: AppleMetrics.space2) {
            Text(tag).fixedSize(horizontal: false, vertical: true)
            Button {
              tags.removeAll { $0 == tag }
            } label: {
              MobileIcon("x", size: AppleMetrics.font12)
                .frame(minWidth: AppleMetrics.tagRemoveSize, minHeight: AppleMetrics.tagRemoveSize)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Copy.text("web.editor.removeTagPrefix") + tag)
          }
          .font(.system(size: AppleMetrics.font13, weight: .medium))
          .padding(.leading, AppleMetrics.space12).padding(.trailing, AppleMetrics.space4)
          .frame(minHeight: AppleMetrics.tagPillHeight)
          .background(AppleColors.surface, in: Capsule())
        }
        TextField(Copy.text("web.editor.addTagPlaceholder"), text: $draft)
          .font(.system(size: AppleMetrics.font16)).textInputAutocapitalization(.never)
          .autocorrectionDisabled().submitLabel(.done)
          .frame(minWidth: AppleMetrics.tagFieldMinWidth, minHeight: AppleMetrics.tagPillHeight)
          .accessibilityLabel(Copy.text("web.editor.newTagLabel"))
          .focused($field, equals: .tag)
          .onSubmit(addTag)
          .onChange(of: draft) { _, value in
            if value.count > 30 { draft = String(value.prefix(30)) }
          }
      }
      .padding(.bottom, AppleMetrics.space12)
      .overlay(alignment: .bottom) {
        Rectangle().fill(AppleColors.line).frame(height: AppleMetrics.lineWidth)
      }
    }
    private var suggestions: some View {
      let standard =
        [
          "web.cards.bc62d1b6b936", "web.cards.ce9b12499c47", "web.cards.0e65f5e407c4",
          "web.cards.56c255e19858", "web.cards.15d208d1b4c9",
        ].map(Copy.text) + ["AI"]
      let offered = Array(Set(baselines.flatMap(\.tags) + standard)).sorted().filter {
        !tags.contains($0)
      }.prefix(6)
      return MobileFlowRow {
        ForEach(Array(offered), id: \.self) { tag in
          Button(tag) { append(tag) }
            .font(.system(size: AppleMetrics.font13)).foregroundStyle(AppleColors.primary)
            .padding(.horizontal, AppleMetrics.pillPaddingX)
            .frame(minHeight: AppleMetrics.pillHeight)
            .background(AppleColors.surface, in: Capsule()).buttonStyle(.plain)
        }
      }
    }
    private var noteEditor: some View {
      TextEditor(text: $note)
        .font(.system(size: AppleMetrics.font16))
        .scrollContentBackground(.hidden)
        .frame(minHeight: AppleMetrics.editorNoteMinHeight)
        .focused($field, equals: .note)
        .accessibilityLabel(Copy.text("web.editor.noteLabel"))
        .overlay(alignment: .topLeading) {
          if note.isEmpty {
            Text(Copy.text("web.editor.notePlaceholder"))
              .font(.system(size: AppleMetrics.font16)).foregroundStyle(AppleColors.secondary)
              .padding(.top, AppleMetrics.space8).padding(.leading, AppleMetrics.space4)
              .allowsHitTesting(false)
          }
        }
    }
    private func cleaned(_ value: String) -> String {
      var result = value.trimmingCharacters(in: .whitespacesAndNewlines)
      if result.hasPrefix("#") { result.removeFirst() }
      return String(result.prefix(30))
    }
    private func append(_ value: String) {
      guard !tags.contains(value) else { return }
      guard tags.count < 20 else {
        message = Copy.text("web.app.1859bc867672")
        return
      }
      tags.append(value)
      message = nil
      field = .tag
    }
    private func addTag() {
      let value = cleaned(draft)
      guard !value.isEmpty else { return }
      append(value)
      if tags.contains(value) { draft = "" }
    }
    private func save() {
      guard !workspace.busy, !workspace.unresolvedWrite else { return }
      addTag()
      guard draft.isEmpty, note.count <= 4000 else { return }
      let submittedTags = tags
      let submittedNote = note
      Task {
        if await workspace.saveBatchAnnotations(
          baselines: baselines, tags: submittedTags, note: submittedNote),
          tags == submittedTags, note == submittedNote, draft.isEmpty
        {
          close()
        }
      }
    }
  }
#endif

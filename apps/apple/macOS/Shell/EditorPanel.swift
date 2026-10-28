import AppKit
import SillKit
import SwiftUI

/// Web `Panels.editor`: tags and a note for one card, or tags for several (the note goes to the
/// first). Tags toggle as pills; Enter in the field adds one (30 characters, 20 tags at most).
/// The panel keeps what the cards held when it opened; saving checks that baseline first and,
/// on a conflict or a failed write, keeps everything typed.
struct EditorPanel: View {
  let ids: [String]
  @Environment(Workspace.self) private var workspace
  @Environment(Panels.self) private var panels
  @State private var tags: [String] = []
  @State private var draft = ""
  @State private var note = ""
  @State private var baseline: [String: Workspace.EditBaseline] = [:]
  @State private var saving = false
  @State private var loaded = false
  @State private var armed: String?
  @State private var duplicate: String?
  @State private var duplicateGeneration = 0
  @FocusState private var field: Field?
  private enum Field { case tag, note }

  static let tagLimit = 30
  static let tagCount = 20
  static let noteLimit = 4000

  var body: some View {
    let card = ids.first.flatMap(workspace.model)
    VStack(alignment: .leading, spacing: 0) {
      Text(card?.title ?? "")
        .font(.sans(AppleMetrics.font13))
        .foregroundStyle(AppleColors.secondary)
        .lineLimit(2)
        .padding(.trailing, AppleMetrics.space48)
        .padding(.bottom, AppleMetrics.space18)
        .accessibilityAddTraits(.isHeader)
      tagEditor
      suggestions(card)
      noteEditor
      footer
    }
    .onAppear(perform: load)
  }

  private var tagEditor: some View {
    FlowRow(spacing: AppleMetrics.space6) {
      ForEach(tags, id: \.self) { tag in
        let shaking = duplicate == tag && !Motion.keyboardDriven
        HStack(spacing: AppleMetrics.space2) {
          Text(tag)
          Button {
            toggle(tag)
          } label: {
            Icon("x", size: AppleMetrics.font12)
              .frame(width: AppleMetrics.tagRemoveSize, height: AppleMetrics.tagRemoveSize)
              .contentShape(Circle())
          }
          .buttonStyle(TagRemoveStyle())
          .modifier(TagRemoveEntrance())
          .accessibilityLabel(Copy.text("web.editor.removeTagPrefix") + tag)
        }
        .font(.sans(AppleMetrics.font13, .medium))
        .foregroundStyle(AppleColors.primary)
        .padding(.leading, AppleMetrics.space12)
        .padding(.trailing, AppleMetrics.space4)
        .frame(height: AppleMetrics.tagPillHeight)
        .background(Capsule().fill(armed == tag ? AppleColors.accentSoft : AppleColors.surface))
        .transition(
          Motion.keyboardDriven
            ? .identity
            : .asymmetric(
              insertion: .opacity.combined(with: .scale(scale: AppleMetrics.tagEnterScale))
                .combined(with: Motion.blur(AppleMetrics.space4)).animation(
                  .spring(
                    duration: AppleMetrics.tagEnterDuration, bounce: AppleMetrics.tagEnterBounce)),
              removal: .opacity.combined(with: Motion.blur(AppleMetrics.space2)).animation(
                Motion.ease(AppleMetrics.tagExitDuration)))
        )
        .keyframeAnimator(initialValue: CGFloat(0), trigger: duplicateGeneration) { content, x in
          content.offset(x: shaking ? x : 0)
        } keyframes: { _ in
          LinearKeyframe(4, duration: AppleMetrics.tagDuplicateDuration / 5)
          LinearKeyframe(-4, duration: AppleMetrics.tagDuplicateDuration / 5)
          LinearKeyframe(3, duration: AppleMetrics.tagDuplicateDuration / 5)
          LinearKeyframe(-3, duration: AppleMetrics.tagDuplicateDuration / 5)
          LinearKeyframe(0, duration: AppleMetrics.tagDuplicateDuration / 5)
        }
      }
      TextField(
        "", text: $draft,
        prompt: Text(Copy.text("web.editor.addTagPlaceholder")).foregroundStyle(
          AppleColors.secondary)
      )
      .textFieldStyle(.plain)
      .font(.sans(AppleMetrics.font13))
      .padding(.horizontal, AppleMetrics.space6)
      .frame(minWidth: AppleMetrics.tagFieldMinWidth, minHeight: AppleMetrics.tagPillHeight)
      .focused($field, equals: .tag)
      .accessibilityLabel(Copy.text("web.editor.newTagLabel"))
      .onChange(of: draft) { _, value in
        armed = nil
        guard (NSApp?.keyWindow?.firstResponder as? NSTextView)?.hasMarkedText() != true else {
          return
        }
        if value.contains(where: { ",，\n".contains($0) }) { addDraft() }
      }
      .onKeyPress(.delete) {
        guard (NSApp?.keyWindow?.firstResponder as? NSTextView)?.hasMarkedText() != true,
          draft.isEmpty, let last = tags.last
        else { return .ignored }
        if armed == last {
          toggle(last)
          armed = nil
        } else {
          armed = last
        }
        return .handled
      }
      .onSubmit(addDraft)
    }
    .animation(
      Motion.keyboardDriven ? nil : .spring(duration: AppleMetrics.tagEnterDuration, bounce: 0),
      value: tags
    )
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.bottom, AppleMetrics.space12)
    .overlay(alignment: .bottom) {
      Rectangle().fill(AppleColors.line).frame(height: AppleMetrics.lineWidth)
    }
  }

  @ViewBuilder private func suggestions(_ card: CardModel?) -> some View {
    let list = Self.suggestions(card: card, chosen: tags)
    if !list.isEmpty {
      FlowRow(spacing: AppleMetrics.space6) {
        ForEach(list, id: \.self) { tag in
          Button(tag) { toggle(tag) }
            .buttonStyle(SoftChipStyle())
        }
      }
      .padding(.top, AppleMetrics.space8)
    }
  }

  private var noteEditor: some View {
    ZStack(alignment: .topLeading) {
      if note.isEmpty {
        Text(Copy.text("web.editor.notePlaceholder"))
          .textStyle(AppleMetrics.font15, leading: AppleMetrics.editorNoteLeading)
          .foregroundStyle(AppleColors.secondary)
          .padding(.vertical, AppleMetrics.space4)
          .allowsHitTesting(false)
      }
      TextEditor(text: $note)
        .scrollContentBackground(.hidden)
        .textStyle(AppleMetrics.font15, leading: AppleMetrics.editorNoteLeading)
        .foregroundStyle(AppleColors.primary)
        .padding(.vertical, AppleMetrics.space4)
        .padding(.horizontal, -AppleMetrics.space4)
        .frame(minHeight: AppleMetrics.editorNoteMinHeight)
        .focused($field, equals: .note)
        .accessibilityLabel(Copy.text("web.editor.noteLabel"))
        .onChange(of: note) { _, value in
          if value.count > Self.noteLimit { note = String(value.prefix(Self.noteLimit)) }
        }
    }
    .padding(.top, AppleMetrics.space12)
  }

  private var footer: some View {
    HStack(spacing: AppleMetrics.space12) {
      HStack(spacing: AppleMetrics.space4) {
        if workspace.isLocal {
          Icon("lock", size: AppleMetrics.font13)
          Text(Copy.text("web.editor.deviceStorageHint"))
        } else {
          Text(Copy.text("web.cloud.savedAccount"))
        }
      }
      .font(.sans(AppleMetrics.font13))
      .foregroundStyle(AppleColors.secondary)
      Spacer(minLength: 0)
      Button(Copy.text("web.save"), action: save)
        .buttonStyle(SolidButtonStyle())
        .disabled(saving)
    }
    .padding(.top, AppleMetrics.space22)
  }

  // MARK: Actions

  private func load() {
    guard !loaded, let first = ids.first, let card = workspace.model(first) else { return }
    loaded = true
    tags = workspace.state(first).tags(of: card)
    note = workspace.state(first).note
    baseline = workspace.editBaseline(ids)
    field = .tag
  }

  /// Web `editor-tag`: a chosen tag goes, a suggested one joins.
  private func toggle(_ tag: String) {
    if let index = tags.firstIndex(where: { $0.caseInsensitiveCompare(tag) == .orderedSame }) {
      tags.remove(at: index)
    } else if tags.count >= Self.tagCount {
      workspace.toast(Copy.text("web.app.1859bc867672"))
    } else {
      tags.append(tag)
    }
    field = .tag
  }

  /// Web `add-tag`: trimmed, a leading # dropped, at most 30 characters.
  private func addDraft() {
    let values = Self.split(draft)
    guard !values.isEmpty else { return }
    for value in values {
      if let existing = tags.first(where: { $0.caseInsensitiveCompare(value) == .orderedSame }) {
        duplicate = existing
        duplicateGeneration += 1
      } else if tags.count < Self.tagCount {
        tags.append(value)
      } else {
        workspace.toast(Copy.text("web.app.1859bc867672"))
        break
      }
    }
    draft = ""
    field = .tag
  }

  private func save() {
    guard !saving else { return }
    var final = tags
    for pending in Self.split(draft) where final.count < Self.tagCount {
      if !final.contains(where: { $0.caseInsensitiveCompare(pending) == .orderedSame }) {
        final.append(pending)
      }
    }
    saving = true
    workspace.saveEdits(ids, tags: final, note: note, baseline: baseline) { result in
      saving = false
      switch result {
      case .saved: panels.close()
      case .conflict:
        // Typed text stays; the next save is checked against what is stored now.
        baseline = workspace.editBaseline(ids)
      case .failed, .busy: break
      }
    }
  }

  static func split(_ text: String) -> [String] {
    var seen: Set<String> = []
    return text.components(separatedBy: CharacterSet(charactersIn: ",，\n")).map(clean)
      .filter { !$0.isEmpty && seen.insert($0.lowercased()).inserted }
  }

  static func clean(_ text: String) -> String {
    var value = text.trimmingCharacters(in: .whitespacesAndNewlines)
    if value.hasPrefix("#") { value.removeFirst() }
    return String(value.prefix(tagLimit))
  }

  /// The card's own tags, then the standard ones, without those already chosen; six at most.
  static func suggestions(card: CardModel?, chosen: [String]) -> [String] {
    let standard = [
      Copy.text("web.cards.bc62d1b6b936"), Copy.text("web.cards.ce9b12499c47"),
      Copy.text("web.cards.0e65f5e407c4"), Copy.text("web.cards.56c255e19858"), "AI",
      Copy.text("web.cards.15d208d1b4c9"),
    ]
    var seen: Set<String> = []
    return ((card?.tags ?? []) + standard)
      .filter { tag in
        seen.insert(tag.lowercased()).inserted
          && !chosen.contains(where: { $0.caseInsensitiveCompare(tag) == .orderedSame })
      }
      .prefix(6).map { $0 }
  }
}

/// Web `.chip.soft`: a surface pill, 36 high. Its hover and press color is the same surface.
struct SoftChipStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.sans(AppleMetrics.font13))
      .foregroundStyle(AppleColors.primary)
      .lineLimit(1)
      .padding(.horizontal, AppleMetrics.pillPaddingX)
      .frame(minHeight: AppleMetrics.pillHeight)
      .background(Capsule().fill(AppleColors.surface))
      .contentShape(Capsule())
  }
}

/// Web `.tag-pill button`: 60% until hovered.
private struct TagRemoveStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    TagRemoveBody(configuration: configuration)
  }
}

private struct TagRemoveBody: View {
  let configuration: ButtonStyleConfiguration
  @Environment(\.isEnabled) private var enabled
  @State private var hovered = false
  var body: some View {
    let pressed = configuration.isPressed && enabled && !Motion.keyboardDriven
    configuration.label
      .opacity(hovered || configuration.isPressed ? 1 : AppleMetrics.tagRemoveOpacity)
      .scaleEffect(pressed ? AppleMetrics.motionPressScale : 1)
      .animation(Motion.press, value: pressed)
      .onHover { hovered = $0 }
  }
}

private struct TagRemoveEntrance: ViewModifier {
  @State private var shown = false
  func body(content: Content) -> some View {
    content.opacity(shown ? 1 : 0).onAppear {
      withAnimation(Motion.keyboardDriven ? nil : Motion.fast.delay(AppleMetrics.tagRemoveDelay)) {
        shown = true
      }
    }
  }
}

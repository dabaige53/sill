import AppKit
import SillKit
import SwiftUI

extension Desktop {
  func searchFilterRow<Content: View>(
    _ key: String, @ViewBuilder content: () -> Content
  ) -> some View {
    HStack(spacing: AppleMetrics.space8) {
      Text(Copy.text(key)).font(.system(size: AppleMetrics.font12))
        .foregroundStyle(AppleColors.secondary).frame(
          width: AppleMetrics.space28, alignment: .leading
        )
        .accessibilityHidden(true)
      ScrollView(.horizontal) {
        HStack(spacing: AppleMetrics.space8, content: content).padding(AppleMetrics.space4 / 2)
      }.scrollIndicators(.hidden).accessibilityElement(children: .contain)
        .accessibilityLabel(Copy.text(key))
    }
  }
  func chip(_ label: String, selected: Bool, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(label).font(.system(size: AppleMetrics.font13)).padding(
        .horizontal, AppleMetrics.space12
      ).padding(.vertical, AppleMetrics.space8)
        .foregroundStyle(selected ? AppleColors.card : AppleColors.primary)
        .background(selected ? AppleColors.primary : AppleColors.card, in: Capsule())
    }
    .buttonStyle(.plain).accessibilityAddTraits(selected ? .isSelected : [])
  }
  var selectionBar: some View {
    HStack(spacing: AppleMetrics.space8) {
      Text("\(model.selection.count)").font(.system(size: AppleMetrics.font14, design: .rounded))
        .monospacedDigit().padding(.leading, AppleMetrics.space12)
      Spacer()
      iconButton("bookmark", "web.selection.bookmark") { bulk("bookmarked") }
      iconButton("glasses", "web.selection.later") { bulk("later") }
      iconButton("tag", "web.selection.tag") { presentTags() }
      Rectangle().fill(AppleColors.primary.opacity(AppleMetrics.borderOpacity))
        .frame(width: 1, height: AppleMetrics.space24)
      iconButton("chat", "web.selection.aiOpen") { model.discussSelection() }
      iconButton("x", "web.selection.cancel") { model.selection.removeAll() }
    }.padding(AppleMetrics.railInset).frame(height: AppleMetrics.railRow).modifier(GlassSurface())
      .dropDestination(for: String.self) { ids, _ in
        let valid = ids.filter { id in model.cards.contains { $0.id == id } }
        guard !valid.isEmpty else { return false }
        if !model.selection.isDisjoint(with: valid) {
          model.discussSelection()
        } else {
          model.appendAIContext(valid)
          model.selection.removeAll()
        }
        aiDropTargeted = false
        return true
      } isTargeted: {
        aiDropTargeted = $0
      }
      .overlay {
        if aiDropTargeted {
          HStack {
            NativeIcon(name: "chat", size: AppleMetrics.space24)
            Text(Copy.text("web.selection.aiOpen"))
          }.frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(AppleColors.card, in: Capsule()).foregroundStyle(AppleColors.accent)
            .allowsHitTesting(false)
        }
      }
  }
  var metadataEditor: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space16) {
      HStack {
        Text(model.cards.first { $0.id == tagIds.first }?.title ?? "").font(
          .system(size: AppleMetrics.font15)
        ).foregroundStyle(AppleColors.secondary)
        Spacer()
        Button(Copy.text("web.cancel")) { tagEditor = false }
          .keyboardShortcut(.cancelAction).disabled(model.busy)
      }
      FlowLayout(spacing: AppleMetrics.space8) {
        ForEach(editingTags, id: \.self) { tag in
          HStack(spacing: AppleMetrics.space5) {
            Text(tag)
            Button {
              editingTags.removeAll { $0 == tag }
            } label: {
              NativeIcon(name: "x", size: AppleMetrics.font12)
            }
            .buttonStyle(.plain).accessibilityLabel(Copy.text("web.editor.removeTagPrefix") + tag)
          }.font(.system(size: AppleMetrics.font13)).padding(.horizontal, AppleMetrics.space10)
            .padding(.vertical, AppleMetrics.space8).background(AppleColors.surface, in: Capsule())
        }
      }
      TextField(Copy.text("web.editor.addTagPlaceholder"), text: $tagText).textFieldStyle(.plain)
        .accessibilityLabel(Copy.text("web.editor.newTagLabel")).onSubmit { appendTag() }
        .onChange(of: tagText) { if tagText.count > 30 { tagText = String(tagText.prefix(30)) } }
      FlowLayout(spacing: AppleMetrics.space8) {
        ForEach(tagSuggestions, id: \.self) { tag in
          chip(tag, selected: false) { if editingTags.count < 20 { editingTags.append(tag) } }
        }
      }
      TextField(Copy.text("web.editor.notePlaceholder"), text: $editingNote, axis: .vertical)
        .textFieldStyle(.plain).lineLimit(5...10)
        .accessibilityLabel(Copy.text("web.editor.noteLabel"))
        .padding(AppleMetrics.space12).background(
          AppleColors.surface, in: RoundedRectangle(cornerRadius: AppleMetrics.space12)
        )
        .onChange(of: editingNote) {
          if editingNote.count > 4000 { editingNote = String(editingNote.prefix(4000)) }
        }
      HStack(spacing: AppleMetrics.space8) {
        NativeIcon(name: "lock", size: AppleMetrics.font13)
        Text(Copy.text("web.editor.deviceStorageHint")).font(.system(size: AppleMetrics.font13))
          .foregroundStyle(AppleColors.secondary)
        Spacer()
        Button(Copy.text("web.save")) {
          appendTag()
          var patches: [String: JSONValue] = [:]
          for (index, id) in tagIds.enumerated() {
            var values: [String: JSONValue] = [
              "tagsEdited": .bool(true), "tags": .array(editingTags.map(JSONValue.string)),
            ]
            if index == 0 { values["note"] = .string(editingNote) }
            patches[id] = .object(values)
          }
          tagSaving = true
          model.batchPatch(patches, expectedRevision: tagRevision)
        }.buttonStyle(.borderedProminent).keyboardShortcut("s").disabled(model.busy)
      }
      if let error = model.error {
        Text(error).foregroundStyle(.red).textSelection(.enabled)
      }
    }.padding(AppleMetrics.railEdge)
  }
  private var tagSuggestions: [String] {
    let existing = model.cards.first { $0.id == tagIds.first }?.fields["tags"]?.strings ?? []
    var seen = Set(editingTags)
    return Array(
      (existing + [
        Copy.text("web.cards.bc62d1b6b936"), Copy.text("web.cards.ce9b12499c47"),
        Copy.text("web.cards.0e65f5e407c4"), Copy.text("web.cards.56c255e19858"), "AI",
        Copy.text("web.cards.15d208d1b4c9"),
      ]).filter { seen.insert($0).inserted }.prefix(6))
  }
  private func appendTag() {
    let value = tagText.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(
      of: "^#", with: "", options: .regularExpression)
    guard !value.isEmpty else { return }
    guard editingTags.count < 20 else {
      model.error = Copy.text("web.app.1859bc867672")
      return
    }
    if !editingTags.contains(value) { editingTags.append(String(value.prefix(30))) }
    tagText = ""
  }
  private func presentTags() {
    tagIds = model.cards.filter { model.selection.contains($0.id) }.map(\.id)
    tagRevision = model.revision
    let first = model.cards.first { $0.id == tagIds.first }
    editingTags = first.map { model.tags($0) } ?? []
    editingNote = tagIds.first.flatMap { model.items[$0]?["note"]?.string } ?? ""
    tagText = ""
    tagEditor = true
  }
  private func bulk(_ key: String) {
    let ids = Array(model.selection)
    let value = true
    guard !model.busy else { return }
    pendingUndo = Dictionary(
      uniqueKeysWithValues: ids.map {
        ($0, JSONValue.object([key: model.items[$0]?[key] ?? .bool(false)]))
      })
    pendingToast =
      key == "bookmarked"
      ? Copy.text("web.app.96e7ee93f3ba") + "\(ids.count)" + Copy.text("web.common.cardCountSuffix")
      : key == "later" ? "\(ids.count)" + Copy.text("web.app.34d0636b70c8") : ""
    bulkPending = true
    model.patch(ids, values: [key: .bool(value)])
  }
  var aiDock: some View {
    HStack(spacing: AppleMetrics.space4) {
      iconButton("plus", "web.ai.addUnavailable") {}.disabled(true)
      TextField(Copy.text("web.ai.dockPlaceholder"), text: $model.aiDraft)
        .textFieldStyle(.plain).font(.system(size: AppleMetrics.font16)).focused($aiFocused)
        .accessibilityLabel(Copy.text("web.ai.dock"))
        .onChange(of: model.aiDraft) {
          if model.aiDraft.count > 4000 { model.aiDraft = String(model.aiDraft.prefix(4000)) }
        }
      iconButton("mic", "web.ai.speak") {}.disabled(true)
      Button {
      } label: {
        NativeIcon(name: "up", size: AppleMetrics.space16)
          .frame(width: AppleMetrics.space32, height: AppleMetrics.space32)
          .foregroundStyle(AppleColors.card).background(AppleColors.surface, in: Circle())
      }.buttonStyle(.plain).disabled(true).accessibilityLabel(Copy.text("web.ai.sendUnavailable"))
    }.padding(.horizontal, AppleMetrics.space12).frame(height: AppleMetrics.railRow)
      .modifier(GlassSurface())
      .overlay(alignment: .bottomLeading) {
        if !model.aiCards.isEmpty {
          FlowLayout(spacing: AppleMetrics.space8) {
            ForEach(model.aiCards, id: \.self) { id in
              if let card = model.cards.first(where: { $0.id == id }) {
                HStack(spacing: AppleMetrics.space6) {
                  NativeIcon(name: card.nativeIcon, size: AppleMetrics.space14)
                  Text(card.title).lineLimit(1)
                  Button {
                    model.aiCards.removeAll { $0 == id }
                  } label: {
                    NativeIcon(name: "x", size: AppleMetrics.space12)
                      .frame(width: AppleMetrics.space20, height: AppleMetrics.space24)
                  }.buttonStyle(.plain).accessibilityLabel(
                    Copy.text("web.close") + " " + card.title)
                }.font(.system(size: AppleMetrics.font13)).padding(.horizontal, AppleMetrics.space8)
                  .frame(maxWidth: 260).frame(height: AppleMetrics.space32)
                  .background(
                    AppleColors.card, in: RoundedRectangle(cornerRadius: AppleMetrics.space10))
              }
            }
          }.padding(.bottom, AppleMetrics.railRow + AppleMetrics.space8)
        }
      }
      .dropDestination(for: String.self) { ids, _ in
        let valid = ids.filter { id in model.cards.contains { $0.id == id } }
        guard !valid.isEmpty else { return false }
        model.appendAIContext(valid)
        return true
      }
  }
  func iconButton(_ name: String, _ label: String, action: @escaping () -> Void)
    -> some View
  {
    Button(action: action) {
      NativeIcon(name: name, size: AppleMetrics.space20).frame(
        width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
    }
    .buttonStyle(.plain).accessibilityLabel(Copy.text(label)).help(Copy.text(label))
  }
}

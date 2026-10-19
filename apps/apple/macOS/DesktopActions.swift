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
  func nav(_ page: String, _ name: String, _ label: String) -> some View {
    Button {
      showRail()
      if page == "home" && model.page == "home" { homeTopRequest += 1 }
      model.presentNavigation(page)
    } label: {
      ZStack {
        if (model.settingsPresented ? "settings" : model.page) == page {
          Capsule().fill(AppleColors.primary.opacity(AppleMetrics.borderOpacity))
            .matchedGeometryEffect(id: "lens", in: navigation)
        }
        NativeIcon(name: name, size: AppleMetrics.space22)
          .foregroundStyle(
            AppleColors.primary.opacity(
              (model.settingsPresented ? "settings" : model.page) == page
                ? 1 : 0.62))
      }.animation(
        .timingCurve(0.32, 0.72, 0, 1, duration: AppleMetrics.motionLens),
        value: model.settingsPresented ? "settings" : model.page
      )
      .frame(width: AppleMetrics.navTab, height: AppleMetrics.railRow - AppleMetrics.railInset * 2)
    }.buttonStyle(.plain).accessibilityLabel(Copy.text(label)).help(Copy.text(label))
  }
  var selectionBar: some View {
    HStack(spacing: AppleMetrics.space8) {
      Text("\(model.selection.count)").font(.system(size: AppleMetrics.font14, design: .rounded))
        .monospacedDigit().padding(.leading, AppleMetrics.space12)
      iconButton("bookmark", "web.app.87aeb7040c82") { bulk("bookmarked") }
      iconButton("glasses", "web.app.d108c0a7e2c3") { bulk("later") }
      iconButton("tag", "web.app.b5816e5fd0be") { presentTags() }
      Rectangle().fill(AppleColors.primary.opacity(AppleMetrics.borderOpacity)).frame(
        width: 1, height: AppleMetrics.space24)
      iconButton("x", "web.app.74966e20df2e") { model.selection.removeAll() }
    }.padding(AppleMetrics.railInset).frame(height: AppleMetrics.railRow).modifier(GlassSurface())
      .overlay {
        Button {
          model.discussSelection()
        } label: {
          NativeIcon(name: "chat", size: AppleMetrics.space24).frame(
            maxWidth: .infinity, maxHeight: .infinity
          )
          .background(AppleColors.card, in: Capsule())
          .overlay(
            Capsule().strokeBorder(aiDropTargeted ? AppleColors.accent : .clear, lineWidth: 2)
          )
          .foregroundStyle(aiDropTargeted ? AppleColors.accent : AppleColors.primary)
        }.buttonStyle(.plain).accessibilityLabel(Copy.text("web.selection.aiOpen"))
          .focused($aiTargetFocused).opacity(aiDropTargeted || aiTargetFocused ? 1 : 0)
          .allowsHitTesting(aiDropTargeted || aiTargetFocused)
      }
      .dropDestination(for: String.self) { ids, _ in
        let valid = ids.filter { id in model.cards.contains { $0.id == id } }
        guard !valid.isEmpty else { return false }
        if !model.selection.isDisjoint(with: valid) {
          model.discussSelection()
        } else {
          model.aiCards = valid
          model.page = "ai"
        }
        aiDropTargeted = false
        return true
      } isTargeted: {
        aiDropTargeted = $0
        if $0 { showRail() }
      }
      .contextMenu {
        Button(Copy.text("web.selection.bookmark")) { bulk("bookmarked") }
        Button(Copy.text("web.selection.later")) { bulk("later") }
        Divider()
        Button(Copy.text("web.selection.tag")) { presentTags() }
        Divider()
        Button(Copy.text("web.selection.cancel")) {}
      }
  }
  var metadataEditor: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space16) {
      HStack {
        Text(model.cards.first { $0.id == tagIds.first }?.title ?? "").font(
          .system(size: AppleMetrics.font15)
        ).foregroundStyle(AppleColors.secondary)
        Spacer()
        iconButton("x", "web.close") { tagEditor = false }
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
            .buttonStyle(.plain).accessibilityLabel(Copy.text("web.panels.0d1e7200becb") + tag)
          }.font(.system(size: AppleMetrics.font13)).padding(.horizontal, AppleMetrics.space10)
            .padding(.vertical, AppleMetrics.space8).background(AppleColors.surface, in: Capsule())
        }
      }
      TextField(Copy.text("web.panels.795cbff909c4"), text: $tagText).textFieldStyle(.plain)
        .accessibilityLabel(Copy.text("web.panels.7e2f159f6491")).onSubmit { appendTag() }
        .onChange(of: tagText) { if tagText.count > 30 { tagText = String(tagText.prefix(30)) } }
      FlowLayout(spacing: AppleMetrics.space8) {
        ForEach(tagSuggestions, id: \.self) { tag in
          chip(tag, selected: false) { if editingTags.count < 20 { editingTags.append(tag) } }
        }
      }
      TextField(Copy.text("web.panels.9cdbdc0a45a7"), text: $editingNote, axis: .vertical)
        .textFieldStyle(.plain).lineLimit(5...10)
        .accessibilityLabel(Copy.text("web.panels.daede9881787"))
        .padding(AppleMetrics.space12).background(
          AppleColors.surface, in: RoundedRectangle(cornerRadius: AppleMetrics.space12)
        )
        .onChange(of: editingNote) {
          if editingNote.count > 4000 { editingNote = String(editingNote.prefix(4000)) }
        }
      HStack(spacing: AppleMetrics.space8) {
        NativeIcon(name: "lock", size: AppleMetrics.font13)
        Text(Copy.text("web.panels.b7325aa77693")).font(.system(size: AppleMetrics.font13))
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
        }.buttonStyle(CardPillStyle(primary: true, solid: true)).disabled(model.busy)
      }
    }.padding(AppleMetrics.railEdge).background(
      AppleColors.card, in: RoundedRectangle(cornerRadius: AppleMetrics.panelRadius))
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
      ? Copy.text("web.app.96e7ee93f3ba") + "\(ids.count)" + Copy.text("web.panels.e9e0fdc242b4")
      : key == "later" ? "\(ids.count)" + Copy.text("web.app.34d0636b70c8") : ""
    bulkPending = true
    model.patch(ids, values: [key: .bool(value)])
  }
  var aiPage: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space16) {
      Text(Copy.text("web.ai.title")).font(.system(size: AppleMetrics.space20, weight: .semibold))
      ScrollView {
        VStack(spacing: AppleMetrics.space12) {
          ForEach(model.aiCards.compactMap { id in model.cards.first { $0.id == id } }) { card in
            VStack(alignment: .leading, spacing: AppleMetrics.space8) {
              Text(card.title).font(.system(size: AppleMetrics.font17, weight: .semibold))
              let excerpt = String((card.summary.isEmpty ? card.body : card.summary).prefix(180))
              if !excerpt.isEmpty {
                Text(excerpt).font(.system(size: AppleMetrics.font15)).foregroundStyle(
                  AppleColors.secondary)
              }
            }.padding(AppleMetrics.cardPadding).frame(maxWidth: .infinity, alignment: .leading)
              .background(
                AppleColors.card, in: RoundedRectangle(cornerRadius: AppleMetrics.cardRadius)
              )
              .overlay(
                RoundedRectangle(cornerRadius: AppleMetrics.cardRadius).strokeBorder(
                  AppleColors.primary.opacity(AppleMetrics.borderOpacity)))
          }
        }
      }.frame(maxHeight: .infinity)
        .accessibilityLabel(Copy.text("web.ai.context"))
      HStack(alignment: .bottom, spacing: AppleMetrics.space8) {
        TextField(Copy.text("web.ai.placeholder"), text: $model.aiDraft, axis: .vertical)
          .textFieldStyle(.plain).lineLimit(3...8)
          .accessibilityLabel(Copy.text("web.ai.composer"))
          .onChange(of: model.aiDraft) {
            if model.aiDraft.count > 4000 { model.aiDraft = String(model.aiDraft.prefix(4000)) }
          }
        iconButton("send", "web.ai.sendUnavailable") {}.disabled(true)
      }.padding(AppleMetrics.space12).background(
        AppleColors.surface, in: RoundedRectangle(cornerRadius: AppleMetrics.space12))
    }.frame(maxWidth: .infinity, maxHeight: .infinity)
      .dropDestination(for: String.self) { ids, _ in
        for id in ids
        where model.cards.contains(where: { $0.id == id }) && !model.aiCards.contains(id) {
          model.aiCards.append(id)
        }
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
  func overlay<Content: View>(@ViewBuilder content: () -> Content) -> some View {
    ZStack {
      AppleColors.dim.ignoresSafeArea().onTapGesture { dismissTop() }
      content().shadow(
        color: AppleColors.shadow.opacity(0.18), radius: AppleMetrics.space40,
        y: AppleMetrics.space24)
    }.frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

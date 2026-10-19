import AppKit
import SillKit
import SwiftUI

struct CardReader: View {
  @EnvironmentObject var model: Workspace
  @Environment(\.colorScheme) private var colorScheme
  var availableSize = CGSize(width: 1100, height: 760)
  @State private var organizing = false
  @State private var why = false
  @State private var expanded = false
  @State private var editRevision = 0
  @State private var note = ""
  @State private var tags: [String] = []
  @State private var newTag = ""
  @State private var trail: [String] = []
  @State private var steppingBack = false
  @State private var mediaStep = 0
  @State private var playing = false
  @State private var submitting = false
  @State private var readingProgress = 0.0
  @State private var contentHeight: CGFloat = 280
  @State private var lastActivity = Date.now
  var body: some View {
    if let card = model.cards.first(where: { $0.id == model.selected }) {
      VStack(spacing: 0) {
        if expanded {
          GeometryReader { geometry in
            Rectangle().fill(AppleColors.accent).frame(width: geometry.size.width * readingProgress)
          }.frame(height: 2)
        }
        ScrollView {
          VStack(alignment: .leading, spacing: AppleMetrics.previewBodyGap) {
            if card.type == "photo" {
              CardMedia(card: card, detail: true)
            } else {
              if !expanded && card.type == "article" && card.fields["image"]?.string != nil {
                CardMedia(card: card, detail: true).padding(
                  .horizontal, AppleMetrics.space8 - AppleMetrics.previewPaddingX
                ).padding(.top, AppleMetrics.space8 - AppleMetrics.previewPaddingTop)
              }
              if card.type == "mail" {
                sender(card)
              } else if card.type == "event", let start = card.date("start") {
                Text(cardDay(start)).foregroundStyle(AppleColors.secondary).font(
                  .system(size: AppleMetrics.font13))
                eventHero(card, start)
              } else if card.type == "media" && card.fields["media"]?.string == "podcast" {
                podcastArtwork.frame(maxWidth: .infinity)
              } else {
                sourceMeta(card)
              }
              Text(card.title).font(
                .system(
                  size: card.type == "media" && card.fields["media"]?.string == "podcast"
                    ? AppleMetrics.font20
                    : expanded ? AppleMetrics.font30 : AppleMetrics.previewTitle, weight: .semibold)
              ).frame(
                maxWidth: .infinity,
                alignment: card.fields["media"]?.string == "podcast" ? .center : .leading
              ).multilineTextAlignment(
                card.fields["media"]?.string == "podcast" ? .center : .leading
              ).padding(
                .trailing,
                card.fields["media"]?.string == "podcast"
                  ? 0 : AppleMetrics.hitTarget * (card.paragraphs.isEmpty ? 1 : 2))
              if !model.tags(card).isEmpty { tagChips(model.tags(card), removable: false) }
              metadata(card)
              if card.type == "media" && card.fields["media"]?.string == "podcast" {
                sourceMeta(card)
              }
              if expanded && card.fields["image"]?.string != nil {
                CardMedia(card: card, detail: true)
              }
              detailContent(card)
              if let note = model.items[card.id]?["note"]?.string, !note.isEmpty {
                Text(note).font(.system(size: AppleMetrics.font15)).padding(AppleMetrics.space16)
                  .frame(maxWidth: .infinity, alignment: .leading).background(
                    AppleColors.surface, in: RoundedRectangle(cornerRadius: AppleMetrics.space12))
              }
              HStack(spacing: AppleMetrics.space12) {
                external(card)
                if card.fields["why"] != nil {
                  Button(Copy.text("web.panels.fdc032965548")) { why = true }.buttonStyle(.plain)
                    .foregroundStyle(AppleColors.secondary)
                }
              }.padding(.top, AppleMetrics.space8)
            }
          }.padding(.horizontal, AppleMetrics.previewPaddingX).padding(
            .top, AppleMetrics.previewPaddingTop
          ).padding(.bottom, AppleMetrics.previewPaddingX).frame(
            maxWidth: .infinity, alignment: .leading
          ).textSelection(.enabled)
            .background(
              GeometryReader { proxy in
                Color.clear.preference(key: ReaderContentHeight.self, value: proxy.size.height)
              }
            )
            .background(
              ScrollObservation(
                progressChanged: { progress in readingProgress = progress },
                overscroll: { direction in
                  if direction == "top" {
                    if expanded { expanded = false } else { model.selected = nil }
                  } else if direction == "bottom" && card.readable {
                    if model.items[card.id]?["read"]?.bool != true && !model.busy {
                      model.patch(
                        [card.id],
                        values: [
                          "read": .bool(true), "progress": .number(1),
                          "readAt": .number(Date.now.timeIntervalSince1970 * 1000),
                        ])
                    }
                    if model.preferences["collapseOnFinish"]?.bool != false { model.selected = nil }
                  }
                }
              ) { offset, bottom, userScrolled in
                if userScrolled { lastActivity = .now }
                if userScrolled && card.readable && bottom && offset > 0
                  && model.items[card.id]?["read"]?.bool != true && !model.busy
                {
                  model.patch(
                    [card.id],
                    values: [
                      "read": .bool(true), "progress": .number(1),
                      "readAt": .number(Date.now.timeIntervalSince1970 * 1000),
                    ])
                }
              })
        }.id(card.id)
        if card.type != "photo" {
          HStack(spacing: AppleMetrics.space4) {
            if card.type == "event" {
              tool("download", Copy.text("web.panels.5510cee6e987")) { exportCalendar(card) }
            } else {
              tool(
                "bookmark", Copy.text("web.bookmark"),
                active: model.items[card.id]?["bookmarked"]?.bool == true
              ) { model.toggle("bookmarked", card: card) }
            }
            tool("tag", Copy.text("web.panels.786e2e9252a8")) {
              editRevision = model.revision
              note = model.items[card.id]?["note"]?.string ?? ""
              tags = model.tags(card)
              newTag = ""
              submitting = false
              organizing = true
            }
            if ["event", "task", "reminder"].contains(card.type) {
              let state = model.items[card.id]
              if state?["dismissed"]?.bool != true && state?["reminderDone"]?.bool != true
                && (state?["snoozedUntil"]?.number ?? 0) == 0
              {
                tool("bell-off", Copy.text("web.panels.311b1a019362")) {
                  model.patch([card.id], values: ["dismissed": .bool(true)])
                }
              }
            } else if card.type != "file" {
              tool(
                "glasses", Copy.text("web.later"),
                active: model.items[card.id]?["later"]?.bool == true
              ) { model.toggle("later", card: card) }
            }
          }.padding(AppleMetrics.space8).modifier(GlassSurface()).padding(
            .bottom, AppleMetrics.space20)
        }
      }.background {
        if card.fields["media"]?.string == "podcast" {
          LinearGradient(
            stops: [
              .init(
                color: colorScheme == .dark
                  ? Color(red: 42 / 255, green: 38 / 255, blue: 34 / 255)
                  : Color(red: 244 / 255, green: 237 / 255, blue: 228 / 255), location: 0),
              .init(color: AppleColors.card, location: 0.7),
            ], startPoint: .top, endPoint: .bottom)
        }
      }.overlay(alignment: .topTrailing) {
        readerHead(card).padding(.top, expanded ? AppleMetrics.space12 : AppleMetrics.space32)
          .padding(.horizontal, AppleMetrics.space16)
      }.background(AppleColors.card).tint(AppleColors.accent)
        .frame(
          width: expanded
            ? availableSize.width
            : card.type == "photo"
              ? max(280, availableSize.width - AppleMetrics.space32)
              : min(AppleMetrics.readerWidth, max(280, availableSize.width - AppleMetrics.space32)),
          height: organizing
            ? min(AppleMetrics.editorHeight, max(280, availableSize.height - 64))
            : why
              ? min(max(400, contentHeight), max(280, availableSize.height - 64))
              : expanded
                ? availableSize.height
                : card.type == "photo"
                  ? max(280, availableSize.height - AppleMetrics.space32)
                  : min(max(180, contentHeight + 80), max(180, availableSize.height - 64))
        )
        .onPreferenceChange(ReaderContentHeight.self) { contentHeight = $0 }
        .simultaneousGesture(TapGesture().onEnded { lastActivity = .now })
        .onChange(of: expanded) { _, isExpanded in
          if isExpanded { lastActivity = .now } else { model.flushReading() }
        }
        .task(id: expanded) {
          guard expanded else { return }
          while !Task.isCancelled && expanded {
            do { try await Task.sleep(for: .seconds(1)) } catch { return }
            guard expanded, model.selected == card.id else { return }
            if NSApp.isActive && Date.now.timeIntervalSince(lastActivity) < 60 {
              model.recordReadingSecond()
            }
          }
        }
        .onDisappear { model.flushReading() }
        .onChange(of: model.selected) { old, new in
          if steppingBack { steppingBack = false } else if let old, new != nil { trail.append(old) }
          expanded = false
          mediaStep = 0
          playing = false
          readingProgress = 0
        }
        .task(id: playing) {
          guard playing else { return }
          if card.fields["media"]?.string != "podcast"
            && mediaStep == max(0, card.paragraphs.count - 1)
          {
            mediaStep = 0
          }
          while !Task.isCancelled && playing {
            do {
              try await Task.sleep(
                for: .seconds(card.fields["media"]?.string == "podcast" ? 1 : 2.5))
            } catch { return }
            guard playing, model.selected == card.id else { return }
            guard !model.busy else { continue }
            if card.fields["media"]?.string == "podcast" {
              let total = max(1, card.fields["duration"]?.number ?? 1)
              let progress = min(1, (model.items[card.id]?["progress"]?.number ?? 0) + 1 / total)
              model.patch(
                [card.id],
                values: [
                  "progress": .number(progress),
                  "read": .bool(progress >= 0.985 || model.items[card.id]?["read"]?.bool == true),
                ])
              if progress >= 1 { playing = false }
            } else if mediaStep < max(0, card.paragraphs.count - 1) {
              mediaStep += 1
              model.patch(
                [card.id],
                values: [
                  "progress": .number(
                    Double(mediaStep + 1) / Double(max(1, card.paragraphs.count))),
                  "read": .bool(mediaStep == card.paragraphs.count - 1),
                ])
            } else {
              playing = false
            }
          }
        }
        .onChange(of: model.error) { _, error in if error != nil { playing = false } }
        .overlay {
          if organizing || why {
            ZStack {
              Color.black.opacity(0.25).contentShape(Rectangle()).onTapGesture {
                if !model.busy {
                  organizing = false
                  why = false
                }
              }
              Group {
                if organizing { editor(card) } else { whyPanel(card) }
              }.background(
                AppleColors.card, in: RoundedRectangle(cornerRadius: AppleMetrics.panelRadius)
              )
              .shadow(
                color: .black.opacity(0.18), radius: AppleMetrics.space40, y: AppleMetrics.space24)
            }.onKeyPress(.escape) {
              if !model.busy {
                organizing = false
                why = false
              }
              return .handled
            }
          }
        }
    }
  }
  @ViewBuilder private func readerHead(_ card: Card) -> some View {
    if expanded {
      HStack(spacing: AppleMetrics.space4) {
        tool("collapse", Copy.text("web.panels.0f1505b6ad3f")) { expanded = false }
        tool("x", Copy.text("web.panels.f2a5f3f7db0f")) { model.selected = nil }.keyboardShortcut(
          .cancelAction)
      }.padding(AppleMetrics.space6).modifier(GlassSurface())
    } else {
      HStack(spacing: AppleMetrics.space8) {
        if let previous = trail.last {
          headTool("back", Copy.appleBack) {
            steppingBack = true
            trail.removeLast()
            model.selected = previous
          }
        }
        Spacer()
        if !card.paragraphs.isEmpty
          && !["event", "mail", "media", "task", "reminder", "digest", "file", "photo"].contains(
            card.type)
        {
          headTool("expand", Copy.text("web.panels.22ea3f47fee8")) { expanded = true }
        }
        headTool("x", Copy.text("web.panels.1eb05d311508")) { model.selected = nil }
          .keyboardShortcut(.cancelAction)
      }
    }
  }
  private func headTool(_ icon: String, _ label: String, action: @escaping () -> Void) -> some View
  {
    Button(action: action) {
      NativeIcon(name: icon, size: AppleMetrics.font20).frame(
        width: AppleMetrics.space36, height: AppleMetrics.space36
      ).background(AppleColors.card, in: Circle()).overlay(
        Circle().strokeBorder(
          AppleColors.primary.opacity(AppleMetrics.borderOpacity), lineWidth: 0.5)
      ).shadow(color: AppleColors.shadow.opacity(0.05), radius: 2, y: 1).shadow(
        color: AppleColors.shadow.opacity(0.07), radius: 18, y: 6
      ).frame(width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
    }.buttonStyle(.plain).accessibilityLabel(label).help(label)
  }
  @ViewBuilder private func detailContent(_ card: Card) -> some View {
    if card.type == "event" {
      VStack(spacing: 0) {
        if let meeting = card.fields["meeting"] {
          detailRow("video", meeting["name"]?.string ?? "", side: meeting["code"]?.string ?? "")
        }
        if let location = card.fields["location"]?.string { detailRow("pin", location) }
        if let people = card.fields["people"]?.strings, !people.isEmpty {
          detailRow(
            "at", people.joined(separator: "、"),
            side: "\(people.count)" + Copy.text("web.panels.d63842643d06"))
        }
      }
      paragraphs(card)
      ReminderActions(card: card)
    } else if card.type == "file" {
      VStack(spacing: 0) {
        ForEach(Array((card.fields["files"]?.array ?? []).enumerated()), id: \.offset) { _, file in
          HStack(spacing: AppleMetrics.space12) {
            NativeIcon(name: "file", size: AppleMetrics.font16)
            VStack(alignment: .leading, spacing: AppleMetrics.space4) {
              Text(file["name"]?.string ?? "")
              Text(file["meta"]?.string ?? "").font(.system(size: AppleMetrics.font13))
                .foregroundStyle(AppleColors.secondary)
            }
            Spacer()
            if let time = file["time"]?.number {
              Text(cardDay(Date(timeIntervalSince1970: time / 1000))).font(
                .system(size: AppleMetrics.font12)
              ).foregroundStyle(AppleColors.secondary)
            }
          }.padding(.vertical, AppleMetrics.space12)
        }
      }
    } else if card.type == "media" {
      media(card)
    } else {
      if card.type != "mail" && !card.summary.isEmpty && card.fields["form"]?.string != "quote"
        && card.summary != card.paragraphs.first
      {
        Text(card.summary).font(.system(size: AppleMetrics.font17)).foregroundStyle(
          AppleColors.secondary
        ).lineSpacing(AppleMetrics.space6)
      }
      if let points = card.fields["points"]?.strings {
        ForEach(Array(points.enumerated()), id: \.offset) { i, point in
          HStack(alignment: .firstTextBaseline, spacing: AppleMetrics.space10) {
            Text("\(i + 1)").foregroundStyle(AppleColors.accent)
            Text(point)
          }.font(.system(size: AppleMetrics.font15))
        }
      }
      if card.type == "suggestion" { CardReferences(card: card) }
      if card.type == "task" {
        VStack(spacing: AppleMetrics.space8) {
          ForEach(Array((card.fields["tasks"]?.array ?? []).enumerated()), id: \.offset) {
            _, task in CardTaskRow(card: card, task: task)
          }
        }
      }
      if ["task", "reminder"].contains(card.type) {
        ReminderActions(card: card)
      } else {
        paragraphs(card)
      }
      if card.type == "mail", let attachment = card.fields["attachment"]?.string {
        detailRow("file", attachment)
      }
    }
  }
  private func paragraphs(_ card: Card) -> some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space20) {
      ForEach(
        Array(
          (card.paragraphs.isEmpty && card.type == "mail" ? [card.summary] : card.paragraphs)
            .enumerated()), id: \.offset
      ) { _, text in
        Text(text).font(.system(size: AppleMetrics.font17)).lineSpacing(AppleMetrics.space10).frame(
          maxWidth: .infinity, alignment: .leading)
      }
    }
  }
  private func sender(_ card: Card) -> some View {
    HStack(spacing: AppleMetrics.space10) {
      CardAvatar(name: card.fields["sender"]?.string ?? card.source, size: 36)
      VStack(alignment: .leading, spacing: AppleMetrics.space4) {
        Text(card.fields["sender"]?.string ?? card.source).fontWeight(.semibold)
        Text(Copy.text("web.panels.711078d887e0") + (card.fields["meta"]?.string ?? "")).font(
          .system(size: AppleMetrics.font13)
        ).foregroundStyle(AppleColors.secondary)
      }
    }
  }
  private func eventHero(_ card: Card, _ start: Date) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: AppleMetrics.space12) {
      Text(cardTime(start)).font(
        .system(size: AppleMetrics.font44, weight: .medium, design: .rounded))
      if let end = card.date("end") {
        Text(
          Copy.text("web.templates.83532308ecca") + cardTime(end)
            + " · \(Int(end.timeIntervalSince(start) / 60))"
            + Copy.text("web.templates.40de54344d22")
        ).font(.system(size: AppleMetrics.font15, design: .rounded)).foregroundStyle(
          AppleColors.secondary)
      }
    }
  }
  private func detailRow(_ icon: String, _ text: String, side: String = "") -> some View {
    HStack(spacing: AppleMetrics.space12) {
      NativeIcon(name: icon, size: AppleMetrics.font16).foregroundStyle(AppleColors.secondary)
      Text(text)
      Spacer()
      if !side.isEmpty {
        Text(side).foregroundStyle(AppleColors.secondary).font(.system(size: AppleMetrics.font13))
      }
    }.font(.system(size: AppleMetrics.font15)).padding(.vertical, AppleMetrics.space12)
  }
  @ViewBuilder private func external(_ card: Card) -> some View {
    if card.type == "event", let start = card.date("start"), let end = card.date("end"),
      start.timeIntervalSinceNow <= 900, end > .now,
      let raw = card.fields["meeting"]?["url"]?.string, let url = URL(string: raw)
    {
      Link(Copy.text("web.templates.451755e3831f"), destination: url).buttonStyle(
        CardPillStyle(primary: true, solid: true))
    } else if let raw = card.value.url, let url = URL(string: raw),
      ["http", "https"].contains(url.scheme ?? "")
    {
      Link(externalLabel(card), destination: url).buttonStyle(
        CardPillStyle(primary: true, solid: true))
    }
  }
  private func tool(
    _ icon: String, _ label: String, active: Bool = false, action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      NativeIcon(name: icon, size: AppleMetrics.font20).foregroundStyle(
        active ? AppleColors.accent : AppleColors.primary
      ).frame(width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
    }.buttonStyle(.plain).accessibilityLabel(label).help(label).disabled(model.busy)
  }
  private func metadata(_ card: Card) -> some View {
    let keys = [
      ("published_at", "publishedAt", "web.metadata.published"),
      ("saved_at", "savedAt", "web.metadata.saved"),
      ("created_at", "created_at", "web.metadata.created"),
      ("updated_at", "updated_at", "web.metadata.updated"),
    ]
    return VStack(alignment: .leading, spacing: AppleMetrics.space6) {
      ForEach(keys, id: \.0) { key, fallback, label in
        if let text = card.dateText(card.fields[key] == nil ? fallback : key),
          !(key == "updated_at" && text == card.dateText("created_at"))
        {
          HStack(alignment: .firstTextBaseline, spacing: AppleMetrics.space12) {
            Text(Copy.text(label)).frame(width: 64, alignment: .leading)
            Text(text)
          }
        }
      }
      if !["task", "reminder", "event", "mail", "file"].contains(card.type),
        let meta = card.fields["meta"]?.string, !meta.isEmpty
      {
        HStack(alignment: .firstTextBaseline, spacing: AppleMetrics.space12) {
          Text(Copy.text("web.metadata.note")).frame(width: 64, alignment: .leading)
          Text(meta)
        }
      }
    }.font(.system(size: AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
  }
  private func tagChips(_ values: [String], removable: Bool) -> some View {
    ViewThatFits(in: .horizontal) {
      HStack(spacing: AppleMetrics.space8) {
        ForEach(values, id: \.self) { tag in tagChip(tag, removable) }
      }
      VStack(alignment: .leading, spacing: AppleMetrics.space8) {
        ForEach(values, id: \.self) { tag in tagChip(tag, removable) }
      }
    }
  }
  private func tagChip(_ tag: String, _ removable: Bool) -> some View {
    HStack(spacing: AppleMetrics.space6) {
      Text((removable ? "" : "#") + tag)
      if removable {
        Button {
          tags.removeAll { $0 == tag }
        } label: {
          NativeIcon(name: "x", size: AppleMetrics.font12)
        }.buttonStyle(.plain).accessibilityLabel(Copy.text("web.panels.0d1e7200becb") + tag)
      }
    }.font(.system(size: AppleMetrics.font13)).padding(.horizontal, AppleMetrics.space10).padding(
      .vertical, AppleMetrics.space6
    ).background(AppleColors.surface, in: Capsule())
  }
  private func editor(_ card: Card) -> some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space18) {
      HStack {
        Text(card.title).font(.system(size: AppleMetrics.font15)).foregroundStyle(
          AppleColors.secondary)
        Spacer()
        tool("x", Copy.text("web.panels.2d41b6a035a0")) { organizing = false }
      }
      tagChips(tags, removable: true)
      TextField(Copy.text("web.panels.795cbff909c4"), text: $newTag).textFieldStyle(.plain).onSubmit
      { addTag() }.onChange(of: newTag) { _, text in
        if text.count > 30 { newTag = String(text.prefix(30)) }
      }
      let suggestions = Array(
        Set(
          (card.fields["tags"]?.strings ?? []) + [
            Copy.text("web.cards.bc62d1b6b936"), Copy.text("web.cards.ce9b12499c47"),
            Copy.text("web.cards.0e65f5e407c4"), Copy.text("web.cards.56c255e19858"), "AI",
            Copy.text("web.cards.15d208d1b4c9"),
          ])
      ).filter { !tags.contains($0) }.sorted()
      HStack {
        ForEach(suggestions.prefix(6), id: \.self) { value in
          Button(value) { tags.append(value) }.buttonStyle(CardPillStyle())
        }
      }
      TextEditor(text: $note).font(.system(size: AppleMetrics.font15)).scrollContentBackground(
        .hidden
      ).accessibilityLabel(Copy.text("web.panels.daede9881787")).onChange(of: note) { _, text in
        if text.count > 4000 { note = String(text.prefix(4000)) }
      }
      if let error = model.error {
        Text(error).font(.system(size: AppleMetrics.font13)).foregroundStyle(AppleColors.error)
      }
      HStack {
        NativeIcon(name: "lock", size: AppleMetrics.font13)
        Text(Copy.text("web.panels.b7325aa77693")).font(.system(size: AppleMetrics.font13))
          .foregroundStyle(AppleColors.secondary)
        Spacer()
        Button(Copy.text("web.save")) {
          addTag()
          submitting = true
          model.patch(
            [card.id],
            values: [
              "note": .string(note), "tags": .array(tags.map(JSONValue.string)),
              "tagsEdited": .bool(true),
            ], expectedRevision: editRevision)
        }.buttonStyle(CardPillStyle(primary: true, solid: true)).disabled(model.busy)
      }
    }.padding(AppleMetrics.space28).frame(
      width: min(AppleMetrics.editorWidth, max(280, availableSize.width - 64)),
      height: min(AppleMetrics.editorHeight, max(280, availableSize.height - 64))
    )
    .onChange(of: model.busy) { old, busy in
      if submitting && old && !busy {
        submitting = false
        if model.error == nil { organizing = false }
      }
    }

  }
  private func addTag() {
    let value = newTag.trimmingCharacters(in: .whitespacesAndNewlines)
    if !value.isEmpty && !tags.contains(value) { tags.append(String(value.prefix(30))) }
    newTag = ""
  }
  private func whyPanel(_ card: Card) -> some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space16) {
      HStack {
        Text(Copy.text("web.panels.fdc032965548")).font(
          .system(size: AppleMetrics.font21, weight: .semibold))
        Spacer()
        tool("x", Copy.appleCloseReader) { why = false }
      }
      detailRow("sparkles", card.fields["why"]?["reason"]?.string ?? "")
      ForEach(card.fields["why"]?["basis"]?.strings ?? [], id: \.self) { detailRow("clock", $0) }
      CardReferences(card: card)
      HStack {
        Button(Copy.text("web.panels.e31c8842b98a")) { why = false }
        Button(Copy.text("web.panels.a54a0add5447")) {
          model.patch([card.id], values: ["dismissed": .bool(true)])
          why = false
        }
      }.buttonStyle(.plain).foregroundStyle(AppleColors.secondary)
    }.padding(AppleMetrics.space28).frame(
      width: min(AppleMetrics.editorWidth, max(280, availableSize.width - 64)))
  }
  private var podcastArtwork: some View {
    RoundedRectangle(cornerRadius: AppleMetrics.cardRadius).fill(
      LinearGradient(
        stops: [
          .init(color: Color(red: 217 / 255, green: 203 / 255, blue: 187 / 255), location: 0),
          .init(color: Color(red: 239 / 255, green: 230 / 255, blue: 219 / 255), location: 0.55),
          .init(color: Color(red: 205 / 255, green: 188 / 255, blue: 170 / 255), location: 1),
        ], startPoint: .topLeading, endPoint: .bottomTrailing)
    ).frame(width: AppleMetrics.playerArtSize, height: AppleMetrics.playerArtSize).shadow(
      color: .black.opacity(0.12), radius: AppleMetrics.previewPaddingX, y: AppleMetrics.space12)
  }
  private func sourceMeta(_ card: Card) -> some View {
    HStack(spacing: AppleMetrics.space6) {
      CardSourceGlyph(card: card)
      Text(card.source.isEmpty ? card.typeLabel : card.source)
    }.font(.system(size: AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
  }
  private func externalLabel(_ card: Card) -> String {
    if card.type == "mail" { return Copy.text("web.panels.cf945e21ddef") }
    if card.type == "media" && card.fields["media"]?.string == "podcast" {
      return Copy.text("web.panels.c7f9a9b3d472")
    }
    let destination =
      ["rss", "local", "capture"].contains(card.sourceKind)
      ? Copy.text("web.panels.354b28c85333") : Copy.text("source.type." + card.sourceKind)
    return Copy.text("web.panels.99ae21ea6c39") + destination
  }
  private func media(_ card: Card) -> some View {
    let total = card.fields["duration"]?.number ?? 0
    let progress = model.items[card.id]?["progress"]?.number ?? 0
    return VStack(spacing: AppleMetrics.space16) {
      if card.fields["media"]?.string == "podcast" {

        ProgressView(value: progress).tint(AppleColors.primary)
        HStack {
          Text(cardDuration(total * progress))
          Spacer()
          Text("-" + cardDuration(total * (1 - progress)))
        }.font(.system(size: AppleMetrics.font13, design: .rounded)).foregroundStyle(
          AppleColors.secondary)
        HStack(spacing: AppleMetrics.space20) {
          tool("rewind", Copy.text("web.panels.e18eb0c65e26")) { seek(card, delta: -15) }
          tool(playing ? "pause" : "play", Copy.text("web.panels.c3396195e91c")) {
            playing.toggle()
          }
          tool("ffwd", Copy.text("web.panels.ec8b7a23ea62")) { seek(card, delta: 30) }
        }
      } else {
        CardMedia(card: card, detail: true)
        if !card.paragraphs.isEmpty {
          Text(card.paragraphs[min(mediaStep, card.paragraphs.count - 1)]).font(
            .system(size: AppleMetrics.font17))
        }
        HStack {
          tool("back", Copy.text("web.panels.b445bfa61071")) { mediaStep = max(0, mediaStep - 1) }
          tool(playing ? "pause" : "play", Copy.text("web.panels.105587569775")) {
            playing.toggle()
          }
          Text("\(mediaStep + 1) / \(max(1, card.paragraphs.count))").font(
            .system(size: AppleMetrics.font13, design: .rounded))
          tool("arrow", Copy.text("web.panels.abd1f787accc")) {
            mediaStep = min(max(0, card.paragraphs.count - 1), mediaStep + 1)
          }
        }
      }
    }
  }
  private func seek(_ card: Card, delta: Double) {
    let total = card.fields["duration"]?.number ?? 0
    guard total > 0 else { return }
    model.patch(
      [card.id],
      values: [
        "progress": .number(
          min(1, max(0, (model.items[card.id]?["progress"]?.number ?? 0) + delta / total)))
      ])
  }
  private func exportCalendar(_ card: Card) {
    guard let start = card.date("start"), let end = card.date("end") else { return }
    let formatter = DateFormatter()
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyyMMdd'T'HHmmss'Z'"
    let escape: (String) -> String = {
      $0.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\n", with: "\\n")
        .replacingOccurrences(of: ",", with: "\\,").replacingOccurrences(of: ";", with: "\\;")
    }
    let text = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Sill//Calendar//ZH", "BEGIN:VEVENT",
      "UID:\(escape(card.id))@sill", "DTSTART:\(formatter.string(from: start))",
      "DTEND:\(formatter.string(from: end))", "SUMMARY:\(escape(card.title))",
      "LOCATION:\(escape(card.fields["location"]?.string ?? ""))", "END:VEVENT", "END:VCALENDAR",
    ].joined(separator: "\r\n")
    let panel = NSSavePanel()
    panel.nameFieldStringValue = "\(card.title).ics"
    panel.begin { response in
      if response == .OK, let url = panel.url {
        do { try text.write(to: url, atomically: true, encoding: .utf8) } catch {
          model.error = Copy.appleWriteError
        }
      }
    }
  }
}

private struct ReaderContentHeight: PreferenceKey {
  static let defaultValue: CGFloat = 280
  static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

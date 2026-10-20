import AppKit
import SillKit
import SwiftUI

extension CardReader {
  func readerHead(_ card: Card) -> some View {
    HStack {
      if !model.readerTrail.isEmpty {
        Button(Copy.appleBack, systemImage: "chevron.left") { model.dismissReader() }
          .labelStyle(.iconOnly).buttonStyle(.bordered).help(Copy.appleBack)
      }
      Spacer()
      HStack(spacing: AppleMetrics.space8) {
        if !card.paragraphs.isEmpty {
          Button(
            Copy.text(expanded ? "web.reader.exitFullscreen" : "web.preview.fullscreen"),
            systemImage: expanded
              ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right"
          ) { expanded.toggle() }
          .labelStyle(.iconOnly).buttonStyle(.bordered)
          .help(Copy.text(expanded ? "web.reader.exitFullscreen" : "web.preview.fullscreen"))
        }
        Button(Copy.text("web.preview.close"), systemImage: "xmark") { model.dismissReader() }
          .labelStyle(.iconOnly).buttonStyle(.bordered).help(Copy.text("web.preview.close"))
      }
    }
  }

  @ViewBuilder func detailContent(_ card: Card) -> some View {
    if card.type == "event" {
      VStack(spacing: 0) {
        if let meeting = card.fields["meeting"] {
          detailRow("video", meeting["name"]?.string ?? "", side: meeting["code"]?.string ?? "")
        }
        if let location = card.fields["location"]?.string { detailRow("pin", location) }
        if let people = card.fields["people"]?.strings, !people.isEmpty {
          detailRow(
            "at", people.joined(separator: "、"),
            side: "\(people.count)" + Copy.text("web.preview.peopleCountSuffix"))
        }
      }
      paragraphs(card)
    } else if card.type == "file" {
      VStack(spacing: 0) {
        ForEach(Array((card.fields["files"]?.array ?? []).enumerated()), id: \.offset) { _, file in
          HStack(spacing: AppleMetrics.space12) {
            NativeIcon(name: "file", size: AppleMetrics.font16)
            VStack(alignment: .leading, spacing: AppleMetrics.space4) {
              Text(file["name"]?.string ?? "")
              Text(fileDetails(file)).font(.system(size: AppleMetrics.font13))
                .foregroundStyle(AppleColors.secondary)
            }
            Spacer()
            if let date = file["modifiedAt"]?.string {
              Text(date).font(.system(size: AppleMetrics.font12))
                .foregroundStyle(AppleColors.secondary)
            }
            if let raw = file["url"]?.string, let url = URL(string: raw) {
              Link(destination: url) { NativeIcon(name: "arrow", size: AppleMetrics.font16) }
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
        Text(card.summary).font(.system(size: AppleMetrics.font17, weight: .medium))
          .foregroundStyle(
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
          ForEach((card.fields["tasks"]?.array ?? []).map(CardTaskEntry.init)) { entry in
            CardTaskRow(card: card, task: entry.value)
          }
        }
      }
      paragraphs(card)
      if card.type == "mail", let attachment = card.fields["attachment"]?.string {
        detailRow("file", attachment)
      }
    }
  }
  func paragraphs(_ card: Card) -> some View {
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
  func sender(_ card: Card) -> some View {
    HStack(spacing: AppleMetrics.space10) {
      if let name = card.senderName { CardAvatar(name: name, size: 36) }
      VStack(alignment: .leading, spacing: AppleMetrics.space4) {
        if let name = card.senderName { Text(name).fontWeight(.semibold) }
        if !card.recipients.isEmpty {
          Text(
            Copy.text("web.metadata.recipients") + " · " + card.recipients.joined(separator: " / ")
          )
          .font(.system(size: AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
        }
      }
    }
  }
  func eventHero(_ card: Card, _ start: Date) -> some View {
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
  private struct ReaderAction: Identifiable {
    let id: String
    let icon: String
    let label: String
  }
  private func readerActions(_ card: Card) -> [ReaderAction] {
    var actions: [ReaderAction] = []
    let state = model.items[card.id]
    let settled =
      state?["dismissed"]?.bool == true || state?["reminderDone"]?.bool == true
      || (state?["snoozedUntil"]?.number ?? 0) > 0
    if card.type == "mail" {
      if safeURL(card.value.url) != nil {
        actions.append(.init(id: "reply", icon: "reply", label: Copy.text("web.preview.reply")))
      }
    } else if ["event", "task", "reminder"].contains(card.type) {
      let joining =
        card.type == "event" && (card.date("start")?.timeIntervalSinceNow ?? .infinity) <= 900
        && (card.date("end") ?? .distantPast) > .now
        && safeURL(card.fields["meeting"]?["url"]?.string) != nil
      if joining {
        actions.append(
          .init(id: "join", icon: "video", label: Copy.text("web.templates.451755e3831f")))
      }
      let restore =
        state?["dismissed"]?.bool == true || (state?["snoozedUntil"]?.number ?? 0) > 0
        || (state?["reminderDone"]?.bool == true && card.type != "reminder")
      actions.append(
        .init(
          id: "snooze", icon: restore ? "bell" : "snooze",
          label: Copy.text(restore ? "web.reminder.restore" : "web.reminder.again")))
      let dismiss = ReaderAction(
        id: "dismiss", icon: "bell-off", label: Copy.text("web.preview.dismissReminder"))
      if joining && !settled { actions.append(dismiss) }
      if card.type == "event" {
        actions.append(
          .init(id: "download", icon: "download", label: Copy.text("web.preview.downloadCalendar")))
      }
      if !joining && !settled { actions.append(dismiss) }
    } else if card.type != "file", safeURL(card.value.url) != nil {
      actions.append(.init(id: "open", icon: "external", label: externalLabel(card)))
    }
    let hidden = Set(model.preferences["hiddenActions"]?.strings ?? [])
    return Array(actions.filter { !hidden.contains($0.id) }.prefix(3))
  }
  @ViewBuilder func readerToolbar(_ card: Card) -> some View {
    let hidden = Set(model.preferences["hiddenActions"]?.strings ?? [])
    let shared = ["bookmark", "tag", "later"].filter { !hidden.contains($0) }
    let own = readerActions(card)
    if !shared.isEmpty || !own.isEmpty {
      HStack(spacing: AppleMetrics.space4) {
        ForEach(shared, id: \.self) { action in
          if action == "bookmark" {
            let active = model.items[card.id]?["bookmarked"]?.bool == true
            tool(
              "bookmark", Copy.text(active ? "web.preview.removeBookmark" : "web.bookmark"),
              active: active
            ) {
              model.toggle("bookmarked", card: card)
            }
          } else if action == "tag" {
            tool("tag", Copy.text("web.editor.openTagsAndNote")) {
              editRevision = model.revision
              note = model.items[card.id]?["note"]?.string ?? ""
              tags = model.tags(card)
              newTag = ""
              submitting = false
              organizing = true
            }
          } else {
            let active = model.items[card.id]?["later"]?.bool == true
            tool(
              "glasses", Copy.text(active ? "web.preview.removeLater" : "web.later"), active: active
            ) {
              model.toggle("later", card: card)
            }
          }
        }
        if !shared.isEmpty && !own.isEmpty {
          Rectangle().fill(AppleColors.secondary.opacity(AppleMetrics.borderOpacity))
            .frame(width: 1, height: AppleMetrics.space20).padding(.horizontal, AppleMetrics.space4)
        }
        ForEach(own) { action in
          tool(action.icon, action.label, active: true) { performReaderAction(action.id, card) }
        }
      }.padding(AppleMetrics.space8).modifier(GlassSurface())
        .accessibilityLabel(Copy.text("web.preview.cardTools"))

    }
  }
  func reminderCompletion(_ card: Card) -> some View {
    ReminderCompletion(card: card)
  }
  private func safeURL(_ raw: String?) -> URL? {
    guard let raw, let url = URL(string: raw), ["http", "https"].contains(url.scheme ?? "") else {
      return nil
    }
    return url
  }
  private func performReaderAction(_ action: String, _ card: Card) {
    switch action {
    case "download": exportCalendar(card)
    case "open", "reply", "join":
      if let url = safeURL(
        action == "join" ? card.fields["meeting"]?["url"]?.string : card.value.url)
      {
        NSWorkspace.shared.open(url)
      }
    case "dismiss":
      model.patch([card.id], values: ["dismissed": .bool(true), "snoozedUntil": .number(0)])
    case "snooze":
      let state = model.items[card.id]
      let restore =
        state?["dismissed"]?.bool == true || (state?["snoozedUntil"]?.number ?? 0) > 0
        || (state?["reminderDone"]?.bool == true && card.type != "reminder")
      model.patch(
        [card.id],
        values: [
          "snoozedUntil": .number(
            restore ? 0 : Date.now.addingTimeInterval(600).timeIntervalSince1970 * 1000),
          "dismissed": .bool(false), "reminderDone": .bool(false),
        ])
    default: break
    }
  }
  func tool(
    _ icon: String, _ label: String, active: Bool = false, action: @escaping () -> Void
  ) -> some View {
    Button(label, systemImage: NativeIcon.symbol(for: icon), action: action)
      .labelStyle(.iconOnly).buttonStyle(.borderless)
      .font(.system(size: AppleMetrics.font18))
      .frame(width: AppleMetrics.space36, height: AppleMetrics.space36)
      .foregroundStyle(active ? AnyShapeStyle(.tint) : AnyShapeStyle(.primary))
      .help(label).disabled(model.busy)
  }
  private func fileDetails(_ file: JSONValue) -> String {
    var parts = [file["mimeType"]?.string].compactMap { $0 }
    if let bytes = file["sizeBytes"]?.number {
      parts.append(ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file))
    }
    return parts.joined(separator: " · ")
  }
  @ViewBuilder func metadata(_ card: Card) -> some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space4) {
      let authors = (card.fields["authors"]?.array ?? []).compactMap { $0["name"]?.string }
      if !authors.isEmpty {
        Text(Copy.text("web.metadata.authors") + " · " + authors.joined(separator: " / "))
      }
      if let publisher = card.fields["publisher"]?["name"]?.string {
        Text(Copy.text("web.metadata.publisher") + " · " + publisher)
      }
      if let text = card.dateText("publishedAt") {
        let parts = text.prefix(10).split(separator: "-").compactMap { Int($0) }
        if parts.count == 3 {
          let year =
            parts[0] == Calendar.current.component(.year, from: Date()) ? "" : "\(parts[0])年"
          Text("\(year)\(parts[1])月\(parts[2])日").help(text)
        }
      }
      ForEach(["sentAt", "takenAt"], id: \.self) { field in
        if let text = card.dateText(field) {
          Text(
            Copy.text(field == "sentAt" ? "web.metadata.sent" : "web.metadata.taken") + " · " + text
          )
        }
      }
      if let zone = card.fields["timeZone"]?.string { Text(zone) }
      if let project = card.fields["project"]?["name"]?.string {
        Text(Copy.text("web.metadata.project") + " · " + project)
      }
      if let count = card.fields["chapterCount"]?.number {
        Text(Copy.text("web.metadata.chapters") + " \(Int(count))")
      }
      if let start = card.dateText("coverageStart"), let end = card.dateText("coverageEnd") {
        Text(Copy.text("web.metadata.coverage") + " " + start + " – " + end)
      }
      if let caption = card.fields["caption"]?.string { Text(caption) }
    }
  }
  @ViewBuilder func personalNote(_ card: Card) -> some View {
    if let note = model.items[card.id]?["note"]?.string,
      !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    {
      VStack(alignment: .leading, spacing: AppleMetrics.space8) {
        Text(Copy.text("web.metadata.note")).font(.system(size: AppleMetrics.font12))
          .foregroundStyle(AppleColors.secondary)
        Text(note).font(.system(size: AppleMetrics.font15))
      }.padding(AppleMetrics.space16).frame(maxWidth: .infinity, alignment: .leading)
        .background(AppleColors.surface, in: RoundedRectangle(cornerRadius: AppleMetrics.space12))
        .overlay(
          RoundedRectangle(cornerRadius: AppleMetrics.space12)
            .strokeBorder(AppleColors.primary.opacity(AppleMetrics.borderOpacity), lineWidth: 0.5))
    }
  }

  func tagChips(_ values: [String], removable: Bool) -> some View {
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
        }.buttonStyle(.plain).accessibilityLabel(Copy.text("web.editor.removeTagPrefix") + tag)
      }
    }.font(.system(size: AppleMetrics.font13)).padding(.horizontal, AppleMetrics.space10).padding(
      .vertical, AppleMetrics.space6
    ).background(AppleColors.surface, in: Capsule())
  }
}

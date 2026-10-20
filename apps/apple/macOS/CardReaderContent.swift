import AppKit
import SillKit
import SwiftUI

extension CardReader {
  @ViewBuilder func readerHead(_ card: Card) -> some View {
    if expanded {
      HStack(spacing: AppleMetrics.space4) {
        tool("collapse", Copy.text("web.panels.0f1505b6ad3f")) { expanded = false }
        tool("x", Copy.text("web.panels.f2a5f3f7db0f")) { model.dismissReader() }.keyboardShortcut(
          .cancelAction)
      }.padding(AppleMetrics.space6).modifier(GlassSurface())
    } else {
      HStack(spacing: AppleMetrics.space8) {
        if !model.readerTrail.isEmpty {
          headTool("back", Copy.appleBack) {
            model.dismissReader()
          }
        }
        Spacer()
        if !card.paragraphs.isEmpty
          && !["event", "mail", "media", "task", "reminder", "digest", "file", "photo"].contains(
            card.type)
        {
          headTool("expand", Copy.text("web.panels.22ea3f47fee8")) { expanded = true }
        }
        headTool("x", Copy.text("web.panels.1eb05d311508")) { model.dismissReader() }
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
      CardAvatar(name: card.fields["sender"]?.string ?? card.source, size: 36)
      VStack(alignment: .leading, spacing: AppleMetrics.space4) {
        Text(card.fields["sender"]?.string ?? card.source).fontWeight(.semibold)
        if let recipients = card.fields["recipients"]?.strings, !recipients.isEmpty {
          Text(Copy.text("web.metadata.recipients") + " · " + recipients.joined(separator: " / "))
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
  @ViewBuilder func external(_ card: Card) -> some View {
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
  func tool(
    _ icon: String, _ label: String, active: Bool = false, action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      NativeIcon(name: icon, size: AppleMetrics.font20).foregroundStyle(
        active ? AppleColors.accent : AppleColors.primary
      ).frame(width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
    }.buttonStyle(.plain).accessibilityLabel(label).help(label).disabled(model.busy)
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
        }.buttonStyle(.plain).accessibilityLabel(Copy.text("web.panels.0d1e7200becb") + tag)
      }
    }.font(.system(size: AppleMetrics.font13)).padding(.horizontal, AppleMetrics.space10).padding(
      .vertical, AppleMetrics.space6
    ).background(AppleColors.surface, in: Capsule())
  }
}

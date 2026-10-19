import AppKit
import SillKit
import SwiftUI

extension CardReader {
  func editor(_ card: Card) -> some View {
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
  var podcastArtwork: some View {
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
  func sourceMeta(_ card: Card) -> some View {
    HStack(spacing: AppleMetrics.space6) {
      CardSourceGlyph(card: card)
      Text(card.source.isEmpty ? card.typeLabel : card.source).lineLimit(1)
      metadata(card).fixedSize()
    }.font(.system(size: AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
  }
  func externalLabel(_ card: Card) -> String {
    if card.type == "mail" { return Copy.text("web.panels.cf945e21ddef") }
    if card.type == "media" && card.fields["media"]?.string == "podcast" {
      return Copy.text("web.panels.c7f9a9b3d472")
    }
    let destination =
      ["rss", "local", "capture"].contains(card.sourceKind)
      ? Copy.text("web.panels.354b28c85333") : Copy.text("source.type." + card.sourceKind)
    return Copy.text("web.panels.99ae21ea6c39") + destination
  }
  func media(_ card: Card) -> some View {
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
        Text(Copy.text("web.media.playbackUnavailable"))
          .font(.system(size: AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
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
  func exportCalendar(_ card: Card) {
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

import AppKit
import SillKit
import SwiftUI

extension CardReader {
  func editor(_ card: Card) -> some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space18) {
      HStack {
        Text(card.title).font(.body).foregroundStyle(
          AppleColors.secondary)
        Spacer()
        Button(Copy.text("web.cancel")) { organizing = false }
          .keyboardShortcut(.cancelAction).disabled(model.busy)
      }
      tagChips(tags, removable: true)
      TextField(Copy.text("web.editor.addTagPlaceholder"), text: $newTag).textFieldStyle(.plain)
        .onSubmit { addTag() }.onChange(of: newTag) { _, text in
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
          Button(value) { tags.append(value) }.buttonStyle(.bordered)
        }
      }
      TextEditor(text: $note).font(.body).scrollContentBackground(
        .hidden
      ).accessibilityLabel(Copy.text("apple.note")).onChange(of: note) { _, text in
        if text.count > 4000 { note = String(text.prefix(4000)) }
      }
      if let error = model.error {
        Text(error).font(.callout).foregroundStyle(AppleColors.error)
      }
      HStack {
        NativeIcon(name: "lock", size: AppleMetrics.font13)
        Text(Copy.text("web.editor.deviceStorageHint")).font(.callout)
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
        }.buttonStyle(.borderedProminent).keyboardShortcut("s").disabled(model.busy)
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
  @ViewBuilder func sourceMeta(_ card: Card) -> some View {
    if !card.sourceLine.isEmpty {
      HStack(spacing: AppleMetrics.space6) {
        CardSourceGlyph(card: card)
        Text(card.sourceLine).lineLimit(1)
      }.font(.callout).foregroundStyle(AppleColors.secondary)
    }
  }
  func externalLabel(_ card: Card) -> String {
    if card.type == "mail" { return Copy.text("web.preview.reply") }
    if card.type == "media" && card.fields["media"]?.string == "podcast" {
      return Copy.text("web.preview.podcast.openApp")
    }
    let destination =
      ["", "rss", "local", "capture"].contains(card.sourceKind)
      ? Copy.text("web.preview.originalSource") : Copy.text("source.type." + card.sourceKind)
    return Copy.text("web.preview.openSourcePrefix") + destination
  }
  func media(_ card: Card) -> some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space16) {
      if card.fields["image"]?.string != nil { CardMedia(card: card, detail: true) }
      if let duration = card.mediaDurationText {
        Text(duration).font(.system(size: AppleMetrics.font13, design: .rounded))
          .foregroundStyle(AppleColors.secondary)
      }
      paragraphs(card)
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

#if os(iOS)
import SillKit
import SwiftUI
import UniformTypeIdentifiers

struct MobileCalendarDocument: FileDocument {
  static let contentType = UTType(filenameExtension: "ics") ?? .data
  static let readableContentTypes = [contentType]
  let data: Data

  init?(_ card: MobileCard) {
    guard let start = card.start, let end = card.end else { return nil }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withYear, .withMonth, .withDay, .withTime, .withTimeZone]
    formatter.timeZone = TimeZone(identifier: "UTC")
    var lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Sill//ZH", "BEGIN:VEVENT",
      "UID:\(card.id)@sill.local", "DTSTAMP:\(formatter.string(from: .now))",
      "DTSTART:\(formatter.string(from: Date(timeIntervalSince1970: start / 1000)))",
      "DTEND:\(formatter.string(from: Date(timeIntervalSince1970: end / 1000)))",
      "SUMMARY:\(Self.escape(card.title))",
    ]
    if let location = card.location { lines.append("LOCATION:\(Self.escape(location))") }
    lines += ["END:VEVENT", "END:VCALENDAR"]
    data = Data((lines.joined(separator: "\r\n") + "\r\n").utf8)
  }
  init(configuration: ReadConfiguration) throws {
    guard let data = configuration.file.regularFileContents else {
      throw CocoaError(.fileReadCorruptFile)
    }
    self.data = data
  }
  func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
    FileWrapper(regularFileWithContents: data)
  }
  private static func escape(_ value: String) -> String {
    value.replacingOccurrences(of: "\\", with: "\\\\")
      .replacingOccurrences(of: ";", with: "\\;")
      .replacingOccurrences(of: ",", with: "\\,")
      .replacingOccurrences(of: "\r\n", with: "\\n")
      .replacingOccurrences(of: "\n", with: "\\n")
      .replacingOccurrences(of: "\r", with: "\\n")
  }
}

struct MobileMarkdown: View {
  let document: MarkdownBody
  var textScale: CGFloat = 1
  var strong = false
  var spacing: CGFloat = 1
  @ScaledMetric(relativeTo: .body) private var dynamicScale: CGFloat = 1
  var body: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.rhythmItem * spacing) {
      ForEach(Array(document.blocks.enumerated()), id: \.offset) { index, block in
        Group {
          if block.rule { Divider() }
          else if !block.cells.isEmpty {
            ScrollView(.horizontal) {
              HStack(alignment: .top, spacing: AppleMetrics.space16) {
                ForEach(Array(block.cells.enumerated()), id: \.offset) { _, cell in
                  Text(attributed(cell, heading: block.heading)).textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
                }
              }
            }
          } else {
            HStack(alignment: .top, spacing: AppleMetrics.space8) {
              if !block.marker.isEmpty { Text(block.marker) }
              Text(attributed(block.runs, heading: block.heading))
                .frame(maxWidth: .infinity, alignment: .leading).textSelection(.enabled)
                .accessibilityAddTraits(block.heading > 0 ? .isHeader : [])
            }
            .padding(.leading, CGFloat(block.depth) * AppleMetrics.space12)
            .padding(block.code ? AppleMetrics.space12 : 0)
            .background(block.code ? AppleColors.surface : .clear,
              in: RoundedRectangle(cornerRadius: AppleMetrics.controlRadius))
            .padding(.leading, block.quoteDepth > 0 ? AppleMetrics.space12 : 0)
            .overlay(alignment: .leading) {
              if block.quoteDepth > 0 { Rectangle().fill(AppleColors.line).frame(width: AppleMetrics.space2) }
            }
          }
        }.id("paragraph-\(index)")
      }
    }.lineSpacing(AppleMetrics.space6 * spacing)
  }

  private func attributed(_ runs: [MarkdownBody.Run], heading: Int) -> AttributedString {
    runs.reduce(into: AttributedString()) { result, run in
      var text = AttributedString(run.text)
      var font = MobileContentStyle.font(heading > 0 ? AppleMetrics.font21 : AppleMetrics.font17,
        weight: run.bold || heading > 0 ? .semibold : .regular,
        design: run.code ? .monospaced : .default, scale: textScale * dynamicScale, strong: strong)
      if run.italic { font = font.italic() }
      text.font = font
      text.strikethroughStyle = run.strike ? .single : nil
      text.link = run.link
      result.append(text)
    }
  }
}

struct MobileAnnotations: View {
  let workspace: MobileWorkspace
  @State private var baseline: MobileCard
  @Environment(\.dismiss) private var dismiss
  @State private var tags = ""
  @State private var note = ""
  @State private var loaded = false

  init(workspace: MobileWorkspace, baseline: MobileCard) {
    self.workspace = workspace
    _baseline = State(initialValue: baseline)
  }

  var body: some View {
    NavigationStack {
      Form {
        Section(Copy.text("apple.tag")) {
          TextField(Copy.text("apple.tagsPlaceholder"), text: $tags)
        }
        Section(Copy.text("apple.note")) {
          TextEditor(text: $note).frame(minHeight: AppleMetrics.editorNoteMinHeight)
            .accessibilityLabel(Copy.text("apple.note"))
        }
        if let error = workspace.error { Text(error).foregroundStyle(AppleColors.warning) }
      }
      .navigationTitle(Copy.text("apple.organize"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(Copy.text("apple.cancel")) { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(Copy.text("apple.save")) {
            Task {
              let values = tags.components(separatedBy: CharacterSet(charactersIn: ",，\n"))
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
              if await workspace.saveAnnotations(baseline, tags: values, note: note) { dismiss() }
            }
          }.disabled(workspace.busy || workspace.unresolvedWrite)
        }
      }
    }
    .interactiveDismissDisabled(tags != baseline.tags.joined(separator: ", ") || note != baseline.note)
    .onAppear {
      guard !loaded else { return }
      loaded = true
      tags = baseline.tags.joined(separator: ", ")
      note = baseline.note
    }
  }
}

struct MobileRemoteImage: View {
  let url: URL
  let title: String
  var body: some View {
    AsyncImage(url: url) { phase in
      switch phase {
      case .success(let image): image.resizable().scaledToFit()
      case .failure:
        Text(Copy.text("ios.photoUnavailable")).font(.system(size: AppleMetrics.font13))
          .foregroundStyle(AppleColors.secondary).frame(maxWidth: .infinity, maxHeight: .infinity)
      default: Rectangle().fill(AppleColors.surface)
      }
    }.accessibilityLabel(title)
  }
}

struct MobilePhotos: View {
  let urls: [URL]
  let title: String
  @State private var selection = 0
  var body: some View {
    VStack(spacing: AppleMetrics.space12) {
      TabView(selection: $selection) {
        ForEach(Array(urls.enumerated()), id: \.offset) { index, url in
          MobileRemoteImage(url: url, title: title).tag(index)
        }
      }.tabViewStyle(.page(indexDisplayMode: .automatic))
        .frame(height: AppleMetrics.playerArtSize)
      if urls.count > 1 {
        HStack {
          Button(Copy.text("web.photo.previous")) { selection = max(0, selection - 1) }
            .disabled(selection == 0)
          Spacer()
          Text("\(selection + 1) / \(urls.count)").monospacedDigit()
          Spacer()
          Button(Copy.text("web.photo.next")) { selection = min(urls.count - 1, selection + 1) }
            .disabled(selection == urls.count - 1)
        }.font(.system(size: AppleMetrics.font13))
      }
    }
  }
}
#endif

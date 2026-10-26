#if os(iOS)
  import SillKit
  import SwiftUI
  import UniformTypeIdentifiers
  import UIKit

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
    var openCard: (String, Bool) -> Void = { _, _ in }
    var cardExists: (String) -> Bool = { _ in false }
    @ScaledMetric(relativeTo: .body) private var dynamicScale: CGFloat = 1

    /// Keep consecutive table rows in a single grid so columns share one measured width.
    private var groups: [Range<Int>] {
      var groups: [Range<Int>] = []
      var index = 0
      while index < document.blocks.count {
        let start = index
        index += 1
        if !document.blocks[start].cells.isEmpty {
          while index < document.blocks.count && !document.blocks[index].cells.isEmpty
            && document.blocks[index].heading == 0
          { index += 1 }
        }
        groups.append(start..<index)
      }
      return groups
    }

    var body: some View {
      VStack(alignment: .leading, spacing: AppleMetrics.rhythmItem * spacing) {
        ForEach(groups, id: \.lowerBound) { range in
          Group {
            if !document.blocks[range.lowerBound].cells.isEmpty {
              table(range)
            } else {
              paragraph(document.blocks[range.lowerBound])
            }
          }
          .id("paragraph-\(range.lowerBound)")
          .mobileReaderAnchor("paragraph-\(range.lowerBound)")
        }
      }
      .lineSpacing(
        max(
          0,
          AppleMetrics.font17 * textScale * dynamicScale * AppleMetrics.readerBodyLeading * spacing
            - UIFont.systemFont(ofSize: AppleMetrics.font17 * textScale * dynamicScale).lineHeight)
      )
      .tint(AppleColors.accent)
      .environment(
        \.openURL,
        OpenURLAction { url in
          if let id = Self.cardID(url) {
            if cardExists(id) { openCard(id, url.fragment?.hasPrefix("read/") == true) }
            return .handled
          }
          return MarkdownBody.safeURL(url.absoluteString) == nil ? .discarded : .systemAction
        })
    }

    @ViewBuilder private func paragraph(_ block: MarkdownBody.Block) -> some View {
      if block.rule {
        Divider()
      } else {
        HStack(alignment: .top, spacing: AppleMetrics.space8) {
          if !block.marker.isEmpty { Text(block.marker) }
          Text(attributed(block.runs, heading: block.heading))
            .frame(maxWidth: .infinity, alignment: .leading).textSelection(.enabled)
            .accessibilityAddTraits(block.heading > 0 ? .isHeader : [])
        }
        .padding(.leading, CGFloat(block.depth) * AppleMetrics.space12)
        .padding(block.code ? AppleMetrics.space12 : 0)
        .background(
          block.code ? AppleColors.surface : .clear,
          in: RoundedRectangle(cornerRadius: AppleMetrics.controlRadius)
        )
        .padding(.leading, block.quoteDepth > 0 ? AppleMetrics.space12 : 0)
        .overlay(alignment: .leading) {
          if block.quoteDepth > 0 {
            Rectangle().fill(AppleColors.line).frame(width: AppleMetrics.space2)
          }
        }
      }
    }

    private func table(_ range: Range<Int>) -> some View {
      ScrollView(.horizontal) {
        Grid(alignment: .topLeading, horizontalSpacing: AppleMetrics.space16, verticalSpacing: 0) {
          ForEach(Array(range), id: \.self) { index in
            let block = document.blocks[index]
            GridRow(alignment: .top) {
              ForEach(Array(block.cells.enumerated()), id: \.offset) { column, cell in
                let alignment =
                  block.tableAlignments.indices.contains(column)
                  ? block.tableAlignments[column] : "left"
                Text(attributed(cell, heading: block.heading))
                  .textSelection(.enabled)
                  .frame(
                    width: AppleMetrics.space160 * textScale,
                    alignment: alignment == "right"
                      ? .trailing : alignment == "center" ? .center : .leading
                  )
                  .multilineTextAlignment(
                    alignment == "right" ? .trailing : alignment == "center" ? .center : .leading
                  )
                  .fixedSize(horizontal: false, vertical: true)
                  .padding(.vertical, AppleMetrics.space8)
              }
            }
            if index < range.upperBound - 1 { Divider().gridCellUnsizedAxes(.horizontal) }
          }
        }
      }
    }

    static func cardID(_ url: URL) -> String? {
      let relative = url.scheme == nil && url.host == nil && url.path.isEmpty
      let local =
        ["localhost", "127.0.0.1", "::1", "[::1]"].contains(url.host ?? "")
        && [4318, 5173].contains(url.port ?? 0)
      let cloud =
        url.scheme == "https" && url.host == "sill-web-preview.scs1213-temp-email.workers.dev"
        && (url.port == nil || url.port == 443)
      guard relative || (["http", "https"].contains(url.scheme ?? "") && (local || cloud)),
        url.path.isEmpty || url.path == "/", let fragment = url.fragment,
        fragment.range(of: "^(?:card|read)/[A-Za-z0-9_-]+$", options: .regularExpression) != nil
      else { return nil }
      return String(fragment.split(separator: "/")[1])
    }

    private func attributed(_ runs: [MarkdownBody.Run], heading: Int) -> AttributedString {
      runs.reduce(into: AttributedString()) { result, run in
        var text = AttributedString(run.text)
        var font = MobileContentStyle.font(
          heading > 0 ? AppleMetrics.font21 : AppleMetrics.font17,
          weight: run.bold || heading > 0 ? .semibold : .regular,
          design: run.code ? .monospaced : .default, scale: textScale * dynamicScale, strong: strong
        )
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
      .interactiveDismissDisabled(
        tags != baseline.tags.joined(separator: ", ") || note != baseline.note
      )
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
      MobileCoverImage(source: url.absoluteString, contentMode: .fit).accessibilityLabel(title)
    }
  }
#endif

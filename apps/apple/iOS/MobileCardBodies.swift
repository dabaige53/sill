#if os(iOS)
  import SillKit
  import SwiftUI

  /// Thirteen phone forms share headers, source identity and typography with their reader.
  struct MobileCardBody: View {
    let workspace: MobileWorkspace
    let card: MobileCard
    let query: String
    let faded: Bool
    let scale: CGFloat
    let strong: Bool
    let paddingScale: CGFloat
    let stackLabel: String?
    @Binding var pressed: Bool
    let open: () -> Void
    let titleAction: () -> Void
    let openRelated: ((String) -> Void)?
    @State private var taskOrder: [String] = []
    @Environment(\.openURL) var openURL

    var body: some View {
      Group {
        switch card.type {
        case "article": article
        case "mail": mail
        case "note": note
        case "task": tasks
        case "event": event
        case "reminder": reminder
        case "media": media
        case "digest": digest
        case "suggestion": suggestion
        case "photo": photo
        case "file": files
        case "pr": pullRequest
        default: article
        }
      }.foregroundStyle(AppleColors.primary)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    func font(_ size: CGFloat, weight: Font.Weight = .regular, design: Font.Design = .default)
      -> Font
    {
      MobileContentStyle.font(size, weight: weight, design: design, scale: scale, strong: strong)
    }
    func area<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
      Button(action: open, label: content).buttonStyle(MobileCardOpenStyle(pressed: $pressed))
        .accessibilityHint(Copy.text("apple.openHint"))
    }
    func stack<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
      VStack(alignment: .leading, spacing: AppleMetrics.space8 * paddingScale, content: content)
        .padding(AppleMetrics.space16 * paddingScale)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    func head(
      _ text: String? = nil, trailing: String = "", color: Color = AppleColors.secondary,
      progress: Bool = false
    ) -> some View {
      area {
        MobileCardHeader(
          card: card, text: text ?? card.presentationSourceLine,
          trailing: stackLabel ?? trailing, trailingColor: color,
          progress: stackLabel == nil && progress && !card.read ? card.progress : 0,
          scale: scale, strong: strong)
      }
    }
    func title(
      _ text: String? = nil, size: CGFloat = AppleMetrics.font16,
      weight: Font.Weight = .semibold, lines: Int = 2,
      leading: CGFloat = AppleMetrics.cardTitleLeading
    ) -> some View {
      Button(action: titleAction) {
        MobileHighlightedText(value: text ?? card.title, query: query)
          .font(font(size, weight: weight)).foregroundStyle(
            faded ? AppleColors.secondary : AppleColors.primary
          )
          .lineLimit(lines).lineSpacing(
            MobileContentStyle.lineSpacing(size * scale, ratio: leading)
          )
          .tracking(size * scale * AppleMetrics.cardTitleTracking)
          .multilineTextAlignment(.leading).frame(maxWidth: .infinity, alignment: .leading)
      }.buttonStyle(MobileCardOpenStyle(pressed: $pressed))
    }
    @ViewBuilder func summary(_ text: String? = nil, lines: Int = 2) -> some View {
      let value = text ?? card.displaySummary
      if !value.isEmpty {
        area {
          MobileHighlightedText(value: value, query: query).font(font(AppleMetrics.font14))
            .foregroundStyle(AppleColors.secondary).lineLimit(lines)
            .lineSpacing(
              MobileContentStyle.lineSpacing(
                AppleMetrics.font14 * scale, ratio: AppleMetrics.summaryLeading)
            )
            .multilineTextAlignment(.leading).frame(maxWidth: .infinity, alignment: .leading)
        }
      }
    }
    func moreItems(_ count: Int, suffix: String = "") -> some View {
      area {
        Text(Copy.text("web.templates.dff74742a6f0") + String(count) + suffix)
          .font(font(AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
    func fileRow(_ value: JSONValue) -> some View {
      let name = value["name"]?.string ?? ""
      let ext = (name as NSString).pathExtension.lowercased()
      return HStack(spacing: AppleMetrics.space6) {
        MobileIcon(
          ["png", "jpg", "jpeg", "gif", "webp"].contains(ext) ? "image" : "file",
          size: AppleMetrics.font15)
        Text(name).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
      }.font(font(AppleMetrics.font13))
        .padding(.vertical, AppleMetrics.space6).padding(.horizontal, AppleMetrics.space10)
        .background(AppleColors.surface, in: RoundedRectangle(cornerRadius: AppleMetrics.space10))
    }

    private var article: some View {
      VStack(spacing: 0) {
        if let image = card.coverSource {
          area {
            MobileCoverImage(source: image, faded: faded).frame(
              height: AppleMetrics.mobileArticleCoverHeight
            )
            .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.coverRadius))
          }.padding([.top, .horizontal], AppleMetrics.coverInset)
        }
        stack {
          head(progress: true)
          title()
          summary(lines: 4)
        }
      }
    }
    private var mail: some View {
      stack {
        if let sender = card.sender?.trimmingCharacters(in: .whitespacesAndNewlines),
          !sender.isEmpty
        {
          area {
            HStack(spacing: AppleMetrics.space8) {
              MobileAvatar(name: sender, size: AppleMetrics.space20)
              Text(sender).font(font(AppleMetrics.font12, weight: .semibold)).lineLimit(1)
                .layoutPriority(1)
              Text("·").foregroundStyle(AppleColors.secondary)
              MobileSourceMark(card: card, size: AppleMetrics.space12)
              Text(card.presentationSourceLine).font(font(AppleMetrics.font12))
                .foregroundStyle(AppleColors.secondary).lineLimit(1)
              Spacer(minLength: 0)
            }
          }
        } else {
          head()
        }
        title()
        summary(lines: 4)
        if !card.attachments.isEmpty {
          VStack(alignment: .leading, spacing: AppleMetrics.space6) {
            ForEach(Array(card.attachments.prefix(2).enumerated()), id: \.offset) { _, attachment in
              area { fileRow(attachment) }
            }
            if card.attachments.count > 2 { moreItems(card.attachments.count - 2) }
          }
        }
      }
    }
    private var note: some View {
      stack {
        head(progress: card.sourceKind != "capture" && card.raw["form"]?.string != "quote")
        if card.raw["form"]?.string == "quote" {
          title(
            size: AppleMetrics.font21, weight: .medium, lines: Int(AppleMetrics.quoteLines),
            leading: AppleMetrics.quoteLeading)
        } else if card.sourceKind == "capture" {
          title(
            card.summary.isEmpty ? card.title : card.summary, size: AppleMetrics.font15,
            weight: .regular, lines: Int(AppleMetrics.noteLines), leading: AppleMetrics.noteLeading)
        } else {
          title()
          summary()
        }
      }
    }
    private var tasks: some View {
      stack {
        head(
          taskHeading,
          trailing: card.tasks.isEmpty
            ? "" : "\(card.tasks.filter(\.done).count)/\(card.tasks.count)")
        title()
        if card.tasks.isEmpty {
          summary()
        } else {
          VStack(spacing: 0) {
            ForEach(visibleTasks) { task in
              MobileCheckButton(
                done: task.done, label: task.text, textScale: scale, strong: strong,
                rowHeight: AppleMetrics.space28
              ) {
                Task { await workspace.toggleTask(card, taskID: task.id) }
              }.disabled(workspace.busy || workspace.unresolvedWrite)
            }
          }
        }
        if card.tasks.count > 3 {
          moreItems(card.tasks.count - 3, suffix: Copy.text("web.templates.f9d529eacdf3"))
        }
      }.onAppear {
        // Freeze the preview order during task updates, including when the whole list becomes complete.
        if taskOrder.isEmpty { taskOrder = card.previewTasks(holding: []).map(\.id) }
      }
    }
    private var taskHeading: String {
      var label = card.raw["project"]?["name"]?.string ?? Copy.text("web.task")
      if let due = card.due {
        label += " · \(Copy.text("web.card.dueShort")) \(MobileFormat.dateLabel(due))"
      }
      return label
    }
    private var visibleTasks: [MobileCard.TaskItem] {
      card.previewTasks(holding: taskOrder)
    }
    private var reminder: some View {
      let snoozed = card.item["snoozedUntil"]?.number ?? 0
      let at = snoozed > 0 ? snoozed : card.due ?? 0
      let now = MobileFormat.milliseconds()
      let due = at > 0 && at <= now && !card.reminderDone && !card.dismissed
      return stack {
        head(
          [Copy.text("web.reminder"), card.sourceName].filter { !$0.isEmpty }.joined(
            separator: " · "),
          trailing: at > 0 ? MobileFormat.reminderClock(at, now: now) : "",
          color: due ? AppleColors.warning : AppleColors.secondary)
        HStack(alignment: .top, spacing: 0) {
          MobileCheckButton(
            done: card.reminderDone,
            label: Copy.text(card.reminderDone ? "web.reminder.restore" : "web.reminder.complete"),
            reminder: true
          ) { Task { await workspace.toggle(card, field: "reminderDone") } }
          .disabled(workspace.busy || workspace.unresolvedWrite)
          .padding(.leading, -AppleMetrics.space12)
          title().padding(.top, AppleMetrics.space10)
        }
        summary(card.summary).padding(.leading, AppleMetrics.space34)
      }
    }
    private var digest: some View {
      var source = card.presentationSourceLine
      if let start = card.raw["coverageStart"]?.number, let end = card.raw["coverageEnd"]?.number {
        source = MobileFormat.dateLabel(start) + " – " + MobileFormat.dateLabel(end)
      }
      return stack {
        head(
          source,
          trailing: card.related.isEmpty
            ? "" : "\(card.related.count)\(Copy.text("web.card.relatedCount"))")
        title()
        summary()
      }
    }
    private var suggestion: some View {
      let related = card.related.compactMap { workspace.card($0) }
      return stack {
        head()
        title()
        summary(card.raw["why"]?["reason"]?.string ?? card.displaySummary)
        ForEach(related.prefix(2)) { item in
          Button {
            if let openRelated { openRelated(item.id) } else { open() }
          } label: {
            HStack(spacing: AppleMetrics.space8) {
              MobileIcon(MobileCardTile.icon(item.type), size: AppleMetrics.font15)
              Text(item.title).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
              MobileIcon("chevron", size: AppleMetrics.space14)
            }.font(font(AppleMetrics.font13)).frame(minHeight: AppleMetrics.space32)
              .padding(.horizontal, AppleMetrics.space10)
              .background(
                AppleColors.surface, in: RoundedRectangle(cornerRadius: AppleMetrics.refRadius))
          }.buttonStyle(.plain)
        }
        if related.count > 2 {
          moreItems(related.count - 2, suffix: Copy.text("web.related.moreSuffix"))
        }
      }
    }
    private var files: some View {
      let files = card.raw["files"]?.array ?? []
      return stack {
        head(
          [Copy.text("web.file"), card.sourceName, card.readingTime].filter { !$0.isEmpty }.joined(
            separator: " · "),
          trailing: files.isEmpty ? "" : "\(files.count)\(Copy.text("web.card.fileCountSuffix"))")
        title()
        summary()
        ForEach(Array(files.prefix(3).enumerated()), id: \.offset) { _, file in
          area { fileRow(file) }
        }
        if files.count > 3 {
          moreItems(files.count - 3, suffix: Copy.text("web.templates.7aaf96ad52e0"))
        }
      }
    }
  }
#endif

#if os(iOS)
  import SillKit
  import SwiftUI

  /// Detail order follows the shared phone previews; summaries belong to card faces only.
  extension MobileReader {
    @ViewBuilder func readerContent(_ card: MobileCard) -> some View {
      switch card.type {
      case "article":
        cover(card)
          .padding(.horizontal, -AppleMetrics.space12)
          .padding(.top, -AppleMetrics.space10)
          .padding(.bottom, AppleMetrics.space18 - AppleMetrics.rhythmGroup * readerSpacing)
        header(card)
        outline(card)
        detailText(card)
      case "mail":
        header(card)
        detailText(card)
        MobileDetailFiles(
          values: card.raw["attachments"]?.array ?? [], heading: "web.card.attachments",
          textScale: readerScale, strong: strongText)
        if card.raw["attachments"] == nil, let attachment = card.raw["attachment"]?.string {
          section("web.card.attachments") { Text(attachment) }
        }
      case "event":
        eventHeader(card)
        eventRows(card)
        if !card.markdown.blocks.isEmpty { section("web.card.agenda") { detailText(card) } }
      case "task", "reminder":
        header(card)
        taskRows(card)
        detailText(card)
        if card.type == "reminder", let project = card.raw["project"]?["name"]?.string {
          Text(Copy.text("web.metadata.project") + " · " + project)
            .font(contentFont(AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
        }
      case "file":
        header(card)
        detailText(card)
        MobileDetailFiles(
          values: card.raw["files"]?.array ?? [], heading: "web.card.files", textScale: readerScale,
          strong: strongText)
      case "pr":
        header(card)
        if let pr = card.raw["pullRequest"] {
          MobilePullRequestDetails(pr: pr, textScale: readerScale, strong: strongText)
        }
        detailText(card)
        if let files = card.raw["pullRequest"]?["files"]?.array, !files.isEmpty {
          section("pr.files") {
            ForEach(Array(files.enumerated()), id: \.offset) { _, file in
              MobileDetailRow(
                icon: "file", title: file["path"]?.string ?? "",
                trailing: [
                  file["additions"]?.number.map { "+\(Int($0))" },
                  file["deletions"]?.number.map { "−\(Int($0))" },
                ].compactMap { $0 }.joined(separator: "  "))
            }
          }
        }
      case "media": media(card)
      case "suggestion":
        header(card)
        cover(card)
        if let why = card.raw["why"] {
          section("web.card.why") {
            VStack(alignment: .leading, spacing: AppleMetrics.rhythmClose) {
              Text(why["reason"]?.string ?? "").font(
                contentFont(AppleMetrics.font17, weight: .medium))
              VStack(alignment: .leading, spacing: AppleMetrics.space6) {
                ForEach(Array((why["basis"]?.array ?? []).prefix(5).enumerated()), id: \.offset) {
                  _, value in
                  Text("• " + (value.string ?? "")).font(contentFont(AppleMetrics.font14))
                }
              }
            }
          }
        }
        related(card)
      case "digest":
        header(card)
        detailText(card)
        related(card)
      default:
        header(card)
        cover(card)
        detailText(card)
      }
      if !["digest", "suggestion", "media"].contains(card.type) { related(card) }
      if !card.note.isEmpty {
        VStack(alignment: .leading, spacing: AppleMetrics.space4) {
          Text(Copy.text("web.metadata.note")).font(contentFont(AppleMetrics.font12))
          Text(card.note).font(contentFont(AppleMetrics.font14)).textSelection(.enabled)
        }.foregroundStyle(AppleColors.secondary)
          .padding(.vertical, AppleMetrics.space12).padding(.horizontal, AppleMetrics.space14)
          .frame(maxWidth: .infinity, alignment: .leading)
          .overlay(
            RoundedRectangle(cornerRadius: AppleMetrics.space14)
              .strokeBorder(AppleColors.lineCard, lineWidth: AppleMetrics.lineWidth))
      }
    }

    func header(_ card: MobileCard) -> some View {
      VStack(alignment: .leading, spacing: AppleMetrics.rhythmClose) {
        source(card).frame(minHeight: AppleMetrics.space36, alignment: .leading)
          .padding(
            .trailing,
            AppleMetrics.hitTarget + AppleMetrics.railInset * 2)
        heading(card)
      }
    }

    @ViewBuilder private func source(_ card: MobileCard) -> some View {
      if card.type == "mail", let sender = card.sender, !sender.isEmpty {
        HStack(spacing: AppleMetrics.space10) {
          MobileAvatar(name: sender, size: AppleMetrics.space36)
          VStack(alignment: .leading, spacing: AppleMetrics.space2) {
            Text(sender).font(contentFont(AppleMetrics.font15, weight: .bold))
            meta(
              card,
              label: [
                card.sourceName,
                card.raw["sentAt"]?.string.flatMap {
                  MobileFormat.publication($0, includeTime: true)
                },
                readingTime(card),
              ].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
          }
        }
      } else {
        meta(card, label: sourceLabel(card))
      }
    }

    private func meta(_ card: MobileCard, label: String) -> some View {
      HStack(spacing: AppleMetrics.space6) {
        MobileSourceMark(card: card, size: AppleMetrics.space16)
        Text(label).frame(maxWidth: .infinity, alignment: .leading)
      }.font(contentFont(AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
    }

    private func sourceLabel(_ card: MobileCard) -> String {
      switch card.type {
      case "pr":
        if let pr = card.raw["pullRequest"] {
          return (pr["repository"]?.string ?? "") + " #\(Int(pr["number"]?.number ?? 0))"
            + (pr["observedAt"]?.string.flatMap { MobileFormat.publication($0, includeTime: true) }
              .map { " · " + Copy.text("pr.observed") + " " + $0 } ?? "")
        }
      case "digest":
        return [
          card.raw["coverageStart"]?.number.flatMap { start in
            card.raw["coverageEnd"]?.number.map {
              MobileFormat.dateLabel(start) + " – " + MobileFormat.dateLabel($0)
            }
          },
          card.related.isEmpty ? nil : "\(card.related.count)" + Copy.text("web.card.relatedCount"),
        ]
        .compactMap { $0 }.joined(separator: " · ")
      case "task":
        return [card.sourceName, card.raw["project"]?["name"]?.string]
          .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
      case "reminder":
        return [
          Copy.text("web.reminder"), card.sourceName,
          card.due.map { MobileFormat.dateLabel($0) + " " + MobileFormat.time($0) },
        ]
        .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
      case "file":
        return Copy.text("web.preview.fileSourcePrefix")
          + [card.sourceName, readingTime(card)].filter { !$0.isEmpty }.joined(separator: " · ")
      default: break
      }
      return card.presentationSourceLine
    }

    private func heading(_ card: MobileCard) -> some View {
      VStack(alignment: .leading, spacing: AppleMetrics.rhythmItem) {
        HStack(alignment: .top, spacing: AppleMetrics.space12) {
          if card.type == "reminder" {
            Button {
              Task { await workspace.toggle(card, field: "reminderDone") }
            } label: {
              MobileIcon(card.reminderDone ? "check-circle" : "circle", size: AppleMetrics.space24)
                .foregroundStyle(card.reminderDone ? AppleColors.accent : AppleColors.secondary)
                .frame(width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
            }.buttonStyle(MobilePressStyle()).disabled(workspace.busy || workspace.unresolvedWrite)
              .accessibilityLabel(
                Copy.text(card.reminderDone ? "web.reminder.restore" : "web.reminder.complete"))
          }
          Text(card.title)
            .font(
              contentFont(
                AppleMetrics.space24,
                weight: .semibold)
            )
            .tracking(AppleMetrics.previewTitleTracking * AppleMetrics.previewTitle)
            .frame(maxWidth: .infinity, alignment: .leading).fixedSize(
              horizontal: false, vertical: true
            )
            .accessibilityAddTraits(.isHeader).textSelection(.enabled)
        }
        VStack(alignment: .leading, spacing: AppleMetrics.rhythmClose) {
          if !card.tags.isEmpty {
            MobileReaderTags(tags: card.tags, scale: readerScale, strong: strongText)
          }
          publication(card)
        }
      }
    }

    @ViewBuilder private func publication(_ card: MobileCard) -> some View {
      let authors = (card.raw["authors"]?.array ?? []).compactMap { $0["name"]?.string }
      if !authors.isEmpty
        && !["article", "media", "note", "file", "suggestion", "mail"].contains(card.type)
      {
        Text(authors.joined(separator: " · ")).font(contentFont(AppleMetrics.font13))
          .foregroundStyle(AppleColors.secondary)
      }
      if let recipients = card.raw["recipients"]?.strings, !recipients.isEmpty {
        Text(Copy.text("web.metadata.recipients") + " · " + recipients.joined(separator: " / "))
          .font(contentFont(AppleMetrics.font12)).foregroundStyle(AppleColors.secondary)
      }
      if !["task", "reminder"].contains(card.type),
        let project = card.raw["project"]?["name"]?.string
      {
        Text(Copy.text("web.metadata.project") + " · " + project)
          .font(contentFont(AppleMetrics.font12)).foregroundStyle(AppleColors.secondary)
      }
      if let count = card.raw["chapterCount"]?.number, count > 0 {
        Text(Copy.text("web.metadata.chapters") + " · \(Int(count))")
          .font(contentFont(AppleMetrics.font12)).foregroundStyle(AppleColors.secondary)
      }
      if card.type != "event", let zone = card.raw["timeZone"]?.string {
        Text(zone).font(contentFont(AppleMetrics.font12)).foregroundStyle(AppleColors.secondary)
      }
      if let caption = card.caption {
        Text(caption).font(contentFont(AppleMetrics.font12)).foregroundStyle(AppleColors.secondary)
      }
    }

    private func readingTime(_ card: MobileCard) -> String {
      guard let estimate = card.raw["readingEstimate"], let seconds = estimate["seconds"]?.number,
        seconds > 0
      else { return "" }
      return Copy.text(
        estimate["scope"]?.string == "full"
          ? "web.metadata.readingFull" : "web.metadata.readingAvailable")
        + " \(Int(ceil(seconds / 60))) " + Copy.text("web.metadata.readingSuffix")
    }

    @ViewBuilder private func cover(_ card: MobileCard) -> some View {
      if let source = card.raw["image"]?.string {
        MobileCoverImage(source: source)
          .frame(
            height: card.type == "article"
              ? AppleMetrics.mobileArticlePreviewCoverHeight
              : AppleMetrics.space220
          )
          .clipShape(
            RoundedRectangle(
              cornerRadius: AppleMetrics.previewCoverRadius))
      }
    }

    @ViewBuilder private func detailText(_ card: MobileCard) -> some View {
      if !card.markdown.blocks.isEmpty {
        MobileMarkdown(
          document: card.markdown, textScale: readerBodyScale, strong: strongText,
          spacing: readerSpacing,
          openCard: { id, _ in
            relatedID = id
          }, cardExists: { workspace.card($0) != nil })
      }
    }

    @ViewBuilder private func outline(_ card: MobileCard) -> some View {
      let headings = card.markdown.blocks.enumerated().filter {
        $0.element.heading > 0 && $0.element.cells.isEmpty
      }
      if !headings.isEmpty {
        DisclosureGroup(Copy.text("web.reader.outline")) {
          VStack(alignment: .leading, spacing: AppleMetrics.space4) {
            ForEach(Array(headings), id: \.offset) { index, block in
              Button(block.text) { layer.scrollTo("paragraph-\(index)") }
                .font(contentFont(AppleMetrics.font14))
                .frame(minHeight: AppleMetrics.hitTarget, alignment: .leading)
            }
          }
        }.font(contentFont(AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
      }
    }

    private func eventHeader(_ card: MobileCard) -> some View {
      VStack(alignment: .leading, spacing: AppleMetrics.rhythmClose) {
        meta(card, label: card.sourceName).frame(minHeight: AppleMetrics.space36)
          .padding(.trailing, AppleMetrics.hitTarget + AppleMetrics.railInset * 2)
        if let start = card.start {
          let relative = MobileFormat.eventRelative(
            start: start, end: card.end ?? start, now: Date().timeIntervalSince1970 * 1000)
          Text(MobileFormat.dateLabel(start) + (relative.isEmpty ? "" : " · " + relative))
            .font(contentFont(AppleMetrics.font13)).foregroundStyle(AppleColors.accent)
          HStack(alignment: .firstTextBaseline, spacing: AppleMetrics.space12) {
            Text(MobileFormat.time(start)).font(
              contentFont(AppleMetrics.space40, weight: .semibold, design: .rounded)
            )
            .monospacedDigit()
            if let end = card.end {
              Text(eventEndLabel(card, start: start, end: end))
                .font(contentFont(AppleMetrics.font15)).foregroundStyle(AppleColors.secondary)
            }
          }.padding(.bottom, AppleMetrics.rhythmClose)
        }
        heading(card)
      }
    }

    private func eventEndLabel(_ card: MobileCard, start: Double, end: Double) -> String {
      let minutes = Int(((end - start) / 60_000).rounded())
      let until = Copy.text("web.templates.83532308ecca") + MobileFormat.time(end)
      let duration = String(minutes) + Copy.text("web.templates.40de54344d22")
      var parts = [until, duration]
      if let zone = card.raw["timeZone"]?.string { parts.append(zone) }
      return parts.joined(separator: " · ")
    }

    private func eventRows(_ card: MobileCard) -> some View {
      VStack(spacing: 0) {
        if let meeting = card.raw["meeting"] {
          let row = MobileDetailRow(
            icon: "video", title: meeting["name"]?.string ?? Copy.text("web.actions.join"),
            trailing: meeting["code"]?.string ?? "", textScale: readerScale, strong: strongText)
          if let url = MobileCard.safeURL(meeting["url"]?.string) {
            Link(destination: url) { row }.buttonStyle(MobilePressStyle())
          } else {
            row
          }
        }
        if let location = card.location {
          MobileDetailRow(icon: "pin", title: location, textScale: readerScale, strong: strongText)
        }
        if !card.people.isEmpty {
          MobileDetailRow(
            icon: "at", title: card.people.joined(separator: "、"),
            trailing: "\(card.people.count)" + Copy.text("web.preview.peopleCountSuffix"),
            textScale: readerScale, strong: strongText)
        }
      }.padding(.top, (AppleMetrics.rhythmItem - AppleMetrics.rhythmGroup) * readerSpacing)
    }

    @ViewBuilder private func taskRows(_ card: MobileCard) -> some View {
      if card.type == "task" {
        VStack(spacing: 0) {
          if let due = card.due {
            MobileDetailRow(
              icon: "clock", title: Copy.text("web.card.due") + " " + MobileFormat.dateLabel(due),
              tone: AppleColors.warning, textScale: readerScale, strong: strongText)
          }
          if !card.people.isEmpty {
            MobileDetailRow(
              icon: "at", title: card.people.joined(separator: "、"), textScale: readerScale,
              strong: strongText)
          }
          if card.raw["priority"]?.number != nil {
            MobileDetailRow(
              icon: "flag", title: Copy.text("web.card.priority") + " " + card.priority.formatted(),
              textScale: readerScale, strong: strongText)
          }
          ForEach(card.tasks) { task in
            Button {
              Task { await workspace.toggleTask(card, taskID: task.id) }
            } label: {
              HStack(alignment: .top, spacing: AppleMetrics.space12) {
                MobileIcon(task.done ? "check-circle" : "circle", size: AppleMetrics.space24)
                  .foregroundStyle(task.done ? AppleColors.accent : AppleColors.secondary)
                Text(task.text).strikethrough(task.done).frame(
                  maxWidth: .infinity, alignment: .leading
                )
                .foregroundStyle(task.done ? AppleColors.secondary : AppleColors.primary)
              }.padding(.vertical, AppleMetrics.space12).frame(
                minHeight: AppleMetrics.hitTarget, alignment: .leading)
            }.buttonStyle(MobilePressStyle()).disabled(workspace.busy || workspace.unresolvedWrite)
              .accessibilityValue(Copy.text(task.done ? "apple.complete" : "apple.unread"))
          }
        }.padding(.top, (AppleMetrics.rhythmItem - AppleMetrics.rhythmGroup) * readerSpacing)
      }
    }

    @ViewBuilder func related(_ card: MobileCard) -> some View {
      let cards = card.related.compactMap { workspace.card($0) }.filter { $0.id != cardID }
      if !cards.isEmpty {
        section(card.type == "digest" ? "web.card.digestRelated" : "web.card.related") {
          VStack(spacing: AppleMetrics.rhythmClose) {
            ForEach(cards) { related in
              MobileCardTile(workspace: workspace, card: related, openRelated: { relatedID = $0 }) {
                relatedID = related.id
              }
            }
          }
        }
      }
    }

    func section<Content: View>(_ key: String, @ViewBuilder content: () -> Content) -> some View {
      VStack(alignment: .leading, spacing: AppleMetrics.rhythmLabel) {
        Text(Copy.text(key)).font(contentFont(AppleMetrics.font13, weight: .semibold))
          .foregroundStyle(AppleColors.secondary)
        content()
      }
    }
  }
#endif

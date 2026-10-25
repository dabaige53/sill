#if os(iOS)
import SillKit
import SwiftUI

/// Type-specific detail content, metadata and related cards.
extension MobileReader {
  func header(_ card: MobileCard) -> some View {
    VStack(alignment: .leading, spacing: AppleMetrics.rhythmItem) {
      HStack(spacing: AppleMetrics.space6) {
        MobileIcon(MobileCardTile.icon(card.type), size: AppleMetrics.space16)
        Text(card.sourceName.isEmpty ? Copy.text("card.type.\(card.type)") : card.sourceName)
      }.font(contentFont(AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
      Text(card.title).font(contentFont(AppleMetrics.previewTitle, weight: .semibold))
        .accessibilityAddTraits(.isHeader).textSelection(.enabled)
      if !card.tags.isEmpty {
        Text(card.tags.map { "#" + $0 }.joined(separator: "  "))
          .font(contentFont(AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
      }
      let authors = (card.raw["authors"]?.array ?? []).compactMap { $0["name"]?.string }
      if !authors.isEmpty {
        Text(authors.joined(separator: " · ")).font(contentFont(AppleMetrics.font13))
          .foregroundStyle(AppleColors.secondary)
      }
      if let published = card.raw["publishedAt"]?.string {
        Text(published).font(contentFont(AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
      }
      if let estimate = card.raw["readingEstimate"], let duration = estimate["seconds"]?.number {
        Text(Copy.text(estimate["scope"]?.string == "full"
          ? "web.metadata.readingFull" : "web.metadata.readingAvailable")
          + " \(Int(ceil(duration / 60))) " + Copy.text("web.metadata.readingSuffix"))
          .font(contentFont(AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
      }
    }
  }

  @ViewBuilder func facts(_ card: MobileCard) -> some View {
    if let sender = card.sender, !sender.isEmpty {
      Text(sender).foregroundStyle(AppleColors.secondary)
    }
    if let recipients = card.raw["recipients"]?.array?.compactMap(\.string), !recipients.isEmpty {
      section("web.metadata.recipients") { Text(recipients.joined(separator: " · ")) }
    }
    if let start = card.start {
      Text(Date(timeIntervalSince1970: start / 1000), format: .dateTime.month().day().hour().minute())
        .font(contentFont(AppleMetrics.font22, weight: .medium))
    }
    if let end = card.end {
      Text(Date(timeIntervalSince1970: end / 1000), format: .dateTime.month().day().hour().minute())
        .foregroundStyle(AppleColors.secondary)
    }
    if let due = card.due {
      section("web.card.due") {
        Text(Date(timeIntervalSince1970: due / 1000), format: .dateTime.month().day().hour().minute())
      }
    }
    if let location = card.location, !location.isEmpty { Text(location) }
    if let start = card.raw["coverageStart"]?.number, let end = card.raw["coverageEnd"]?.number {
      section("web.metadata.coverage") {
        Text(Date(timeIntervalSince1970: start / 1000), format: .dateTime.month().day())
        Text(Date(timeIntervalSince1970: end / 1000), format: .dateTime.month().day())
      }
    }
    if let project = card.raw["project"]?["name"]?.string {
      section("web.metadata.project") { Text(project) }
    }
    if let sent = card.raw["sentAt"]?.string {
      section("web.metadata.sent") { Text(sent) }
    }
    if let taken = card.raw["takenAt"]?.string {
      section("web.metadata.taken") { Text(taken) }
    }
    if !card.people.isEmpty {
      section("web.card.people") { Text(card.people.joined(separator: " · ")) }
    }
    if let meeting = card.raw["meeting"] {
      if let url = MobileCard.safeURL(meeting["url"]?.string) {
        Link(Copy.text("web.actions.join"), destination: url)
      }
      if let code = meeting["code"]?.string { Text(code).textSelection(.enabled) }
    }
    if card.type == "task" {
      VStack(alignment: .leading, spacing: AppleMetrics.space8) {
        ForEach(card.tasks) { task in
          Button {
            Task { await workspace.toggleTask(card, taskID: task.id) }
          } label: {
            HStack(alignment: .top, spacing: AppleMetrics.space12) {
              MobileIcon(task.done ? "check-circle" : "circle", size: AppleMetrics.space24)
              Text(task.text).strikethrough(task.done).frame(maxWidth: .infinity, alignment: .leading)
            }.frame(minHeight: AppleMetrics.hitTarget, alignment: .leading)
          }.buttonStyle(.plain).disabled(workspace.busy || workspace.unresolvedWrite)
            .accessibilityValue(Copy.text(task.done ? "apple.complete" : "apple.unread"))
        }
      }
    }
    if card.type == "reminder" {
      Button(Copy.text(card.reminderDone ? "web.reminder.restore" : "web.reminder.complete")) {
        Task { await workspace.toggle(card, field: "reminderDone") }
      }.disabled(workspace.busy || workspace.unresolvedWrite)
    }
    if let why = card.raw["why"] {
      section("web.card.why") {
        Text(why["reason"]?.string ?? "")
        ForEach(Array((why["basis"]?.array ?? []).enumerated()), id: \.offset) { _, item in
          Text("• " + (item.string ?? ""))
        }
      }
    }
    if let pr = card.raw["pullRequest"] { pullRequest(pr) }
    files(card.raw["files"]?.array ?? [], heading: "web.card.files")
    files(card.raw["attachments"]?.array ?? [], heading: "web.card.attachments")
    if card.raw["attachments"] == nil, let attachment = card.raw["attachment"]?.string {
      section("web.card.attachments") { Text(attachment) }
    }
    if let caption = card.caption { Text(caption).foregroundStyle(AppleColors.secondary) }
  }

  @ViewBuilder private func pullRequest(_ pr: JSONValue) -> some View {
    Text((pr["repository"]?.string ?? "") + " #" + String(Int(pr["number"]?.number ?? 0)))
      .font(contentFont(AppleMetrics.font15, weight: .medium))
    if let state = pr["state"]?.string { Text(Copy.text("pr.state.\(state)")) }
    if let head = pr["headBranch"]?.string, let base = pr["baseBranch"]?.string {
      Text(head + " → " + base).font(contentFont(AppleMetrics.font14, design: .monospaced))
        .textSelection(.enabled)
    }
    if let additions = pr["additions"]?.number, let deletions = pr["deletions"]?.number {
      Text("+\(Int(additions))  −\(Int(deletions))").monospacedDigit()
    }
    let reviewers = pr["reviewers"]?.array ?? []
    if !reviewers.isEmpty {
      section("pr.reviewers") {
        ForEach(Array(reviewers.enumerated()), id: \.offset) { _, reviewer in
          Text((reviewer["login"]?.string ?? "") + " · "
            + Copy.text("pr.decision.\(reviewer["decision"]?.string ?? "pending")"))
        }
      }
    }
    let checks = pr["checks"]?.array ?? []
    if !checks.isEmpty {
      section("pr.checks") {
        ForEach(Array(checks.enumerated()), id: \.offset) { _, check in
          let text = (check["name"]?.string ?? "") + " · "
            + Copy.text("pr.check.\(check["conclusion"]?.string ?? check["status"]?.string ?? "queued")")
          if let url = MobileCard.safeURL(check["url"]?.string) { Link(text, destination: url) }
          else { Text(text) }
        }
      }
    }
    let changed = pr["files"]?.array ?? []
    if !changed.isEmpty {
      section("pr.files") {
        ForEach(Array(changed.enumerated()), id: \.offset) { _, file in
          Text(file["path"]?.string ?? "").font(contentFont(AppleMetrics.font14, design: .monospaced))
        }
      }
    }
    if let observed = pr["observedAt"]?.string {
      Text(Copy.text("pr.observed") + " " + observed)
        .font(contentFont(AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
    }
  }

  @ViewBuilder private func files(_ values: [JSONValue], heading: String) -> some View {
    if !values.isEmpty {
      section(heading) {
        ForEach(Array(values.enumerated()), id: \.offset) { _, value in
          if let url = MobileCard.safeURL(value["url"]?.string) {
            Link(value["name"]?.string ?? url.lastPathComponent, destination: url)
              .frame(minHeight: AppleMetrics.hitTarget, alignment: .leading)
          } else { Text(value["name"]?.string ?? "") }
        }
      }
    }
  }

  @ViewBuilder func related(_ card: MobileCard) -> some View {
    if !card.related.isEmpty {
      section(card.type == "digest" ? "web.card.digestRelated" : "web.card.related") {
        ForEach(card.related, id: \.self) { id in
          if let related = workspace.card(id), id != cardID {
            Button(related.title) { relatedID = id }
              .frame(minHeight: AppleMetrics.hitTarget, alignment: .leading)
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

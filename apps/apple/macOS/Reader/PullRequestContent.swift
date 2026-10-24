import SillKit
import SwiftUI

struct PullRequestContent: View {
  let card: CardModel
  var detail = false
  var tags: [String]?
  /// Detail spacing, scaled by the reader's spacing preference.
  var rhythm = DetailRhythm(scale: 1)
  @State private var checksExpanded = false
  @Environment(\.contentAppearance) private var appearance
  @Environment(\.cardIntents) private var intents
  var body: some View {
    VStack(alignment: .leading, spacing: detail ? rhythm.group : AppleMetrics.space8) {
      if let pr = card.pullRequest {
        VStack(alignment: .leading, spacing: 0) {
          CardHead(
            card: card,
            text: "\(pr.repository) #\(pr.number)"
              + (detail
                ? " · \(Copy.text("pr.observed")) \(ReaderContent.fullDate(pr.observedAt) ?? pr.observedAt)"
                : "")
          ) {
            if !detail { status(pr) }
          }
          .frame(minHeight: detail ? AppleMetrics.space36 : AppleMetrics.cardHeadHeight)
          .padding(.bottom, detail ? AppleMetrics.rhythmClose : AppleMetrics.space8)
          Text(card.title)
            .textStyle(detail ? AppleMetrics.previewTitle : AppleMetrics.font16, .semibold)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.bottom, detail ? 0 : AppleMetrics.space8)
          if detail {
            // The state opens the detail rows instead of sitting among the tags.
            if !(tags ?? card.tags).isEmpty {
              ReaderTags(tags: tags ?? card.tags).padding(.top, AppleMetrics.rhythmItem)
            }
          } else {
            HStack(spacing: AppleMetrics.space8) {
              if pr.headBranch != nil || pr.baseBranch != nil {
                branchChip(
                  [pr.headBranch, pr.baseBranch].compactMap { $0 }.joined(separator: " → "),
                  size: AppleMetrics.font12)
              }
              Spacer(minLength: 0)
              stats(additions: pr.additions, deletions: pr.deletions)
              if let count = pr.changedFiles {
                Text("\(count) \(Copy.text("pr.fileCount"))").textStyle(AppleMetrics.font12)
                  .foregroundStyle(AppleColors.secondary)
              }
            }
          }
        }
        if detail {
          details(pr)
        } else {
          footer(pr)
        }
      }
    }
    .foregroundStyle(AppleColors.primary)
    .textStyle(AppleMetrics.font14)
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func branchChip(_ text: String, size: CGFloat) -> some View {
    Text(text)
      .font(
        .system(
          size: size * appearance.scale, weight: appearance.weight(.regular), design: .monospaced)
      )
      .lineLimit(1).truncationMode(.middle)
      .padding(.horizontal, AppleMetrics.space6).padding(.vertical, AppleMetrics.space2)
      .background(RoundedRectangle(cornerRadius: AppleMetrics.space6).fill(AppleColors.surface))
  }

  /// "<author> 想把 <head> 合并到 <base>", matching the Web detail.
  private func mergeIntent(author: String, head: String, base: String) -> some View {
    let parts = Copy.text("pr.mergeIntent").components(separatedBy: " ")
    return HStack(spacing: AppleMetrics.space4) {
      ForEach(Array(parts.enumerated()), id: \.offset) { _, part in
        switch part {
        case "{head}":
          branchChip(head, size: AppleMetrics.font13).foregroundStyle(AppleColors.secondary)
        case "{base}":
          branchChip(base, size: AppleMetrics.font13).foregroundStyle(AppleColors.secondary)
        default: Text(part == "{author}" ? author : part).lineLimit(1)
        }
      }
    }
    .textStyle(AppleMetrics.font13)
    .foregroundStyle(AppleColors.secondary)
  }

  private func status(_ pr: CardRichFields.PullRequest) -> some View {
    Text(Copy.text(pr.reviewRequested == true ? "pr.reviewRequested" : "pr.state.\(pr.state)"))
      .textStyle(AppleMetrics.font11, .medium)
      .padding(.horizontal, AppleMetrics.space8).padding(.vertical, AppleMetrics.space3)
      .foregroundStyle(
        pr.state == "draft" || pr.state == "closed" ? AppleColors.secondary : AppleColors.accent
      )
      .background(
        Capsule().fill(
          pr.state == "draft" || pr.state == "closed" ? AppleColors.surface : AppleColors.accentSoft
        ))
  }

  /// First detail row: the state in its colour, then who wants to merge which branch.
  private func statusRow(_ pr: CardRichFields.PullRequest) -> some View {
    HStack(spacing: AppleMetrics.space12) {
      rowIcon("pull")
      HStack(spacing: AppleMetrics.space8) {
        Text(Copy.text(pr.reviewRequested == true ? "pr.reviewRequested" : "pr.state.\(pr.state)"))
          .textStyle(AppleMetrics.font14, .medium)
          .foregroundStyle(
            pr.state == "draft" || pr.state == "closed" ? AppleColors.secondary : AppleColors.accent
          )
        if let author = pr.author?.name, !author.isEmpty, let head = pr.headBranch,
          let base = pr.baseBranch
        {
          mergeIntent(author: author, head: head, base: base)
        } else if pr.headBranch != nil || pr.baseBranch != nil {
          branchChip(
            [pr.headBranch, pr.baseBranch].compactMap { $0 }.joined(separator: " → "),
            size: AppleMetrics.font12
          )
          .foregroundStyle(AppleColors.secondary)
        }
      }
      Spacer(minLength: 0)
    }
    .frame(minHeight: AppleMetrics.detailRowHeight)
  }

  /// The same 18-point icon box as `DetailRow`, so every row's text starts at one edge.
  private func rowIcon(_ name: String) -> some View {
    Icon(name, size: AppleMetrics.space16).foregroundStyle(AppleColors.secondary)
      .frame(width: AppleMetrics.space18, height: AppleMetrics.space18)
  }

  private var rowDivider: some View {
    Rectangle().fill(AppleColors.line).frame(height: AppleMetrics.lineWidth)
  }

  private func stats(additions: Int?, deletions: Int?) -> some View {
    HStack(spacing: AppleMetrics.space8) {
      if let additions { Text("+\(additions)").foregroundStyle(AppleColors.success) }
      if let deletions { Text("−\(deletions)").foregroundStyle(AppleColors.warning) }
    }.textStyle(AppleMetrics.font12, number: true)
  }

  private func footer(_ pr: CardRichFields.PullRequest) -> some View {
    HStack(spacing: AppleMetrics.space10) {
      ForEach(Array(pr.reviewers.enumerated()), id: \.offset) { _, reviewer in
        reviewerAvatar(reviewer)
      }
      if !pr.checks.isEmpty {
        let passed = pr.checks.allSatisfy { $0.conclusion == "success" }
        HStack(spacing: AppleMetrics.space4) {
          Icon(passed ? "check" : "clock", size: AppleMetrics.space12)
          Text(
            "\(Copy.text("pr.checks")) \(pr.checks.filter { $0.conclusion == "success" }.count)/\(pr.checks.count)"
          )
        }.textStyle(AppleMetrics.font12)
          .foregroundStyle(passed ? AppleColors.success : AppleColors.secondary)
      }
      Spacer(minLength: 0)
      if pr.reviewRequested == true {
        if let url = card.url {
          Link(destination: url) { reviewLabel }.buttonStyle(.plain)
        } else {
          Button {
            intents.open(card.id)
          } label: {
            reviewLabel
          }
          .buttonStyle(.plain)
        }
      }
    }.padding(.top, AppleMetrics.space4)
  }

  private var reviewLabel: some View {
    Text(Copy.text("pr.review"))
      .textStyle(AppleMetrics.font14, .semibold)
      .padding(.horizontal, AppleMetrics.space18).padding(.vertical, AppleMetrics.space8)
      .foregroundStyle(AppleColors.fixedWhite).background(Capsule().fill(AppleColors.accent))
  }

  private func reviewerAvatar(_ reviewer: CardRichFields.PullRequest.Reviewer) -> some View {
    Avatar(name: reviewer.login, size: AppleMetrics.space24)
      .overlay(alignment: .bottomTrailing) {
        ZStack {
          Circle().fill(
            reviewer.decision == "approved"
              ? AppleColors.success
              : reviewer.decision == "pending" || reviewer.decision == "changesRequested"
                ? AppleColors.warning : AppleColors.secondary)
          if reviewer.decision == "approved" { Icon("check", size: AppleMetrics.space8) }
          if reviewer.decision == "changesRequested" { Text("!").textStyle(AppleMetrics.font10) }
        }
        .foregroundStyle(AppleColors.fixedWhite)
        .frame(width: AppleMetrics.space12, height: AppleMetrics.space12)
        .overlay(Circle().stroke(AppleColors.card, lineWidth: AppleMetrics.space2))
        .offset(x: AppleMetrics.space3, y: AppleMetrics.space3)
      }
      .help("\(reviewer.login) · \(Copy.text("pr.decision.\(reviewer.decision)"))")
  }

  @ViewBuilder private func details(_ pr: CardRichFields.PullRequest) -> some View {
    // Rows without data are left out rather than shown as "0/0" or "—".
    let hasStats = pr.additions != nil || pr.deletions != nil
    VStack(spacing: 0) {
      statusRow(pr)
      if !pr.checks.isEmpty {
        Button {
          checksExpanded.toggle()
        } label: {
          HStack(spacing: AppleMetrics.space12) {
            DetailRow(
              icon: "check-circle",
              title:
                "\(Copy.text("pr.checks")) \(pr.checks.filter { $0.conclusion == "success" }.count)/\(pr.checks.count)"
            )
            Icon("chevron", size: AppleMetrics.space14).rotationEffect(
              .degrees(checksExpanded ? 90 : 0))
          }
          .overlay(alignment: .top) { rowDivider }
        }.buttonStyle(.plain)
        if checksExpanded {
          ForEach(Array(pr.checks.enumerated()), id: \.offset) { _, check in
            let row = DetailRow(
              icon: check.conclusion == "success" ? "check" : "clock", title: check.name,
              trailing: Copy.text("pr.check.\(check.conclusion ?? check.status)"), divider: true)
            if let url = check.url {
              Link(destination: url) { row }.buttonStyle(.plain)
            } else {
              row
            }
          }
        }
      }
      if !pr.reviewers.isEmpty {
        HStack(spacing: AppleMetrics.space12) {
          rowIcon("at")
          Text(
            pr.reviewers.map { "\($0.login) \(Copy.text("pr.decision.\($0.decision)"))" }.joined(
              separator: " · ")
          )
          .frame(maxWidth: .infinity, alignment: .leading)
          ForEach(Array(pr.reviewers.enumerated()), id: \.offset) { _, reviewer in
            reviewerAvatar(reviewer)
          }
        }
        .frame(minHeight: AppleMetrics.detailRowHeight)
        .overlay(alignment: .top) { rowDivider }
      }
      if hasStats || pr.changedFiles != nil {
        HStack(spacing: AppleMetrics.space12) {
          rowIcon("file")
          if hasStats {
            stats(additions: pr.additions, deletions: pr.deletions)
            Spacer(minLength: 0)
          }
          if let count = pr.changedFiles {
            Text("\(count) \(Copy.text("pr.fileCount"))")
              .foregroundStyle(hasStats ? AppleColors.secondary : AppleColors.primary)
          }
          if !hasStats { Spacer(minLength: 0) }
        }
        .frame(minHeight: AppleMetrics.detailRowHeight)
        .overlay(alignment: .top) { rowDivider }
      }
      if let comments = pr.comments {
        DetailRow(icon: "message", title: "\(comments) \(Copy.text("pr.comments"))", divider: true)
      }
    }
    .padding(.top, rhythm.rowLift)
    if !card.markdown.blocks.isEmpty {
      MarkdownText(
        document: card.markdown, size: AppleMetrics.font15, leading: AppleMetrics.previewBodyLeading
      )
      .padding(.top, rhythm.rowLift)
    }
    if !pr.files.isEmpty {
      VStack(alignment: .leading, spacing: AppleMetrics.rhythmClose) {
        Text(Copy.text("pr.files")).textStyle(AppleMetrics.font13, .semibold).foregroundStyle(
          AppleColors.secondary)
        VStack(alignment: .leading, spacing: 0) {
          ForEach(Array(pr.files.enumerated()), id: \.offset) { _, file in
            HStack(spacing: AppleMetrics.space12) {
              rowIcon("file")
              Text(file.path).lineLimit(1).truncationMode(.middle)
              Spacer(minLength: 0)
              stats(additions: file.additions, deletions: file.deletions)
            }.padding(.vertical, AppleMetrics.space12)
          }
        }
      }
      .padding(.top, card.markdown.blocks.isEmpty ? 0 : rhythm.sectionLead)
    }
  }
}

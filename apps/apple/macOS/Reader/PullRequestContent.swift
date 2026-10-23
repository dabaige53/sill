import SillKit
import SwiftUI

struct PullRequestContent: View {
  let card: CardModel
  var detail = false
  var tags: [String]?
  @State private var checksExpanded = false
  @Environment(\.cardIntents) private var intents
  var body: some View {
    VStack(alignment: .leading, spacing: detail ? AppleMetrics.space20 : AppleMetrics.space8) {
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
          .padding(.bottom, detail ? AppleMetrics.space6 : AppleMetrics.space8)
          Text(card.title)
            .font(.sans(detail ? AppleMetrics.previewTitle : AppleMetrics.font16, .semibold))
            .fixedSize(horizontal: false, vertical: true)
            .padding(.bottom, detail ? AppleMetrics.space16 : AppleMetrics.space8)
          HStack(spacing: AppleMetrics.space8) {
            if detail { status(pr) }
            if pr.headBranch != nil || pr.baseBranch != nil {
              Text([pr.headBranch, pr.baseBranch].compactMap { $0 }.joined(separator: " → "))
                .font(.system(size: AppleMetrics.font12, design: .monospaced))
                .lineLimit(1).truncationMode(.middle)
                .padding(.horizontal, AppleMetrics.space6).padding(.vertical, AppleMetrics.space2)
                .background(
                  RoundedRectangle(cornerRadius: AppleMetrics.space6).fill(AppleColors.surface))
            }
            Spacer(minLength: 0)
            if !detail {
              stats(additions: pr.additions, deletions: pr.deletions)
              if let count = pr.changedFiles {
                Text("\(count) \(Copy.text("pr.fileCount"))").font(.sans(AppleMetrics.font12))
                  .foregroundStyle(AppleColors.secondary)
              }
            }
          }
          if detail { ReaderTags(tags: tags ?? card.tags).padding(.top, AppleMetrics.space12) }
        }
        .padding(.bottom, detail ? AppleMetrics.space24 : 0)
        if detail {
          details(pr)
        } else {
          footer(pr)
        }
      }
    }
    .foregroundStyle(AppleColors.primary)
    .font(.sans(AppleMetrics.font14))
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func status(_ pr: CardRichFields.PullRequest) -> some View {
    Text(Copy.text(pr.reviewRequested == true ? "pr.reviewRequested" : "pr.state.\(pr.state)"))
      .font(.sans(AppleMetrics.font11, .medium))
      .padding(.horizontal, AppleMetrics.space8).padding(.vertical, AppleMetrics.space3)
      .foregroundStyle(
        pr.state == "draft" || pr.state == "closed" ? AppleColors.secondary : AppleColors.accent
      )
      .background(
        Capsule().fill(
          pr.state == "draft" || pr.state == "closed" ? AppleColors.surface : AppleColors.accentSoft
        ))
  }

  private func stats(additions: Int?, deletions: Int?) -> some View {
    HStack(spacing: AppleMetrics.space8) {
      if let additions { Text("+\(additions)").foregroundStyle(AppleColors.success) }
      if let deletions { Text("−\(deletions)").foregroundStyle(AppleColors.warning) }
    }.font(.number(AppleMetrics.font12))
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
        }.font(.sans(AppleMetrics.font12))
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
      .font(.sans(AppleMetrics.font14, .semibold))
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
          if reviewer.decision == "changesRequested" { Text("!").font(.sans(AppleMetrics.font10)) }
        }
        .foregroundStyle(AppleColors.fixedWhite)
        .frame(width: AppleMetrics.space12, height: AppleMetrics.space12)
        .overlay(Circle().stroke(AppleColors.card, lineWidth: AppleMetrics.space2))
        .offset(x: AppleMetrics.space3, y: AppleMetrics.space3)
      }
      .help("\(reviewer.login) · \(Copy.text("pr.decision.\(reviewer.decision)"))")
  }

  @ViewBuilder private func details(_ pr: CardRichFields.PullRequest) -> some View {
    VStack(spacing: 0) {
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
      }.buttonStyle(.plain)
      if checksExpanded {
        ForEach(Array(pr.checks.enumerated()), id: \.offset) { _, check in
          let row = DetailRow(
            icon: check.conclusion == "success" ? "check" : "clock", title: check.name,
            trailing: Copy.text("pr.check.\(check.conclusion ?? check.status)"), divider: true)
          if let url = check.url { Link(destination: url) { row }.buttonStyle(.plain) } else { row }
        }
      }
      HStack(spacing: AppleMetrics.space12) {
        Icon("at", size: AppleMetrics.font16)
        Text(
          pr.reviewers.map { "\($0.login) \(Copy.text("pr.decision.\($0.decision)"))" }.joined(
            separator: " · ")
        )
        .frame(maxWidth: .infinity, alignment: .leading)
        ForEach(Array(pr.reviewers.enumerated()), id: \.offset) { _, reviewer in
          reviewerAvatar(reviewer)
        }
      }.padding(.vertical, AppleMetrics.space12)
      HStack(spacing: AppleMetrics.space12) {
        Icon("file", size: AppleMetrics.font16)
        stats(additions: pr.additions, deletions: pr.deletions)
        Spacer(minLength: 0)
        if let count = pr.changedFiles {
          Text("\(count) \(Copy.text("pr.fileCount"))").foregroundStyle(AppleColors.secondary)
        }
      }.padding(.vertical, AppleMetrics.space12)
      if let comments = pr.comments {
        DetailRow(icon: "message", title: "\(comments) \(Copy.text("pr.comments"))", divider: true)
      }
    }
    if !card.markdown.blocks.isEmpty {
      MarkdownText(
        document: card.markdown, size: AppleMetrics.font15, leading: AppleMetrics.previewBodyLeading
      )
    }
    if !pr.files.isEmpty {
      Text(Copy.text("pr.files")).font(.sans(AppleMetrics.font13, .semibold)).foregroundStyle(
        AppleColors.secondary)
      ForEach(Array(pr.files.enumerated()), id: \.offset) { _, file in
        HStack(spacing: AppleMetrics.space12) {
          Icon("file", size: AppleMetrics.font16)
          Text(file.path).lineLimit(1).truncationMode(.middle)
          Spacer(minLength: 0)
          stats(additions: file.additions, deletions: file.deletions)
        }.padding(.vertical, AppleMetrics.space12)
      }
    }
  }
}

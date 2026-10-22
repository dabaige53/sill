import SillKit
import SwiftUI

struct PullRequestContent: View {
  let card: CardModel
  var detail = false
  var tags: [String]?
  var body: some View {
    VStack(alignment: .leading, spacing: detail ? AppleMetrics.space20 : AppleMetrics.space8) {
      if let pr = card.pullRequest {
        CardHead(
          card: card,
          text: "\(pr.repository) #\(pr.number)"
            + (detail
              ? " · \(Copy.text("pr.observed")) \(ReaderContent.fullDate(pr.observedAt) ?? pr.observedAt)"
              : "")
        ) {
          if !detail { status(pr) }
        }
        Text(card.title)
          .font(.sans(detail ? AppleMetrics.previewTitle : AppleMetrics.font16, .semibold))
          .fixedSize(horizontal: false, vertical: true)
        HStack(spacing: AppleMetrics.space8) {
          if detail { status(pr) }
          if pr.headBranch != nil || pr.baseBranch != nil {
            Text([pr.headBranch, pr.baseBranch].compactMap { $0 }.joined(separator: " → "))
              .font(.sans(AppleMetrics.font11)).lineLimit(1).truncationMode(.middle)
              .padding(.horizontal, AppleMetrics.space8).padding(.vertical, AppleMetrics.space4)
              .background(
                RoundedRectangle(cornerRadius: AppleMetrics.space6).fill(AppleColors.surface))
          }
          Spacer(minLength: 0)
          if !detail {
            stats(additions: pr.additions, deletions: pr.deletions)
            if let count = pr.changedFiles {
              Text("\(count) \(Copy.text("pr.fileCount"))").font(.sans(AppleMetrics.font11))
                .foregroundStyle(AppleColors.secondary)
            }
          }
        }
        if detail {
          ReaderTags(tags: tags ?? card.tags)
          Divider().padding(.vertical, AppleMetrics.space8)
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
    HStack(spacing: AppleMetrics.space6) {
      ForEach(Array(pr.reviewers.enumerated()), id: \.offset) { _, reviewer in
        Avatar(name: reviewer.login, size: AppleMetrics.space22)
          .overlay(alignment: .bottomTrailing) {
            Text(
              reviewer.decision == "approved"
                ? "✓" : reviewer.decision == "changesRequested" ? "!" : "·"
            )
            .font(.sans(AppleMetrics.font10)).foregroundStyle(AppleColors.secondary)
            .background(Circle().fill(AppleColors.card))
          }
          .help("\(reviewer.login) · \(Copy.text("pr.decision.\(reviewer.decision)"))")
      }
      if !pr.checks.isEmpty {
        Text(
          "\(Copy.text("pr.checks")) \(pr.checks.filter { $0.conclusion == "success" }.count)/\(pr.checks.count)"
        )
        .font(.sans(AppleMetrics.font11)).foregroundStyle(AppleColors.secondary)
      }
      Spacer(minLength: 0)
      if pr.reviewRequested == true {
        if let url = card.url {
          Link(Copy.text("pr.review"), destination: url)
            .padding(.horizontal, AppleMetrics.space12).padding(.vertical, AppleMetrics.space6)
            .foregroundStyle(AppleColors.fixedWhite).background(Capsule().fill(AppleColors.accent))
        } else {
          Button(Copy.text("pr.review")) {}.disabled(true)
            .padding(.horizontal, AppleMetrics.space18).padding(.vertical, AppleMetrics.space8)
            .foregroundStyle(AppleColors.fixedWhite).background(Capsule().fill(AppleColors.accent))
        }
      }
    }.padding(.top, AppleMetrics.space6)
  }

  @ViewBuilder private func details(_ pr: CardRichFields.PullRequest) -> some View {
    VStack(spacing: 0) {
      DisclosureGroup {
        ForEach(Array(pr.checks.enumerated()), id: \.offset) { _, check in
          let row = DetailRow(
            icon: "check-circle", title: check.name,
            trailing: Copy.text("pr.check.\(check.conclusion ?? check.status)"), divider: true)
          if let url = check.url { Link(destination: url) { row }.buttonStyle(.plain) } else { row }
        }
      } label: {
        DetailRow(
          icon: "check-circle",
          title:
            "\(Copy.text("pr.checks")) \(pr.checks.filter { $0.conclusion == "success" }.count)/\(pr.checks.count)"
        )
      }
      HStack(spacing: AppleMetrics.space12) {
        Icon("at", size: AppleMetrics.font16)
        Text(
          pr.reviewers.map { "\($0.login) \(Copy.text("pr.decision.\($0.decision)"))" }.joined(
            separator: " · ")
        )
        .frame(maxWidth: .infinity, alignment: .leading)
        ForEach(Array(pr.reviewers.enumerated()), id: \.offset) { _, reviewer in
          Avatar(name: reviewer.login, size: AppleMetrics.space22)
            .overlay(alignment: .bottomTrailing) {
              Text(
                reviewer.decision == "approved"
                  ? "✓" : reviewer.decision == "changesRequested" ? "!" : "·"
              )
              .font(.sans(AppleMetrics.font10)).foregroundStyle(
                reviewer.decision == "approved" ? AppleColors.success : AppleColors.secondary
              )
              .background(Circle().fill(AppleColors.card))
            }
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

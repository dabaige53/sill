#if os(iOS)
  import SillKit
  import SwiftUI

  struct MobileDetailRow: View {
    let icon: String
    let title: String
    var trailing = ""
    var tone = AppleColors.primary
    var divider = false
    var textScale: CGFloat = 1
    var strong = false
    @ScaledMetric(relativeTo: .body) private var dynamicScale: CGFloat = 1
    var body: some View {
      HStack(spacing: AppleMetrics.space12) {
        MobileIcon(icon, size: AppleMetrics.space16).foregroundStyle(AppleColors.secondary)
          .frame(width: AppleMetrics.space18)
        Text(title).frame(maxWidth: .infinity, alignment: .leading)
        if !trailing.isEmpty {
          Text(trailing).font(
            MobileContentStyle.font(
              AppleMetrics.font13, scale: textScale * dynamicScale, strong: strong)
          ).foregroundStyle(AppleColors.secondary)
        }
      }.font(
        MobileContentStyle.font(
          AppleMetrics.font14, scale: textScale * dynamicScale, strong: strong)
      ).foregroundStyle(tone)
        .padding(.vertical, AppleMetrics.space12)
        .frame(minHeight: AppleMetrics.detailRowHeight, alignment: .leading)
        .overlay(alignment: .top) {
          if divider { Rectangle().fill(AppleColors.line).frame(height: AppleMetrics.lineWidth) }
        }
    }
  }

  struct MobileDetailFiles: View {
    let values: [JSONValue]
    let heading: String
    var textScale: CGFloat = 1
    var strong = false
    @ScaledMetric(relativeTo: .body) private var dynamicScale: CGFloat = 1
    var body: some View {
      if !values.isEmpty {
        VStack(alignment: .leading, spacing: AppleMetrics.rhythmClose) {
          Text(Copy.text(heading)).font(
            MobileContentStyle.font(
              AppleMetrics.font13, weight: .semibold, scale: textScale * dynamicScale,
              strong: strong)
          )
          .foregroundStyle(AppleColors.secondary)
          VStack(spacing: 0) {
            ForEach(Array(values.enumerated()), id: \.offset) { index, value in
              if let url = MobileCard.safeURL(value["url"]?.string) {
                Link(destination: url) { file(value, divider: index > 0) }.buttonStyle(
                  MobilePressStyle())
              } else {
                file(value, divider: index > 0)
              }
            }
          }
        }
      }
    }
    private func file(_ value: JSONValue, divider: Bool) -> some View {
      let name = value["name"]?.string ?? ""
      let fileExtension = (name as NSString).pathExtension.uppercased()
      let metadata = [
        fileExtension.isEmpty ? nil : fileExtension,
        MobileFormat.fileSize(value["sizeBytes"]?.number.map(Int.init)),
        value["modifiedAt"]?.string.flatMap { MobileFormat.publication($0, includeTime: true) },
      ]
      .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
      return HStack(spacing: AppleMetrics.space12) {
        MobileIcon(
          value["mimeType"]?.string?.hasPrefix("image/") == true
            || ["PNG", "JPG", "JPEG", "GIF", "WEBP"].contains(fileExtension) ? "image" : "file",
          size: AppleMetrics.space20
        ).foregroundStyle(AppleColors.secondary)
        VStack(alignment: .leading, spacing: AppleMetrics.space4) {
          Text(name).font(
            MobileContentStyle.font(
              AppleMetrics.font15, weight: .medium, scale: textScale * dynamicScale, strong: strong)
          ).lineLimit(2)
          if !metadata.isEmpty {
            Text(metadata).font(
              MobileContentStyle.font(
                AppleMetrics.font13, scale: textScale * dynamicScale, strong: strong)
            ).foregroundStyle(AppleColors.secondary)
          }
        }.frame(maxWidth: .infinity, alignment: .leading)
        if MobileCard.safeURL(value["url"]?.string) != nil {
          MobileIcon("arrow", size: AppleMetrics.space16).foregroundStyle(AppleColors.secondary)
        }
      }.foregroundStyle(AppleColors.primary).padding(.vertical, AppleMetrics.space12)
        .frame(minHeight: AppleMetrics.hitTarget)
        .overlay(alignment: .top) {
          if divider { Rectangle().fill(AppleColors.line).frame(height: AppleMetrics.lineWidth) }
        }
    }
  }

  struct MobilePullRequestDetails: View {
    let pr: JSONValue
    var textScale: CGFloat = 1
    var strong = false
    @ScaledMetric(relativeTo: .body) private var dynamicScale: CGFloat = 1
    @State private var checksExpanded = false
    private var checks: [JSONValue] { pr["checks"]?.array ?? [] }
    private var reviewers: [JSONValue] { pr["reviewers"]?.array ?? [] }
    var body: some View {
      VStack(spacing: 0) {
        HStack(alignment: .top, spacing: AppleMetrics.space12) {
          MobileIcon("pull", size: AppleMetrics.space16).foregroundStyle(AppleColors.secondary)
            .frame(width: AppleMetrics.space18)
          VStack(alignment: .leading, spacing: AppleMetrics.space8) {
            Text(
              Copy.text(
                pr["reviewRequested"]?.bool == true
                  ? "pr.reviewRequested" : "pr.state.\(pr["state"]?.string ?? "open")")
            )
            .font(
              MobileContentStyle.font(
                AppleMetrics.font14, weight: .medium, scale: textScale * dynamicScale,
                strong: strong)
            ).foregroundStyle(AppleColors.accent)
            let head = pr["headBranch"]?.string
            let base = pr["baseBranch"]?.string
            if head != nil || base != nil {
              Text(mergeIntent(head: head ?? "", base: base ?? ""))
                .font(
                  MobileContentStyle.font(
                    AppleMetrics.font13, design: .monospaced, scale: textScale * dynamicScale,
                    strong: strong)
                )
                .foregroundStyle(AppleColors.secondary).textSelection(.enabled)
            }
          }.frame(maxWidth: .infinity, alignment: .leading)
        }.padding(.vertical, AppleMetrics.space12).frame(minHeight: AppleMetrics.detailRowHeight)
        if !checks.isEmpty {
          Button {
            withAnimation(MobileMotion.fast) { checksExpanded.toggle() }
          } label: {
            HStack(spacing: AppleMetrics.space12) {
              MobileDetailRow(
                icon: "check-circle",
                title: Copy.text("pr.checks")
                  + " \(checks.filter { $0["conclusion"]?.string == "success" }.count)/\(checks.count)",
                textScale: textScale, strong: strong)
              MobileIcon("chevron", size: AppleMetrics.space14).rotationEffect(
                .degrees(checksExpanded ? 90 : 0))
            }.overlay(alignment: .top) { Divider() }
          }.buttonStyle(MobilePressStyle()).accessibilityValue(
            checksExpanded ? Copy.text("web.close") : Copy.text("web.actions.open"))
          if checksExpanded {
            ForEach(Array(checks.enumerated()), id: \.offset) { _, check in
              let row = MobileDetailRow(
                icon: check["conclusion"]?.string == "success" ? "check" : "clock",
                title: check["name"]?.string ?? "",
                trailing: Copy.text(
                  "pr.check.\(check["conclusion"]?.string ?? check["status"]?.string ?? "queued")"),
                divider: true, textScale: textScale, strong: strong)
              if let url = MobileCard.safeURL(check["url"]?.string) {
                Link(destination: url) { row }.buttonStyle(MobilePressStyle())
              } else {
                row
              }
            }
          }
        }
        if !reviewers.isEmpty {
          MobileDetailRow(
            icon: "at",
            title: reviewers.map {
              ($0["login"]?.string ?? "") + " "
                + Copy.text("pr.decision.\($0["decision"]?.string ?? "pending")")
            }.joined(separator: " · "), divider: true, textScale: textScale, strong: strong)
        }
        if pr["additions"]?.number != nil || pr["deletions"]?.number != nil
          || pr["changedFiles"]?.number != nil
        {
          HStack(spacing: AppleMetrics.space12) {
            MobileIcon("file", size: AppleMetrics.space16).foregroundStyle(AppleColors.secondary)
              .frame(width: AppleMetrics.space18)
            if let count = pr["additions"]?.number {
              Text("+\(Int(count))").foregroundStyle(AppleColors.success)
            }
            if let count = pr["deletions"]?.number {
              Text("−\(Int(count))").foregroundStyle(AppleColors.warning)
            }
            Spacer(minLength: 0)
            if let count = pr["changedFiles"]?.number {
              Text("\(Int(count)) " + Copy.text("pr.fileCount")).foregroundStyle(
                AppleColors.secondary)
            }
          }.font(
            MobileContentStyle.font(
              AppleMetrics.font13, design: .rounded, scale: textScale * dynamicScale, strong: strong
            )
          ).monospacedDigit()
            .padding(.vertical, AppleMetrics.space12).frame(minHeight: AppleMetrics.detailRowHeight)
            .overlay(alignment: .top) { Divider() }
        }
        if let count = pr["comments"]?.number {
          MobileDetailRow(
            icon: "message", title: "\(Int(count)) " + Copy.text("pr.comments"), divider: true,
            textScale: textScale, strong: strong)
        }
      }
    }
    private func mergeIntent(head: String, base: String) -> String {
      guard let author = pr["author"]?["name"]?.string, !author.isEmpty else {
        return [head, base].filter { !$0.isEmpty }.joined(separator: " → ")
      }
      return Copy.text("pr.mergeIntent").replacingOccurrences(of: "{author}", with: author)
        .replacingOccurrences(of: "{head}", with: head).replacingOccurrences(
          of: "{base}", with: base)
    }
  }

  struct MobileReaderTags: View {
    let tags: [String]
    var scale: CGFloat = 1
    var strong = false
    @ScaledMetric(relativeTo: .body) private var dynamicScale: CGFloat = 1
    var body: some View {
      MobileFlowRow(spacing: AppleMetrics.space6) {
        ForEach(tags, id: \.self) { tag in
          Text("#" + tag).font(
            MobileContentStyle.font(
              AppleMetrics.font12, scale: scale * dynamicScale, strong: strong)
          )
          .foregroundStyle(AppleColors.secondary)
          .padding(.vertical, AppleMetrics.space3).padding(.horizontal, AppleMetrics.space10)
          .background(AppleColors.surface, in: Capsule())
        }
      }
    }
  }
#endif

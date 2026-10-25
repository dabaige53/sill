#if os(iOS)
  import SillKit
  import SwiftUI

  extension MobileCardBody {
    var event: some View {
      let start = card.start ?? 0
      let end = card.end ?? start
      let now = MobileFormat.milliseconds()
      let meeting = card.raw["meeting"]
      return stack {
        head(
          MobileFormat.dateLabel(start),
          trailing: MobileFormat.eventRelative(start: start, end: end, now: now),
          color: AppleColors.accent)
        HStack(alignment: .top, spacing: AppleMetrics.space14) {
          area {
            VStack(alignment: .leading, spacing: AppleMetrics.space4) {
              Text(MobileFormat.time(start)).font(
                font(
                  AppleMetrics.eventCardTimeSize,
                  weight: .semibold, design: .rounded)
              ).foregroundStyle(faded ? AppleColors.secondary : AppleColors.primary)
              Text(Copy.text("web.templates.83532308ecca") + MobileFormat.time(end))
                .font(font(AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
            }.monospacedDigit()
          }
          Rectangle().fill(AppleColors.accent.opacity(faded ? 0.5 : 1))
            .frame(width: AppleMetrics.space2)
          VStack(alignment: .leading, spacing: AppleMetrics.space8) {
            title()
            if let name = meeting?["name"]?.string, !name.isEmpty { locationRow("video", name) }
            if let location = card.location, !location.isEmpty { locationRow("pin", location) }
          }
        }.fixedSize(horizontal: false, vertical: true)
        if !card.people.isEmpty || meeting != nil {
          HStack(spacing: AppleMetrics.space12) {
            if !card.people.isEmpty {
              area {
                HStack(spacing: AppleMetrics.space8) {
                  MobileAvatars(names: card.people)
                  Text(card.people.joined(separator: "、")).font(font(AppleMetrics.font13))
                    .foregroundStyle(AppleColors.secondary).lineLimit(1)
                }
              }
            }
            Spacer(minLength: 0)
            if MobileFormat.eventTimely(start: start, end: end, now: now),
              let url = MobileCard.safeURL(meeting?["url"]?.string)
            {
              Button(Copy.text("web.templates.451755e3831f")) { openURL(url) }
                .font(font(AppleMetrics.font14, weight: .semibold))
                .foregroundStyle(AppleColors.fixedWhite)
                .padding(.horizontal, AppleMetrics.pillPaddingX).frame(
                  minHeight: AppleMetrics.pillHeight
                )
                .background(AppleColors.accentFill, in: Capsule()).buttonStyle(MobilePressStyle())
            }
          }
        }
      }
    }
    private func locationRow(_ icon: String, _ text: String) -> some View {
      area {
        HStack(spacing: AppleMetrics.space6) {
          MobileIcon(icon, size: AppleMetrics.font15)
          Text(text).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
        }.font(font(AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
      }
    }

    var media: some View {
      let podcast = card.raw["media"]?.string == "podcast"
      let duration = card.raw["duration"]?.number
      let remaining =
        duration.map {
          Copy.text("web.media.remaining").replacingOccurrences(
            of: "{minutes}",
            with: String(Int(ceil(max(0, $0 - card.playbackPosition) / 60))))
        } ?? ""
      let progress =
        duration.flatMap { $0 > 0 ? min(1, max(0, card.playbackPosition / $0)) : nil } ?? 0
      let length =
        duration.map { MobileFormat.duration(Int($0)) } ?? Copy.text("web.media.unknownDuration")
      return VStack(spacing: 0) {
        if !podcast {
          area {
            MobileCoverImage(source: card.coverSource, faded: faded)
              .aspectRatio(AppleMetrics.mobileMediaAspect, contentMode: .fit)
              .overlay {
                MobileIcon("play", size: AppleMetrics.space20)
                  .frame(width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
                  .background(.thickMaterial, in: Circle())
              }
              .overlay(alignment: .bottom) {
                HStack(alignment: .center, spacing: AppleMetrics.space8) {
                  timeline(progress).tint(AppleColors.fixedWhite)
                  Text(length).font(font(AppleMetrics.font12)).monospacedDigit()
                    .padding(.horizontal, AppleMetrics.space6).padding(
                      .vertical, AppleMetrics.space3
                    )
                    .foregroundStyle(AppleColors.fixedWhite)
                    .background(
                      AppleColors.fixedBlack55,
                      in: RoundedRectangle(cornerRadius: AppleMetrics.mediaLengthRadius))
                }.padding(AppleMetrics.space10)
              }
              .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.coverRadius))
          }.padding([.top, .horizontal], AppleMetrics.coverInset)
        }
        stack {
          head(trailing: remaining)
          title()
          if podcast {
            summary()
            area {
              HStack(spacing: AppleMetrics.space10) {
                MobileIcon("play", size: AppleMetrics.space12)
                  .foregroundStyle(AppleColors.fixedWhite)
                  .frame(width: AppleMetrics.space20, height: AppleMetrics.space20)
                  .background(AppleColors.primary, in: Circle())
                timeline(progress).tint(AppleColors.accent)
                Text(length).font(font(AppleMetrics.font12)).monospacedDigit().foregroundStyle(
                  AppleColors.secondary)
              }.padding(.top, AppleMetrics.space4)
            }
          }
        }
      }
    }
    private func timeline(_ progress: Double) -> some View {
      GeometryReader { proxy in
        Capsule().fill(AppleColors.line)
          .overlay(alignment: .leading) {
            Capsule().fill(.tint).frame(width: proxy.size.width * progress)
          }
      }.frame(height: AppleMetrics.space3).accessibilityHidden(true)
    }

    var photo: some View {
      let sources = card.photoSources
      return VStack(spacing: 0) {
        if !sources.isEmpty {
          area {
            GeometryReader { proxy in
              HStack(spacing: AppleMetrics.space3) {
                MobileCoverImage(source: sources[0], faded: faded)
                  .frame(width: sources.count > 2 ? proxy.size.width * 2 / 3 : nil)
                if sources.count == 2 { MobileCoverImage(source: sources[1], faded: faded) }
                if sources.count > 2 {
                  VStack(spacing: AppleMetrics.space3) {
                    MobileCoverImage(source: sources[1], faded: faded)
                    MobileCoverImage(source: sources[2], faded: faded)
                  }
                }
              }
            }.aspectRatio(AppleMetrics.mobileMediaAspect, contentMode: .fit)
              .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.coverRadius))
          }.padding([.top, .horizontal], AppleMetrics.coverInset)
        }
        stack {
          head(
            [card.location ?? "", card.presentationDate].filter { !$0.isEmpty }.joined(
              separator: " · "),
            trailing: sources.isEmpty
              ? "" : "\(sources.count)\(Copy.text("web.common.cardCountSuffix"))")
          title()
          summary(card.caption ?? "")
        }
      }
    }

    var pullRequest: some View {
      stack {
        if let pr = card.raw["pullRequest"] {
          area {
            HStack(spacing: AppleMetrics.space6) {
              MobileSourceMark(card: card)
              Text("\(pr["repository"]?.string ?? "") #\(Int(pr["number"]?.number ?? 0))")
                .font(font(AppleMetrics.font12)).foregroundStyle(AppleColors.secondary).lineLimit(1)
              Spacer(minLength: 0)
              prState(pr)
            }.frame(minHeight: AppleMetrics.cardHeadHeight)
          }
          title()
          area {
            HStack(spacing: AppleMetrics.space8) {
              let branches = [pr["headBranch"]?.string, pr["baseBranch"]?.string].compactMap { $0 }
              if !branches.isEmpty {
                Text(branches.joined(separator: " → ")).font(
                  font(AppleMetrics.font12, design: .monospaced)
                )
                .lineLimit(1).truncationMode(.middle)
                .padding(.vertical, AppleMetrics.space2).padding(.horizontal, AppleMetrics.space6)
                .background(
                  AppleColors.surface, in: RoundedRectangle(cornerRadius: AppleMetrics.space6))
              }
              Spacer(minLength: 0)
              if let count = pr["additions"]?.number {
                Text("+\(Int(count))").foregroundStyle(AppleColors.success)
              }
              if let count = pr["deletions"]?.number {
                Text("−\(Int(count))").foregroundStyle(AppleColors.warning)
              }
              if let count = pr["changedFiles"]?.number {
                Text("\(Int(count)) \(Copy.text("pr.fileCount"))").foregroundStyle(
                  AppleColors.secondary)
              }
            }.font(font(AppleMetrics.font12)).monospacedDigit()
          }
          prFooter(pr)
        } else {
          head()
          title()
        }
      }
    }
    private func prState(_ pr: JSONValue) -> some View {
      let state = pr["state"]?.string ?? "draft"
      let muted = state == "draft" || state == "closed"
      return Text(
        Copy.text(pr["reviewRequested"]?.bool == true ? "pr.reviewRequested" : "pr.state.\(state)")
      )
      .font(font(AppleMetrics.font11, weight: .medium)).lineLimit(1)
      .padding(.vertical, AppleMetrics.space3).padding(.horizontal, AppleMetrics.space9)
      .foregroundStyle(muted ? AppleColors.secondary : AppleColors.accent)
      .background(muted ? AppleColors.surface : AppleColors.accentSoft, in: Capsule())
    }
    private func prFooter(_ pr: JSONValue) -> some View {
      let reviewers = pr["reviewers"]?.array ?? []
      let checks = pr["checks"]?.array ?? []
      let passed = checks.filter { $0["conclusion"]?.string == "success" }.count
      return HStack(spacing: AppleMetrics.space12) {
        area {
          HStack(spacing: AppleMetrics.space10) {
            ForEach(Array(reviewers.enumerated()), id: \.offset) { _, reviewer in
              prReviewer(reviewer)
            }
            if !checks.isEmpty {
              HStack(spacing: AppleMetrics.space4) {
                MobileIcon(passed == checks.count ? "check" : "clock", size: AppleMetrics.space12)
                Text("\(Copy.text("pr.checks")) \(passed)/\(checks.count)")
              }.font(font(AppleMetrics.font12))
                .foregroundStyle(
                  passed == checks.count ? AppleColors.success : AppleColors.secondary)
            }
          }
        }
        Spacer(minLength: 0)
        if pr["reviewRequested"]?.bool == true {
          Button(Copy.text("pr.review")) {
            if let url = card.url { openURL(url) } else { open() }
          }.font(font(AppleMetrics.font14)).padding(.horizontal, AppleMetrics.pillPaddingX)
            .frame(minHeight: AppleMetrics.pillHeight)
            .background(AppleColors.surface, in: Capsule()).buttonStyle(MobilePressStyle())
        }
      }.padding(.top, AppleMetrics.space4)
    }
    private func prReviewer(_ reviewer: JSONValue) -> some View {
      let name = reviewer["login"]?.string ?? ""
      let decision = reviewer["decision"]?.string ?? "pending"
      let tone =
        decision == "approved"
        ? AppleColors.success
        : ["pending", "changesRequested"].contains(decision)
          ? AppleColors.warning : AppleColors.secondary
      return MobileAvatar(name: name, size: AppleMetrics.avatarStackSize)
        .overlay(alignment: .bottomTrailing) {
          Circle().fill(tone).frame(width: AppleMetrics.space12, height: AppleMetrics.space12)
            .overlay {
              if decision == "approved" {
                MobileIcon("check", size: AppleMetrics.space8).foregroundStyle(
                  AppleColors.fixedWhite)
              }
              if decision == "changesRequested" {
                Text("!").font(.system(size: AppleMetrics.font10)).foregroundStyle(
                  AppleColors.fixedWhite)
              }
            }.overlay(Circle().stroke(AppleColors.card, lineWidth: AppleMetrics.space2))
            .offset(x: AppleMetrics.space3, y: AppleMetrics.space3)
        }.accessibilityElement(children: .ignore)
        .accessibilityLabel(name + " · " + Copy.text("pr.decision.\(decision)"))
    }
  }
#endif

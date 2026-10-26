#if os(iOS)
  import SillKit
  import SwiftUI

  struct MobileReaderToolbarAction: Identifiable {
    let key: String
    let icon: String
    let label: String
    var active = false
    var own = false
    var id: String { key }
  }

  extension MobileReader {
    func toolbarActions(_ card: MobileCard) -> [MobileReaderToolbarAction] {
      let hidden = Set(workspace.preferences["hiddenActions"]?.strings ?? [])
      let shared = [
        MobileReaderToolbarAction(
          key: "bookmark", icon: "bookmark",
          label: Copy.text(card.bookmarked ? "web.preview.removeBookmark" : "web.bookmark"),
          active: card.bookmarked),
        MobileReaderToolbarAction(
          key: "tag", icon: "tag", label: Copy.text("web.editor.openTagsAndNote")),
        MobileReaderToolbarAction(
          key: "later", icon: "glasses",
          label: Copy.text(card.later ? "web.preview.removeLater" : "web.later"), active: card.later
        ),
      ].filter { !hidden.contains($0.key) }
      let now = Date().timeIntervalSince1970 * 1000
      let start = card.start ?? 0
      let timely = start - now <= 15 * 60_000 && now < (card.end ?? start)
      let meeting = MobileCard.safeURL(card.raw["meeting"]?["url"]?.string)
      let snoozed = (card.item["snoozedUntil"]?.number ?? 0) > 0
      let restore = card.dismissed || snoozed || (card.reminderDone && card.type != "reminder")
      let own = MobileReaderPolicy.ownActions(
        type: card.type, hasURL: card.url != nil,
        hasMeeting: meeting != nil, timely: timely, dismissed: card.dismissed,
        reminderDone: card.reminderDone, snoozed: snoozed, hidden: hidden
      ).map { key in
        let icon: String
        let label: String
        switch key {
        case "reply":
          icon = "reply"
          label = "web.preview.reply"
        case "join":
          icon = "video"
          label = "web.actions.join"
        case "snooze":
          icon = restore ? "bell" : "snooze"
          label = restore ? "web.templates.4b03be14c1f4" : "web.reminder.again"
        case "dismiss":
          icon = "bell-off"
          label = "web.preview.dismissReminder"
        case "download":
          icon = "download"
          label = "web.preview.downloadCalendar"
        default:
          icon = "external"
          label =
            card.raw["media"]?.string == "podcast"
            ? "web.preview.podcast.openApp" : "web.actions.open"
        }
        return MobileReaderToolbarAction(key: key, icon: icon, label: Copy.text(label), own: true)
      }
      return shared + own
    }

    @ViewBuilder func toolbar(_ card: MobileCard) -> some View {
      let actions = toolbarActions(card)
      if !actions.isEmpty {
        HStack(spacing: AppleMetrics.space2) {
          ForEach(actions) { action in
            if action.id == actions.first(where: \.own)?.id && actions.contains(where: { !$0.own })
            {
              Rectangle().fill(AppleColors.line).frame(
                width: AppleMetrics.lineWidth,
                height: AppleMetrics.toolbarSeparatorHeight
              ).padding(.horizontal, AppleMetrics.space4)
            }
            MobileReaderTool(
              icon: action.icon, label: action.label, active: action.active, own: action.own,
              belowTip: layer.full
            ) {
              perform(action.key, card: card)
            }
            .disabled(workspace.busy || workspace.unresolvedWrite)
          }
        }
        .padding(AppleMetrics.railInset)
        .mobileGlass(Capsule())
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Copy.text("web.readerTools"))
      }
    }

    private func perform(_ key: String, card: MobileCard) {
      switch key {
      case "bookmark": Task { await workspace.toggle(card, field: "bookmarked") }
      case "tag": annotations = true
      case "later": Task { await workspace.toggle(card, field: "later") }
      case "open", "reply": if let url = card.url { openURL(url) }
      case "join":
        if let url = MobileCard.safeURL(card.raw["meeting"]?["url"]?.string) { openURL(url) }
      case "download":
        calendarDocument = MobileCalendarDocument(card)
        exportingCalendar = calendarDocument != nil
      case "dismiss":
        Task {
          _ = await workspace.patch(
            card, values: ["dismissed": .bool(true), "snoozedUntil": .number(0)])
        }
      case "snooze":
        let restore =
          card.dismissed || (card.item["snoozedUntil"]?.number ?? 0) > 0
          || (card.reminderDone && card.type != "reminder")
        Task {
          var values: [String: JSONValue] = [
            "snoozedUntil": .number(restore ? 0 : Date().timeIntervalSince1970 * 1000 + 600_000),
            "dismissed": .bool(false), "reminderDone": .bool(false),
          ]
          if restore {
            values["lastReminderKey"] = .string(MobileReminderPolicy.key(card))
            values["lastNotifiedAt"] = .number(Date().timeIntervalSince1970 * 1000)
          }
          _ = await workspace.patch(card, values: values)
        }
      default: break
      }
    }
  }

  struct MobileReaderTool: View {
    let icon: String
    let label: String
    var active = false
    var own = false
    var belowTip = false
    let action: () -> Void
    var body: some View {
      Button(action: action) {
        MobileIcon(icon, size: AppleMetrics.space20)
          .foregroundStyle(own || active ? AppleColors.accent : AppleColors.primary)
          .frame(width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
          .contentShape(Rectangle())
      }
      .buttonStyle(MobileToolStyle(label: label, below: belowTip))
      .accessibilityLabel(label)
      .accessibilityAddTraits(active ? .isSelected : [])
      .help(label)
    }
  }
#endif

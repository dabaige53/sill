#if os(iOS)
import SillKit
import SwiftUI
import UIKit

struct MobileSearch: View {
  let workspace: MobileWorkspace
  let settings: () -> Void
  let open: (String) -> Void
  @Binding var query: String
  @Binding var type: String?
  @Binding var conditions: Set<String>
  private let types = ["article", "mail", "note", "task", "event", "reminder", "media", "digest", "suggestion", "photo", "file", "pr"]

  private var searching: Bool { !query.isEmpty || type != nil || !conditions.isEmpty }
  private var hashtag: String? {
    guard let last = query.split(separator: " ", omittingEmptySubsequences: false).last,
      last.hasPrefix("#") else { return nil }
    return String(last.dropFirst())
  }
  private var results: [MobileCard] {
    workspace.filtered(scope: "search", query: query, type: type).filter { card in
      conditions.allSatisfy { condition in
        switch condition {
        case "unread": !card.read && !card.completed
        case "bookmarks": card.bookmarked
        case "later": card.later
        default: card.tags.contains(String(condition.dropFirst(4)))
        }
      }
    }
  }

  var body: some View {
    VStack(spacing: AppleMetrics.space12) {
      if !searching {
        HStack {
          Text(Copy.text("web.search.title"))
            .font(.system(size: AppleMetrics.font34, weight: .bold))
            .accessibilityAddTraits(.isHeader)
          Spacer()
          MobileIconButton("person", label: Copy.text("apple.settings"), action: settings)
        }.frame(minHeight: AppleMetrics.railRow)
      }
      HStack(spacing: AppleMetrics.space8) {
        HStack(spacing: AppleMetrics.space8) {
          MobileIcon("search", size: AppleMetrics.space20)
          MobileCommittedField(text: $query, placeholder: Copy.text("web.search.inputPlaceholder"))
            .frame(minHeight: AppleMetrics.hitTarget)
        }
        .padding(.horizontal, AppleMetrics.space12)
        .background(AppleColors.surface, in: Capsule())
        if searching {
          MobileIconButton("x", label: Copy.text("web.search.reset")) {
            query = ""; type = nil; conditions = []
          }
        }
      }
      if type != nil || !conditions.isEmpty {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: AppleMetrics.space8) {
            if let type {
              MobilePill(title: Copy.text("card.type." + type), selected: true) { self.type = nil }
            }
            ForEach(conditions.sorted(), id: \.self) { condition in
              MobilePill(title: "#" + conditionTitle(condition), selected: true) { conditions.remove(condition) }
            }
          }
        }
      }
      if let hashtag {
        ScrollView {
          VStack(alignment: .leading, spacing: 0) {
            ForEach(suggestions(hashtag), id: \.self) { value in
              Button(conditionTitle(value)) {
                conditions.insert(value)
                query = query.components(separatedBy: " ").dropLast().joined(separator: " ")
              }
              .frame(maxWidth: .infinity, minHeight: AppleMetrics.hitTarget, alignment: .leading)
            }
          }
        }
      } else if !searching {
        ScrollView {
          LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: AppleMetrics.space12) {
            ForEach(types, id: \.self) { kind in
              Button { type = kind } label: {
                ZStack(alignment: .bottomLeading) {
                  RoundedRectangle(cornerRadius: AppleMetrics.space12).fill(AppleColors.surface)
                  VStack(alignment: .leading, spacing: AppleMetrics.space16) {
                    MobileIcon(MobileCardTile.icon(kind), size: AppleMetrics.space24)
                      .foregroundStyle(AppleColors.secondary)
                    Text(Copy.text("card.type." + kind))
                      .font(.system(size: AppleMetrics.font19, weight: .semibold))
                  }.padding(AppleMetrics.space16)
                }.aspectRatio(AppleMetrics.mobileCategoryAspect, contentMode: .fit)
              }.buttonStyle(.plain)
            }
          }
        }
      } else {
        if type == nil && !query.isEmpty {
          ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: AppleMetrics.space8) {
              ForEach(types.filter { kind in results.contains { $0.type == kind } }, id: \.self) { kind in
                MobilePill(title: Copy.text("card.type." + kind), selected: false) { type = kind }
              }
            }
          }
        }
        ScrollView {
          LazyVGrid(columns: [GridItem(.adaptive(minimum: AppleMetrics.cardMinWidth))], spacing: AppleMetrics.space12) {
            ForEach(results) { card in
              MobileCardTile(workspace: workspace, card: card) { open(card.id) }
            }
          }
          if results.isEmpty { MobileEmpty(search: true) }
        }
      }
    }
    .padding(.horizontal, AppleMetrics.space16)
    .background(AppleColors.card)
  }

  private func conditionTitle(_ key: String) -> String {
    key.hasPrefix("tag:") ? String(key.dropFirst(4)) : Copy.text("apple." + key)
  }
  private func suggestions(_ text: String) -> [String] {
    let tags = Set(workspace.cards.flatMap(\.tags)).sorted().map { "tag:" + $0 }
    return (["unread", "bookmarks", "later"] + tags).filter {
      !conditions.contains($0) && (text.isEmpty || conditionTitle($0).localizedStandardContains(text))
    }
  }
}

/// Publish text only after marked-text composition ends, including Chinese input methods.
private struct MobileCommittedField: UIViewRepresentable {
  @Binding var text: String
  let placeholder: String

  func makeUIView(context: Context) -> UITextField {
    let field = UITextField()
    field.delegate = context.coordinator
    field.addTarget(context.coordinator, action: #selector(Coordinator.changed), for: .editingChanged)
    field.placeholder = placeholder
    field.accessibilityLabel = placeholder
    field.font = .preferredFont(forTextStyle: .body)
    field.adjustsFontForContentSizeCategory = true
    field.returnKeyType = .search
    field.autocorrectionType = .no
    field.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    return field
  }
  func updateUIView(_ field: UITextField, context: Context) {
    context.coordinator.parent = self
    if field.markedTextRange == nil && field.text != text { field.text = text }
  }
  func makeCoordinator() -> Coordinator { Coordinator(self) }

  final class Coordinator: NSObject, UITextFieldDelegate {
    var parent: MobileCommittedField
    init(_ parent: MobileCommittedField) { self.parent = parent }
    @objc func changed(_ field: UITextField) {
      if field.markedTextRange == nil { parent.text = field.text ?? "" }
    }
    func textFieldShouldReturn(_ field: UITextField) -> Bool {
      changed(field)
      field.resignFirstResponder()
      return true
    }
  }
}
#endif

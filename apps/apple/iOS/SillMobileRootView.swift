#if os(iOS)
import SillKit
import SwiftUI
import UIKit

/// Native iPhone and iPad entry. Session cookies remain in SillKit's Keychain vault.
public struct SillMobileRootView: View {
  @State private var workspace = MobileWorkspace()
  @State private var reminders = MobileReminders.shared
  @Environment(\.scenePhase) private var scenePhase

  public init() {}

  public var body: some View {
    Group {
      if !workspace.started {
        ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
          .background(AppleColors.canvas)
      } else if workspace.owner == nil || workspace.needsPasswordSetup {
        MobileLogin(workspace: workspace)
      } else {
        MobileShell(workspace: workspace, reminders: reminders).id(workspace.owner)
      }
    }
    .tint(AppleColors.accent)
    .foregroundStyle(AppleColors.primary)
    .preferredColorScheme(colorScheme)
    .task { await workspace.start() }
    .task(id: "\(workspace.owner ?? ""):\(workspace.revision):\(workspace.sessionChecked)") {
      await reminders.reconcile(workspace)
    }
    .onChange(of: scenePhase) { _, phase in
      if phase == .active, workspace.started { Task { await workspace.refresh() } }
    }
  }

  private var colorScheme: ColorScheme? {
    switch workspace.preferences["theme"]?.string {
    case "light": .light
    case "dark": .dark
    default: nil
    }
  }
}

private struct MobileShell: View {
  let workspace: MobileWorkspace
  let reminders: MobileReminders
  @State private var tab = "home"
  @State private var scope = "all"
  @State private var selected: Set<String> = []
  @State private var cardID: CardDestination?
  @State private var settings = false
  @State private var capture = false
  @State private var errorDetails = false
  @State private var scrollPositions: [String: String] = [:]
  @State private var feedIDs: [String] = []
  @State private var aiDraft = ""
  @State private var searchQuery = ""
  @State private var searchType: String?
  @State private var searchConditions: Set<String> = []
  @State private var keyboardVisible = false
  @FocusState private var aiFocused: Bool

  private let scopes = ["all", "unread", "tasks", "later", "bookmarks"]

  var body: some View {
    VStack(spacing: 0) {
      if tab != "search" { header }
      if tab == "home" {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: AppleMetrics.space8) {
            ForEach(scopes, id: \.self) { key in
              MobilePill(title: scopeTitle(key), selected: scope == key) { scope = key }
            }
          }.padding(.horizontal, AppleMetrics.space16)
        }
        home
      } else if tab == "search" {
        MobileSearch(workspace: workspace, settings: { settings = true }, open: open,
          query: $searchQuery, type: $searchType, conditions: $searchConditions)
      } else {
        assistant
      }
    }
    .background(AppleColors.canvas)
    .safeAreaInset(edge: .bottom) {
      if !aiFocused && !keyboardVisible {
        if selected.isEmpty { navigation } else { selectionBar }
      }
    }
    .sheet(item: $cardID) { destination in
      MobileReader(workspace: workspace, cardID: destination.id)
        .presentationDetents([.large]).presentationDragIndicator(.visible)
    }
    .sheet(isPresented: $settings) {
      NavigationStack { MobileSettings(workspace: workspace) }
    }
    .sheet(isPresented: $capture) { NavigationStack { MobileCapture(workspace: workspace) } }
    .sheet(isPresented: $errorDetails) {
      NavigationStack {
        MobileError(workspace: workspace)
          .navigationTitle(Copy.text("mobile.error.title"))
          .navigationBarTitleDisplayMode(.inline)
          .toolbar {
            ToolbarItem(placement: .confirmationAction) {
              Button(Copy.text("apple.cancel")) { errorDetails = false }
            }
          }
      }.presentationDetents([.medium, .large])
    }
    .onAppear {
      reloadFeed()
      reminders.onOpen = open
    }
    .onDisappear { reminders.onOpen = nil }
    .onChange(of: scope) { _, _ in reloadFeed() }
    .onChange(of: workspace.cards.map(\.id)) { _, _ in
      reloadFeed()
      selected.formIntersection(workspace.cards.map(\.id))
    }
    .onChange(of: workspace.error) { _, error in
      if error != nil, workspace.unresolvedWrite { errorDetails = true }
    }
    .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
      keyboardVisible = true
    }
    .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
      keyboardVisible = false
    }
  }

  private var header: some View {
    HStack(spacing: AppleMetrics.space8) {
      Button(tab == "home" ? "Sill" : Copy.text("web.ai.title")) {
        if tab == "home" { scrollPositions[scope] = feedIDs.first }
      }
      .font(.system(size: AppleMetrics.font34, weight: .bold))
      .buttonStyle(.plain).accessibilityAddTraits(.isHeader)
      Spacer()
      if workspace.error != nil {
        MobileIconButton("info", label: Copy.text("mobile.error.title")) { errorDetails = true }
      }
      if tab == "ai" {
        MobileIconButton("clock", label: Copy.text("web.ai.history")) {}.disabled(true)
        MobileIconButton("plus", label: Copy.text("web.ai.newChat")) {}.disabled(true)
      } else {
        MobileIconButton("person", label: Copy.text("apple.settings")) { settings = true }
      }
    }
    .frame(minHeight: AppleMetrics.railRow)
    .padding(.horizontal, AppleMetrics.space16)
  }

  private var home: some View {
    ScrollView {
      LazyVGrid(
        columns: [GridItem(.adaptive(minimum: AppleMetrics.cardMinWidth), spacing: cardGap)],
        spacing: cardGap
      ) {
        ForEach(feedIDs, id: \.self) { id in
          if let card = workspace.card(id), card.archived == (scope == "archive") {
            MobileCardTile(workspace: workspace, card: card) {
              if selected.isEmpty { open(id) } else { toggleSelection(id) }
            }
            .overlay(alignment: .topTrailing) {
              if selected.contains(id) {
                MobileIcon("check", size: AppleMetrics.space20)
                  .padding(AppleMetrics.space8)
                  .foregroundStyle(AppleColors.card)
                  .background(AppleColors.accent, in: Circle())
              }
            }
            .contextMenu {
              Button(Copy.text("apple.select")) { toggleSelection(id) }
              Button(Copy.text("apple.toggleBookmarkMenu")) {
                Task { await workspace.toggle(card, field: "bookmarked") }
              }
              Button(Copy.text("apple.toggleLaterMenu")) {
                Task { await workspace.toggle(card, field: "later") }
              }
              Button(Copy.text("apple.archive")) {
                Task { if await workspace.toggle(card, field: "archived") { reloadFeed() } }
              }
            }
            .id(id)
          }
        }
      }
      .scrollTargetLayout()
      .padding(AppleMetrics.space16)
      if feedIDs.isEmpty { MobileEmpty(capture: { capture = true }) }
      Button(Copy.text(scope == "archive" ? "apple.restore" : "mobile.archive")) {
        scope = scope == "archive" ? "all" : "archive"
      }
      .foregroundStyle(AppleColors.secondary)
      .padding(AppleMetrics.space24)
    }
    .scrollPosition(id: Binding(
      get: { scrollPositions[scope] }, set: { scrollPositions[scope] = $0 }))
    .refreshable { await workspace.refresh(); reloadFeed() }
  }

  private var cardGap: CGFloat {
    switch workspace.preferences["cardSpacing"]?.string {
    case "compact": AppleMetrics.space8
    case "roomy": AppleMetrics.space20
    default: AppleMetrics.space12
    }
  }

  // @design nav-capsule Fixed three destinations; settings remains in the account button.
  private var navigation: some View {
    HStack(spacing: 0) {
      navButton("home", icon: "home", title: Copy.text("web.nav.home"))
      navButton("ai", icon: "sparkles", title: Copy.text("web.nav.ai"))
      navButton("search", icon: "search", title: Copy.text("web.nav.search"))
    }
    .padding(AppleMetrics.railInset)
    .background(.regularMaterial, in: Capsule())
    .padding(.bottom, AppleMetrics.space16)
  }

  private func navButton(_ key: String, icon: String, title: String) -> some View {
    Button { tab = key } label: {
      VStack(spacing: AppleMetrics.space4) {
        MobileIcon(icon, size: AppleMetrics.space20)
        Text(title).font(.system(size: AppleMetrics.font12, weight: .medium))
      }
      .frame(width: AppleMetrics.navTab, height: AppleMetrics.railRow)
      .background(tab == key ? AppleColors.card : .clear, in: Capsule())
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(tab == key ? .isSelected : [])
  }

  private var selectionBar: some View {
    HStack(spacing: AppleMetrics.space4) {
      Text(Copy.text("mobile.selection").replacingOccurrences(of: "{count}", with: String(selected.count)))
        .font(.system(size: AppleMetrics.font12))
        .padding(.leading, AppleMetrics.space12)
      MobileIconButton("bookmark", label: Copy.text("apple.bookmarks")) { batch("bookmarked") }
      MobileIconButton("clock", label: Copy.text("apple.later")) { batch("later") }
      MobileIconButton("folder", label: Copy.text("apple.archive")) { batch("archived") }
      MobileIconButton("x", label: Copy.text("apple.clearSelection")) { selected = [] }
    }
    .disabled(workspace.busy || workspace.unresolvedWrite)
    .padding(AppleMetrics.railInset).background(.regularMaterial, in: Capsule())
    .padding(.bottom, AppleMetrics.space16)
  }

  private var assistant: some View {
    VStack(alignment: .leading, spacing: AppleMetrics.space16) {
      Spacer()
      Text(Copy.text("web.ai.body")).foregroundStyle(AppleColors.secondary)
      TextField(Copy.text("web.ai.composer"), text: $aiDraft, axis: .vertical)
        .font(.system(size: AppleMetrics.font17)).focused($aiFocused)
        .padding(AppleMetrics.space16)
        .background(AppleColors.card, in: RoundedRectangle(cornerRadius: AppleMetrics.mobileCardRadius))
      HStack {
        Text(Copy.text("web.ai.localOnly")).foregroundStyle(AppleColors.secondary)
        Spacer()
        MobileIconButton("send", label: Copy.text("web.ai.sendUnavailable")) {}.disabled(true)
      }
    }
    .padding(AppleMetrics.space16)
  }

  private func scopeTitle(_ key: String) -> String {
    Copy.text(key == "tasks" ? "card.type.task" : "apple." + key)
  }
  private func open(_ id: String) { cardID = CardDestination(id: id) }
  private func reloadFeed() { feedIDs = workspace.filtered(scope: scope).map(\.id) }
  private func toggleSelection(_ id: String) {
    if selected.contains(id) { selected.remove(id) } else { selected.insert(id) }
  }
  private func batch(_ field: String) {
    let ids = selected
    Task {
      if await workspace.batch(ids: ids, field: field, value: true) {
        selected = []
        if field == "archived" { reloadFeed() }
      }
    }
  }
}

private struct CardDestination: Identifiable { let id: String }
#endif

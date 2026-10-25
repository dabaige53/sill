#if os(iOS)
  import SillKit
  import SwiftUI
  import UIKit

  public struct SillMobileRootView: View {
    @State private var workspace = MobileWorkspace()
    @State private var reminders = MobileReminders.shared
    @Environment(\.scenePhase) private var scenePhase
    public init() {}

    public var body: some View {
      Group {
        if !workspace.started {
          MobileLaunch()
        } else if workspace.owner == nil || workspace.needsPasswordSetup {
          MobileLogin(workspace: workspace)
        } else {
          MobileShell(workspace: workspace, reminders: reminders).id(workspace.owner)
        }
      }
      .tint(AppleColors.accent).foregroundStyle(AppleColors.primary)
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
    @Environment(\.scenePhase) private var scenePhase
    @State private var feed = MobileFeedState()
    @State private var search = MobileSearchState()
    @State private var chrome = MobileChromeState()
    @State private var refresh = MobileRefresh()
    @State private var tab = "home"
    @State private var scope = "all"
    @State private var selected: Set<String> = []
    @State private var openedCardID: String?
    @State private var settings = false
    @State private var capture = false
    @State private var errorDetails = false
    @State private var annotations = false
    @State private var annotationBaselines: [MobileCard] = []
    @State private var aiContext: [String] = []
    @State private var aiDraft = ""
    @State private var keyboardVisible = false
    @State private var topRequest = 0
    @State private var reminderHint: [MobileCard] = []
    private let scopes = ["all", "unread", "tasks", "later", "bookmarks"]
    private var blocked: Bool {
      openedCardID != nil || settings || capture || annotations || errorDetails
    }
    private var railHidden: Bool { chrome.hidden || keyboardVisible }

    var body: some View {
      NavigationStack {
        ZStack(alignment: .bottom) {
          pages
          rail
        }
        .background(AppleColors.canvas)
        .toolbar(.hidden, for: .navigationBar)
        .navigationDestination(isPresented: $settings) { MobileSettings(workspace: workspace) }
        .allowsHitTesting(openedCardID == nil)
        .accessibilityHidden(openedCardID != nil)
        .overlay { MobileReaderHost(workspace: workspace, selection: $openedCardID) }
        .overlay(alignment: .topTrailing) { errorPopover }
        .sheet(isPresented: $capture) { NavigationStack { MobileCapture(workspace: workspace) } }
        .sheet(isPresented: $annotations) {
          NavigationStack {
            MobileBatchAnnotations(workspace: workspace, baselines: annotationBaselines) {
              annotations = false
            }
          }
        }
        .background(
          MobileKeyboardCommands(
            enabled: !blocked,
            singleKeys: workspace.preferences["singleKeyShortcuts"]?.bool ?? true, action: shortcut)
        )
        .onAppear { reminders.onOpen = open }
        .onDisappear { reminders.onOpen = nil }
        .onChange(of: tab) { _, tab in
          if tab != "search" { search.focused = false }
          chrome.sync(0)
        }
        .onChange(of: blocked) { _, value in
          chrome.paused = value
          if value { refresh.cancel() }
        }
        .onChange(of: selected) { _, _ in chrome.show() }
        .onChange(of: workspace.cards.map(\.id)) { _, ids in
          selected.formIntersection(ids)
          aiContext.removeAll { !ids.contains($0) }
        }
        .onChange(of: workspace.error) { _, error in
          if error != nil && workspace.unresolvedWrite { errorDetails = true }
        }
        .onChange(of: scenePhase) { _, phase in
          if phase != .active {
            refresh.cancel()
            chrome.paused = true
          } else {
            chrome.paused = blocked
            chrome.show()
          }
        }
        .onReceive(
          NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)
        ) { _ in
          keyboardVisible = true
        }
        .onReceive(
          NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)
        ) { _ in
          keyboardVisible = false
          chrome.show()
        }
        .task(id: workspace.revision) { updateReminderHint() }
        .task {
          while !Task.isCancelled {
            do { try await Task.sleep(for: .seconds(60)) } catch { return }
            if scenePhase == .active { updateReminderHint() }
          }
        }
      }
    }

    private var pages: some View {
      ZStack(alignment: .top) {
        VStack(spacing: 0) {
          MobilePageHeader(
            title: "Sill", settings: { settings = true },
            onTitle: {
              topRequest += 1
              chrome.show()
            }, refresh: refresh, error: workspace.error == nil ? nil : { errorDetails.toggle() })
          ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: AppleMetrics.space8) {
              ForEach(scopes, id: \.self) { key in
                MobilePill(title: scopeTitle(key), selected: scope == key) {
                  MobileMotion.instantly { scope = key }
                  chrome.show()
                }
              }
            }.padding(.horizontal, AppleMetrics.space16)
          }.frame(height: AppleMetrics.hitTarget)
          MobileFeed(
            workspace: workspace, state: feed, chrome: chrome, refresh: refresh,
            scope: $scope, selected: $selected, active: tab == "home", blocked: blocked,
            topRequest: topRequest, open: open, capture: { capture = true }
          )
          .overlay(alignment: .top) {
            if !reminderHint.isEmpty && selected.isEmpty && !blocked {
              reminderPrompt
            }
          }
        }.opacity(tab == "home" ? 1 : 0).allowsHitTesting(tab == "home").accessibilityHidden(
          tab != "home")
        MobileSearch(
          workspace: workspace, state: search, chrome: chrome, selected: $selected,
          active: tab == "search", blocked: blocked, settings: { settings = true }, open: open
        )
        .opacity(tab == "search" ? 1 : 0).allowsHitTesting(tab == "search").accessibilityHidden(
          tab != "search")
        VStack(spacing: 0) {
          MobilePageHeader(title: Copy.text("web.ai.title"), assistant: true)
          MobileAssistant(workspace: workspace, context: $aiContext, draft: $aiDraft, open: open)
        }.opacity(tab == "ai" ? 1 : 0).allowsHitTesting(tab == "ai").accessibilityHidden(
          tab != "ai")
      }
    }

    private var rail: some View {
      Group {
        if selected.isEmpty {
          MobileNavigation(tab: $tab, filtered: search.hasTokens)
        } else {
          MobileSelectionBar(
            workspace: workspace, selected: $selected,
            annotations: {
              annotationBaselines = workspace.cards.filter { selected.contains($0.id) }
              annotations = true
            },
            discuss: {
              for card in workspace.cards
              where selected.contains(card.id) && !aiContext.contains(card.id) {
                aiContext.append(card.id)
              }
              selected = []
              tab = "ai"
              chrome.show()
            })
        }
      }
      .padding(.bottom, AppleMetrics.space16)
      .offset(y: railHidden ? AppleMetrics.motionRailTravel : 0)
      .opacity(railHidden ? 0 : 1)
      .allowsHitTesting(!railHidden && !blocked)
      .accessibilityHidden(railHidden || blocked)
      .animation(railHidden ? MobileMotion.tuck : MobileMotion.show, value: railHidden)
      .animation(MobileMotion.fast, value: selected.isEmpty)
    }

    @ViewBuilder private var errorPopover: some View {
      if errorDetails {
        ZStack(alignment: .topTrailing) {
          Color.clear.contentShape(Rectangle()).onTapGesture { errorDetails = false }
          VStack(alignment: .trailing, spacing: 0) {
            MobileIconButton("x", label: Copy.text("apple.close")) { errorDetails = false }
            MobileError(workspace: workspace)
          }
          .frame(maxWidth: AppleMetrics.panelNarrowWidth)
          .background(
            AppleColors.card, in: RoundedRectangle(cornerRadius: AppleMetrics.panelRadius)
          )
          .mobileShadow(.floating)
          .padding(AppleMetrics.space16)
        }
      }
    }

    private var reminderPrompt: some View {
      Button {
        let cards = reminderHint
        Task {
          if await workspace.acknowledgeReminders(cards) {
            reminderHint = []
            scope = "all"
            feed.rebuild(
              scope: scope, cards: workspace.filtered(scope: scope), catalog: workspace.cards,
              stack: workspace.preferences["stack"]?.bool ?? true)
            topRequest += 1
          }
        }
      } label: {
        HStack(spacing: AppleMetrics.space8) {
          MobileIcon("bell", size: AppleMetrics.space16)
          Text(reminderHint.first?.title ?? "").lineLimit(1)
        }
        .font(.system(size: AppleMetrics.font13, weight: .medium))
        .padding(.horizontal, AppleMetrics.space16).frame(height: AppleMetrics.newCountHeight)
        .mobileGlass(Capsule())
      }
      .buttonStyle(MobilePressStyle()).padding(.vertical, AppleMetrics.space4)
      .disabled(workspace.busy || workspace.unresolvedWrite)
      .transition(.opacity)
    }
    private func updateReminderHint() {
      withAnimation(MobileMotion.fast) { reminderHint = workspace.dueReminders() }
    }
    private func scopeTitle(_ key: String) -> String {
      Copy.text(key == "tasks" ? "web.home.todo" : "apple." + key)
    }
    private func open(_ id: String) {
      search.focused = false
      refresh.cancel()
      openedCardID = id
    }
    private func shortcut(_ key: String) {
      switch key {
      case "search":
        tab = "search"
        search.focused = true
        chrome.show()
      case "capture": capture = true
      case "refresh": if tab == "home" { refresh.retry += 1 }
      case "top":
        tab = "home"
        topRequest += 1
        chrome.show()
      case "escape": if !selected.isEmpty { selected = [] }
      default: break
      }
    }
  }

  private struct MobileLaunch: View {
    @State private var visible = false
    var body: some View {
      VStack(spacing: AppleMetrics.space12) {
        Color.clear.frame(height: AppleMetrics.railRow + AppleMetrics.hitTarget)
        if visible {
          ForEach(0..<3) { _ in
            RoundedRectangle(cornerRadius: AppleMetrics.mobileCardRadius)
              .fill(AppleColors.card).frame(height: AppleMetrics.cardMinHeight)
          }.transition(.opacity)
        }
        Spacer(minLength: 0)
      }
      .padding(.horizontal, AppleMetrics.space16).background(AppleColors.canvas)
      .accessibilityHidden(true).allowsHitTesting(false)
      .task {
        do { try await Task.sleep(for: .seconds(AppleMetrics.loadingDelay)) } catch { return }
        withAnimation(MobileMotion.fast) { visible = true }
      }
    }
  }
#endif

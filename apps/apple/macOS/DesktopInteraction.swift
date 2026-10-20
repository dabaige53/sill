import AppKit
import SillKit
import SwiftUI

extension Desktop {
  func presentDetail(_ id: String?) {
    let wasClosed = detail.cardID == nil
    if wasClosed && id != nil { detailFocus = focusedCard }
    let generation: Int
    if detail.cardID != nil && id != nil {
      generation = withAnimation(NativeMotion.ease(AppleMetrics.motionDetailOpen)) {
        detail.prepare(id)
      }
    } else {
      generation = detail.prepare(id)
    }
    let animation: Animation? =
      model.readerImmediate
      ? nil
      : NativeMotion.ease(
        id == nil ? AppleMetrics.motionDetailClose : AppleMetrics.motionDetailOpen)
    if id != nil {
      Task { @MainActor in
        await Task.yield()
        guard detail.generation == generation else { return }
        withAnimation(animation) { detail.visible = true }
      }
    } else {
      withAnimation(animation, completionCriteria: .removed) {
        detail.visible = false
      } completion: {
        detail.finishClose(generation)
        if detail.cardID == nil { focusedCard = detailFocus }
      }
    }
  }
  func dismissTop(immediateDetail: Bool = false) {
    if scopePresented {
      scopeImmediate = true
      scopePresented = false
    } else if model.cardMenuVisible {
      model.closeCardMenu(immediate: true)
    } else if tagEditor {
      tagEditor = false
    } else if model.selected != nil {
      model.dismissReader()
    } else if archivePresented {
      archivePresented = false
    } else if model.capturePresented {
      model.capturePresented = false
    } else if model.settingsPresented {
      model.settingsPresented = false
    } else if !model.selection.isEmpty {
      model.selection.removeAll()
    } else if !model.query.isEmpty {
      model.query = ""
    } else if model.feedScope != .all {
      model.feedScope = .all
    } else {
      searchFocused = false
      aiFocused = false
    }
  }
  func selectDetailFromKeyboard(_ id: String?) {
    guard model.selected != id else { return }
    model.selected = id
  }
  func requestHomeTop(immediate: Bool = false) {
    homeTopImmediate = immediate
    homeTopRequest += 1
  }
  func observation(_ page: String) -> some View {
    Color.clear.frame(height: 0).id(page + "-top")
      .background(
        ScrollObservation(
          initialOffset: model.scrollOffsets[page] ?? 0,
          enabled: detail.cardID == nil && !scopeMounted && model.cardMenuID == nil,
          restoreRequest: restoreRequest, requestedOffset: restoreOffset,
          edgeGesture: { handleFeedEdge($0) }
        ) { offset, bottom, user in
          model.scrollOffsets[page] = offset
          guard model.page == page else { return }
          if page == "home", bottom, pageLimit < chrome.feedEntryCount { pageLimit += 40 }
          guard user else {
            chrome.lastOffset = offset
            return
          }
          guard !searchFocused, !aiFocused, !model.cardMenuVisible, !scopePresented,
            detail.cardID == nil
          else {
            showRail()
            return
          }
          guard page == "home" else {
            showRail()
            return
          }
          let delta = offset - chrome.lastOffset
          chrome.lastOffset = offset
          chrome.revealTask?.cancel()
          if offset <= AppleMetrics.space24 || bottom {
            showRail()
            return
          }
          if delta > 0 {
            chrome.downward += delta
            chrome.upward = 0
            if chrome.downward >= AppleMetrics.chromeHideTravel && !railHidden { railHidden = true }
          } else if delta < 0 {
            chrome.upward -= delta
            chrome.downward = 0
            if chrome.upward >= AppleMetrics.chromeShowTravel { showRail() }
          }
          if railHidden {
            chrome.revealTask = Task {
              try? await Task.sleep(for: .seconds(AppleMetrics.chromeRest))
              if !Task.isCancelled { showRail() }
            }
          }
        })
  }
  func handleFeedEdge(_ sample: EdgeGestureSample) -> Bool {
    guard detail.cardID == nil, !model.loading, !model.cardMenuVisible, !scopePresented else {
      return false
    }
    if sample.phase == .changed {
      if sample.edge == "top" {
        refreshPull = min(sample.distance, AppleMetrics.gestureRefreshDistance)
      } else {
        withAnimation(NativeMotion.sheet(AppleMetrics.motionSheet)) {
          feedEdge =
            -AppleMetrics.gestureEdgeLimit * sample.distance
            / (sample.distance + AppleMetrics.gestureEdgeLimit)
        }
      }
    } else if sample.phase == .released && sample.edge == "top"
      && sample.distance >= AppleMetrics.gestureRefreshDistance
    {
      model.refresh()
      refreshHold?.cancel()
      refreshHold = Task {
        do { try await Task.sleep(for: .seconds(AppleMetrics.gestureRefreshRelease)) } catch {
          return
        }
        withAnimation(NativeMotion.sheet(AppleMetrics.motionSheet)) { refreshPull = 0 }
      }
      return true
    } else {
      withAnimation(NativeMotion.spring()) {
        refreshPull = 0
        feedEdge = 0
      }
    }
    return false
  }
  func showRail() {
    if railHidden { railHidden = false }
    chrome.downward = 0
    chrome.upward = 0
    chrome.revealTask?.cancel()
  }
  var toastPaused: Bool {
    windowActivity == .inactive || toastHovered || toastFocused || undoFocused
      || detail.cardID != nil || model.capturePresented || tagEditor || archivePresented
  }
  func showToast(_ text: String, undo: Bool = false) {
    toastTask?.cancel()
    toastText = text
    if !undo { undoPatches = [:] }
    toastLifetime = ToastLifetime(
      duration: .seconds(undo ? AppleMetrics.toastUndoDuration : AppleMetrics.toastDuration))
    updateToastTimer()
  }
  func dismissToast() {
    toastTask?.cancel()
    toastTask = nil
    toastText = ""
    undoPatches = [:]
    toastLifetime = ToastLifetime(duration: .zero)
  }
  func updateToastTimer() {
    toastTask?.cancel()
    toastTask = nil
    toastLifetime.pause(at: .now)
    guard !toastText.isEmpty, !toastPaused else { return }
    toastLifetime.resume(at: .now)
    let remaining = toastLifetime.remaining
    toastTask = Task {
      do { try await Task.sleep(for: remaining) } catch { return }
      guard !Task.isCancelled else { return }
      dismissToast()
    }
  }
  func handleKey(_ event: NSEvent, _ typing: Bool) -> Bool {
    let key = event.charactersIgnoringModifiers?.lowercased() ?? ""
    let command = event.modifierFlags.contains(.command)
    if event.keyCode == 48 {
      model.readerToolsFocusRequest += 1
      showRail()
      return false
    }
    if command, let number = Int(key), (1...5).contains(number), model.selected == nil {
      scopeImmediate = true
      scopePresented = false
      model.feedScope = FeedScope.tabs[number - 1]
      showRail()
      return true
    }
    if scopePresented || model.cardMenuVisible { return false }
    if searchFocused && event.keyCode == 36 {
      selectDetailFromKeyboard(model.visible.first?.id)
      return true
    }
    guard !typing else { return false }
    if command && key == "v" && model.page == "home" && model.selected == nil
      && !model.settingsPresented && !model.capturePresented,
      let text = NSPasteboard.general.string(forType: .string),
      !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    {
      model.capture(text)
      return true
    }
    if command && key == "a" && !model.settingsPresented && !model.capturePresented
      && model.selected == nil && model.page != "ai"
    {
      model.selection = Set((model.searchPresented ? model.visible : homeCards).map(\.id))
      return true
    }
    if !command && !event.modifierFlags.contains(.option) && !model.settingsPresented
      && !model.capturePresented && model.selected == nil && model.page == "home"
      && model.preferences["singleKeyShortcuts"]?.bool != false
    {
      switch key {
      case "n":
        model.capturePresented = true
        return true
      case "r":
        model.refresh()
        return true
      case "t":
        requestHomeTop(immediate: true)
        return true
      default: break
      }
    }
    if event.keyCode == 36 || event.keyCode == 49, let focusedCard, model.selected == nil {
      selectDetailFromKeyboard(focusedCard)
      return true
    }
    return false
  }
  func feedMargin(_ width: CGFloat) -> CGFloat {
    width <= 650
      ? AppleMetrics.space16 : width <= 1000 ? AppleMetrics.space24 : AppleMetrics.space40
  }
  func grid(_ width: CGFloat) -> (
    count: Int, gap: CGFloat, maximum: CGFloat, ideal: CGFloat
  ) {
    let density = model.preferences["density"]?.string ?? "standard"
    let minimum =
      density == "compact"
      ? AppleMetrics.compactMinWidth
      : density == "roomy" ? AppleMetrics.roomyMinWidth : AppleMetrics.cardMinWidth
    let ideal =
      density == "compact"
      ? AppleMetrics.compactIdealWidth
      : density == "roomy" ? AppleMetrics.roomyIdealWidth : AppleMetrics.cardIdealWidth
    let maximum =
      density == "compact"
      ? AppleMetrics.compactMaxWidth
      : density == "roomy" ? AppleMetrics.roomyMaxWidth : AppleMetrics.cardMaxWidth
    let gap =
      width < minimum * 2 + AppleMetrics.space24
      ? AppleMetrics.space16 : width < 1000 ? AppleMetrics.space20 : AppleMetrics.space24
    let fits = max(1, Int((width + gap) / (minimum + gap)))
    return (
      max(1, min(5, fits, max(min(2, fits), Int((width + gap) / (ideal + gap))))),
      gap, maximum, ideal
    )
  }
}

import AppKit
import SillKit
import SwiftUI

extension Desktop {
  func dismissTop() {
    if tagEditor {
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
    } else {
      model.page = "home"
    }
  }
  func observation(_ page: String) -> some View {
    Color.clear.frame(height: 0).id(page + "-top")
      .background(
        ScrollObservation(initialOffset: model.scrollOffsets[page] ?? 0) { offset, bottom, user in
          model.scrollOffsets[page] = offset
          guard model.page == page, user else { return }
          let delta = offset - lastOffset
          lastOffset = offset
          revealTask?.cancel()
          if offset <= AppleMetrics.space24 || bottom {
            showRail()
            return
          }
          if delta > 0 {
            downward += delta
            upward = 0
            if downward > AppleMetrics.chromeHideTravel { railHidden = true }
          } else if delta < 0 {
            upward -= delta
            downward = 0
            if upward > AppleMetrics.chromeShowTravel { showRail() }
          }
          if railHidden {
            revealTask = Task {
              try? await Task.sleep(for: .seconds(AppleMetrics.chromeRest))
              if !Task.isCancelled { showRail() }
            }
          }
        })
  }
  func showRail() {
    railHidden = false
    downward = 0
    upward = 0
    revealTask?.cancel()
  }
  var toastPaused: Bool {
    windowActivity == .inactive || toastHovered || toastFocused || undoFocused
  }
  func showToast(_ text: String, undo: Bool = false) {
    toastTask?.cancel()
    toastText = text
    if !undo { undoPatches = [:] }
    toastLifetime = ToastLifetime(duration: .seconds(undo ? 5.5 : 3.2))
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
    let command = event.modifierFlags.contains(.command) || event.modifierFlags.contains(.control)
    if event.keyCode == 48 {
      showRail()
      return false
    }
    if command && key == "k" {
      model.presentNavigation("search")
      model.searchFocusRequest += 1
      return true
    }
    if event.keyCode == 53 {
      dismissTop()
      return true
    }
    if command && event.keyCode == 36 && model.capturePresented {
      if !captureText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        model.capture(captureText)
      }
      return true
    }
    if model.searchPresented && searchFocused && event.keyCode == 36 {
      model.selected = model.visible.first?.id
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
        homeTopRequest += 1
        return true
      default: break
      }
    }
    if event.keyCode == 36 || event.keyCode == 49, let focusedCard, model.selected == nil {
      model.selected = focusedCard
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

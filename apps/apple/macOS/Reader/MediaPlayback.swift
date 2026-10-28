import SillKit
import SwiftUI
import WebKit

/// Retained by the reading layer, so preview/fullscreen changes keep the official player alive.
@MainActor @Observable final class MediaPlayback {
  var position: Double = 0
  var duration: Double = 0
  var playing = false
  var failed = false
  var videoReady = false
  var retryVideo: (() -> Void)?
  var seekVideo: ((Double) -> Void)?
  @ObservationIgnored var videoView: WKWebView?
  @ObservationIgnored var videoCoordinator: OfficialVideoPlayer.Coordinator?

  func seek(_ value: Double) {
    guard value.isFinite else { return }
    position = max(0, duration > 0 ? min(value, duration) : value)
    seekVideo?(position)
  }

  func stop() {
    videoCoordinator?.timeout?.cancel()
    videoCoordinator?.save(position, false)
    videoView?.evaluateJavaScript("player?.pauseVideo()", completionHandler: nil)
    videoView?.configuration.userContentController.removeScriptMessageHandler(forName: "playback")
    videoView?.navigationDelegate = nil
    videoView?.loadHTMLString("", baseURL: nil)
    videoView = nil
    videoCoordinator = nil
    playing = false
    videoReady = false
    retryVideo = nil
    seekVideo = nil
  }
}

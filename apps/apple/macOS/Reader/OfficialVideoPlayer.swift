import SwiftUI
import WebKit

/// The sole WebView exception: YouTube's official player, never a general browser.
struct OfficialVideoPlayer: NSViewRepresentable {
  let videoID: String
  let initialPosition: Double
  let playback: MediaPlayback
  let save: (Double, Bool) -> Void

  static func clientOrigin(bundleIdentifier: String? = Bundle.main.bundleIdentifier) -> URL {
    URL(string: "https://" + (bundleIdentifier ?? "app.sill.native").lowercased())!
  }

  static func videoID(_ url: URL?) -> String? {
    guard let url, url.scheme == "https", let host = url.host else { return nil }
    let id: String?
    if host == "youtu.be" {
      id = url.pathComponents.dropFirst().first
    } else if ["youtube.com", "www.youtube.com", "m.youtube.com", "www.youtube-nocookie.com"]
      .contains(host)
    {
      id =
        URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first {
          $0.name == "v"
        }?.value
        ?? (["embed", "shorts"].contains(url.pathComponents.dropFirst().first ?? "")
          ? url.pathComponents.last : nil)
    } else {
      id = nil
    }
    guard let id, id.range(of: "^[A-Za-z0-9_-]{11}$", options: .regularExpression) != nil else {
      return nil
    }
    return id
  }
  func makeCoordinator() -> Coordinator {
    if let coordinator = playback.videoCoordinator { return coordinator }
    let coordinator = Coordinator(playback: playback, save: save)
    playback.videoCoordinator = coordinator
    return coordinator
  }
  func makeNSView(context: Context) -> WKWebView {
    if let view = playback.videoView { return view }
    let config = WKWebViewConfiguration()
    config.websiteDataStore = .nonPersistent()
    config.userContentController.add(context.coordinator, name: "playback")
    let view = WKWebView(frame: .zero, configuration: config)
    playback.videoView = view
    context.coordinator.view = view
    view.navigationDelegate = context.coordinator
    playback.seekVideo = { [weak view] seconds in
      guard seconds.isFinite else { return }
      view?.evaluateJavaScript("seek(\(max(0, seconds)))", completionHandler: nil)
    }
    playback.position = initialPosition
    playback.failed = false
    playback.playing = false
    playback.retryVideo = { [weak view, weak playback, weak coordinator = context.coordinator] in
      guard let view, let playback, let coordinator else { return }
      playback.failed = false
      playback.videoReady = false
      playback.playing = false
      coordinator.armTimeout()
      let start = Int(max(0, playback.position))
      let origin = Self.clientOrigin()
      view.loadHTMLString(
        """
        <!doctype html><html><head><meta name="referrer" content="strict-origin-when-cross-origin"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#player{margin:0;width:100%;height:100%;overflow:hidden;background:black}</style></head><body><div id="player"></div><script>
        let player,previous=\(start),advanced=false,started=false;
        function sample(ended=false){if(!player||!player.getCurrentTime)return;const position=player.getCurrentTime(),playing=player.getPlayerState()===1,delta=position-previous;if(!started&&!playing&&position===0)return;if(playing)started=true;if(delta<0||delta>2)advanced=false;else if(playing&&delta>0.01)advanced=true;previous=position;window.webkit.messageHandlers.playback.postMessage({position,duration:player.getDuration(),playing,ended:ended&&advanced});}
        function seek(seconds){started=true;advanced=false;previous=seconds;player?.seekTo(seconds,true);}
        function onYouTubeIframeAPIReady(){player=new YT.Player('player',{host:'https://www.youtube-nocookie.com',videoId:'\(videoID)',playerVars:{origin:'\(origin.absoluteString)',playsinline:1,start:\(start)},events:{onReady:()=>{window.webkit.messageHandlers.playback.postMessage({ready:true});setInterval(()=>sample(),500)},onStateChange:e=>{if([2,3,5].includes(e.data))advanced=false;sample(e.data===0)},onError:()=>window.webkit.messageHandlers.playback.postMessage({error:true})}});}
        </script><script src="https://www.youtube.com/iframe_api"></script></body></html>
        """, baseURL: origin)
    }
    playback.retryVideo?()
    return view
  }
  func updateNSView(_ nsView: WKWebView, context: Context) {}
  static func dismantleNSView(_ view: WKWebView, coordinator: Coordinator) {
    // The layer owns disposal; SwiftUI can detach this view during a layout change.
  }
  @MainActor final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    unowned let playback: MediaPlayback
    let save: (Double, Bool) -> Void
    weak var view: WKWebView?
    var timeout: Task<Void, Never>?
    func armTimeout() {
      timeout?.cancel()
      timeout = Task { [weak self] in
        do { try await Task.sleep(for: .seconds(20)) } catch { return }
        self?.fail()
      }
    }
    func fail() {
      timeout?.cancel()
      playback.failed = true
      playback.playing = false
      playback.videoReady = false
      view?.evaluateJavaScript("player?.pauseVideo()", completionHandler: nil)
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
      fail()
    }
    func webView(
      _ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
      withError error: Error
    ) { fail() }
    init(playback: MediaPlayback, save: @escaping (Double, Bool) -> Void) {
      self.playback = playback
      self.save = save
    }
    func userContentController(
      _ userContentController: WKUserContentController, didReceive message: WKScriptMessage
    ) {
      guard message.frameInfo.isMainFrame, let value = message.body as? [String: Any] else {
        return
      }
      if value["error"] as? Bool == true {
        fail()
        return
      }
      if value["ready"] as? Bool == true {
        guard !playback.failed else { return }
        timeout?.cancel()
        playback.videoReady = true
        return
      }
      guard !playback.failed, let position = value["position"] as? Double, position.isFinite else {
        return
      }
      playback.position = position
      playback.duration = value["duration"] as? Double ?? 0
      playback.playing = value["playing"] as? Bool ?? false
      if value["ended"] as? Bool == true { save(position, true) }
    }
    func webView(
      _ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction
    ) async -> WKNavigationActionPolicy {
      navigationAction.navigationType == .linkActivated ? .cancel : .allow
    }
  }
}

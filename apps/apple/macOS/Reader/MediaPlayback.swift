import AVFoundation
import SillKit
import SwiftUI

/// One detail owns one player. Its observers and playback stop when that detail closes.
@MainActor @Observable final class MediaPlayback {
  var position: Double = 0
  var duration: Double = 0
  var playing = false
  var failed = false
  var rate: Float = 1
  var seekVideo: ((Double) -> Void)?
  private var player: AVPlayer?
  private var pendingURL: URL?
  private var tick: Any?
  private var ended: NSObjectProtocol?
  private var advanced = false
  private var previous: Double = 0
  private var restored = false
  private var save: ((Double, Bool) -> Void)?

  func start(url: URL, position: Double, save: @escaping (Double, Bool) -> Void) {
    guard player == nil else { return }
    self.save = save
    self.position = position
    previous = position
    pendingURL = url
    restored = false
    advanced = false
    let player = AVPlayer()
    self.player = player
    tick = player.addPeriodicTimeObserver(
      forInterval: CMTime(seconds: 0.5, preferredTimescale: 600), queue: .main
    ) { [weak self] time in
      Task { @MainActor [weak self] in
        guard let self, let player = self.player else { return }
        self.failed = player.currentItem?.status == .failed
        let total = player.currentItem?.duration.seconds ?? 0
        if total.isFinite, total > 0 {
          self.duration = total
          if !self.restored {
            self.restored = true
            self.seek(self.position)
            return
          }
        }
        guard self.restored else { return }
        let current = time.seconds
        guard current.isFinite else { return }
        if player.rate > 0, current > self.previous, current - self.previous < 2 {
          self.advanced = true
        }
        self.previous = current
        self.position = current
        self.playing = player.rate > 0
      }
    }

  }
  func toggle() {
    guard let player else { return }
    if player.currentItem == nil, let pendingURL {
      player.replaceCurrentItem(with: AVPlayerItem(url: pendingURL))
      ended = NotificationCenter.default.addObserver(
        forName: .AVPlayerItemDidPlayToEndTime, object: player.currentItem, queue: .main
      ) { [weak self] _ in
        Task { @MainActor [weak self] in
          guard let self else { return }
          self.playing = false
          if let current = self.player?.currentTime().seconds, current.isFinite {
            self.position = current
          }
          self.save?(self.position, self.advanced)
        }
      }
    }
    if playing {
      player.pause()
      playing = false
      save?(position, false)
    } else {
      player.playImmediately(atRate: rate)
      playing = true
    }
  }
  func seek(_ value: Double) {
    advanced = false
    position = max(0, duration > 0 ? min(value, duration) : value)
    previous = position
    if let seekVideo {
      seekVideo(position)
    } else {
      player?.seek(
        to: CMTime(seconds: position, preferredTimescale: 600), toleranceBefore: .zero,
        toleranceAfter: .zero)
    }
  }
  func changeRate() {
    rate = rate >= 2 ? 0.75 : rate == 0.75 ? 1 : rate + 0.25
    if playing { player?.rate = rate }
  }
  func stop() {
    player?.pause()
    if restored { save?(position, false) }
    if let tick { player?.removeTimeObserver(tick) }
    if let ended { NotificationCenter.default.removeObserver(ended) }
    pendingURL = nil
    player = nil
    tick = nil
    ended = nil
    save = nil
    playing = false
  }
}

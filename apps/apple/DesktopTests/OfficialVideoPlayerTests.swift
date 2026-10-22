import Foundation
import Testing

@testable import Sill

@Suite @MainActor struct OfficialVideoPlayerTests {
  @Test func officialURLsOnly() {
    #expect(
      OfficialVideoPlayer.videoID(URL(string: "https://youtu.be/abcdefghijk")) == "abcdefghijk")
    #expect(
      OfficialVideoPlayer.videoID(URL(string: "https://www.youtube.com/watch?v=abcdefghijk"))
        == "abcdefghijk")
    #expect(
      OfficialVideoPlayer.videoID(URL(string: "https://youtube.com.evil.test/watch?v=abcdefghijk"))
        == nil)
    #expect(OfficialVideoPlayer.videoID(URL(string: "https://www.youtube.com/")) == nil)
  }
  @Test func originUsesInstalledAppIdentity() {
    #expect(
      OfficialVideoPlayer.clientOrigin(bundleIdentifier: "app.sill.native").absoluteString
        == "https://app.sill.native")
    #expect(
      OfficialVideoPlayer.clientOrigin(bundleIdentifier: nil).absoluteString
        == "https://app.sill.native")
  }
}

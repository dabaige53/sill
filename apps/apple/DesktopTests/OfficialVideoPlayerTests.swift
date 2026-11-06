import Foundation
import Testing

@testable import Sill

@Suite @MainActor struct OfficialVideoPlayerTests {
  // @wu-test type=boundary | scope=Official video URL validation | protects=Reject nonofficial hosts and invalid video URLs
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
  // @wu-test type=boundary | scope=Official video player origin | protects=Use the installed app identity as the player origin
  @Test func originUsesInstalledAppIdentity() {
    #expect(
      OfficialVideoPlayer.clientOrigin(bundleIdentifier: "app.sill.native").absoluteString
        == "https://app.sill.native")
    #expect(
      OfficialVideoPlayer.clientOrigin(bundleIdentifier: nil).absoluteString
        == "https://app.sill.native")
  }
}

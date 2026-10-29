import Foundation
import Observation
import Testing

@testable import Sill
@testable import SillKit

struct LaunchOptionTests {
  #if !DEBUG
    @Test func releaseLaunchUsesCloudOnly() {
      #expect(LaunchOptions.current.dataDirectory == nil)
    }
  #endif

  @Test func acceptsOnlyAbsoluteDirectories() {
    #expect(
      LaunchOptions(arguments: ["Sill", "--data-directory", "/tmp/sill"]).dataDirectory?.path
        == "/tmp/sill")
    #expect(
      LaunchOptions(arguments: ["Sill", "--data-directory", "relative"]).dataDirectory == nil)
    #expect(LaunchOptions(arguments: ["Sill"]).dataDirectory == nil)
  }
}

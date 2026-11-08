import Foundation
import Observation
import Testing

@testable import Sill
@testable import SillKit

struct LaunchOptionTests {
  #if !DEBUG
    // @wu-test type=boundary | scope=Release launch options | protects=Prevent release launch from selecting a local workspace
    @Test func releaseLaunchUsesCloudOnly() {
      #expect(LaunchOptions.current.dataDirectory == nil)
    }
  #endif

  // @wu-test type=boundary | scope=Debug launch options | protects=Reject relative local workspace directories
  @Test func acceptsOnlyAbsoluteDirectories() {
    #expect(
      LaunchOptions(arguments: ["Sill", "--data-directory", "/tmp/sill"]).dataDirectory?.path
        == "/tmp/sill")
    #expect(
      LaunchOptions(arguments: ["Sill", "--data-directory", "relative"]).dataDirectory == nil)
    #expect(LaunchOptions(arguments: ["Sill"]).dataDirectory == nil)
  }
}

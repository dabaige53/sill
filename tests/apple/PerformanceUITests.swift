import XCTest

/// Actual native input; isolated synthetic workspace. Never addresses the user's running app.
@MainActor final class PerformanceUITests: XCTestCase {
  struct Config: Decodable {
    let app: String
    let workspace: String
    let output: String
    let iterations: Int
    let ready: String
  }
  private var app: XCUIApplication!
  private var config: Config!
  private var readyFile = ""

  override func setUp() async throws {
    try await MainActor.run {
      continueAfterFailure = false
      let path = try XCTUnwrap(ProcessInfo.processInfo.environment["SILL_PERF_CONFIG"])
      config = try JSONDecoder().decode(
        Config.self, from: Data(contentsOf: URL(fileURLWithPath: path)))
      app = XCUIApplication(url: URL(fileURLWithPath: config.app))
      app.launchArguments = ["--data-directory", config.workspace]
      app.launchEnvironment["SILL_PERF_OUTPUT"] = config.output
      app.launchEnvironment["SILL_PERF_AUTOMATED"] = "1"
      app.launchEnvironment["SILL_PERF_SCENARIO"] = name
      let token = UUID().uuidString
      app.launchEnvironment["SILL_PERF_TOKEN"] = token
      readyFile = config.ready + "-" + token
      app.launch()
      app.typeKey(XCUIKeyboardKey.escape.rawValue, modifierFlags: [])
      XCTAssertTrue(app.buttons["scope-toggle"].waitForExistence(timeout: 15))
      let deadline = Date().addingTimeInterval(45)
      while !FileManager.default.fileExists(atPath: readyFile), Date() < deadline {
        Thread.sleep(forTimeInterval: 0.1)
      }
      XCTAssertTrue(
        FileManager.default.fileExists(atPath: readyFile),
        "Instruments did not confirm recording; scenario not measured.")
    }
  }
  override func tearDown() async throws {
    await MainActor.run {
      // Normal Quit flushes the local trace; terminate only if Quit cannot finish.
      if let app, app.state != .notRunning, app.state != .unknown {
        app.activate()
        app.typeKey("q", modifierFlags: .command)
        if !app.wait(for: .notRunning, timeout: 8) { app.terminate() }
      }
    }
  }
  private func measureScenario(_ body: () -> Void) {
    let options = XCTMeasureOptions()
    options.iterationCount = config.iterations
    var metrics: [any XCTMetric] = [
      XCTClockMetric(), XCTCPUMetric(application: app), XCTMemoryMetric(application: app),
      XCTStorageMetric(application: app),
    ]
    if #available(macOS 26.0, *) { metrics.append(XCTHitchMetric(application: app)) }
    measure(metrics: metrics, options: options, block: body)
  }
  func testMenuSelection() {
    measureScenario {
      for scope in ["unread", "todo", "all"] {
        let toggle = app.buttons["scope-toggle"]
        toggle.click()
        let row = app.buttons["scope-\(scope)"]
        XCTAssertTrue(row.waitForExistence(timeout: 3))
        XCTAssertTrue(row.isHittable)
        row.click()
        XCTAssertTrue(row.waitForNonExistence(timeout: 3))
      }
    }
  }
  func testSearchAndSettings() {
    measureScenario {
      let search = app.textFields["home-search"]
      XCTAssertTrue(search.exists)
      search.click()
      search.typeText("Synthetic")
      search.typeKey("a", modifierFlags: .command)
      search.typeKey(XCUIKeyboardKey.delete.rawValue, modifierFlags: [])
      app.buttons["settings-open"].click()
      for group in ["look", "keys", "desk"] {
        let row = app.buttons["settings-group-\(group)"]
        XCTAssertTrue(row.waitForExistence(timeout: 3))
        row.click()
      }
      app.typeKey(XCUIKeyboardKey.escape.rawValue, modifierFlags: [])
      XCTAssertTrue(app.buttons["settings-group-desk"].waitForNonExistence(timeout: 3))
    }
  }
  func testArticleOpenClose() {
    measureScenario {
      let card = app.descendants(matching: .any)["card-perf-00000"].firstMatch
      XCTAssertTrue(card.waitForExistence(timeout: 5))
      card.click()
      XCTAssertTrue(
        app.descendants(matching: .any)["reader-preview"].firstMatch.waitForExistence(timeout: 5))
      app.typeKey(XCUIKeyboardKey.escape.rawValue, modifierFlags: [])
      XCTAssertTrue(
        app.descendants(matching: .any)["reader-preview"].firstMatch.waitForNonExistence(timeout: 5)
      )
    }
  }
}

import XCTest

@MainActor
final class MobileUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  private func capture(_ app: XCUIApplication, _ name: String) {
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
  }

  private func launch() -> XCUIApplication {
    let app = XCUIApplication()
    app.launchEnvironment["SILL_UI_TESTING"] = "1"
    app.launchArguments = ["-AppleLanguages", "(zh-Hans)", "-AppleLocale", "zh_CN"]
    app.launch()
    XCTAssertTrue(app.otherElements["card-article"].waitForExistence(timeout: 20))
    capture(app, "home")
    return app
  }

  func testPreviewOutlineAndBackgroundReturn() {
    let app = launch()
    app.buttons["阅读测试文章"].firstMatch.tap()
    let outline = app.buttons["目录"]
    XCTAssertTrue(outline.waitForExistence(timeout: 5))
    let hittable = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "hittable == true"), object: outline)
    XCTAssertEqual(XCTWaiter.wait(for: [hittable], timeout: 5), .completed)
    XCTAssertFalse(app.buttons["全屏"].exists)
    XCTAssertFalse(app.buttons["退出全屏"].exists)
    outline.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
    XCTAssertTrue(app.buttons["第二节"].waitForExistence(timeout: 5))
    capture(app, "preview-outline")
    app.buttons["第二节"].tap()
    XCUIDevice.shared.press(.home)
    app.activate()
    XCTAssertTrue(app.buttons["关闭阅读"].firstMatch.waitForExistence(timeout: 10))
    app.buttons["关闭阅读"].firstMatch.tap()
    XCTAssertTrue(app.otherElements["card-article"].waitForExistence(timeout: 5))
    let progress = app.otherElements["card-article"].buttons.matching(
      NSPredicate(format: "label CONTAINS %@", "%")
    ).firstMatch
    XCTAssertTrue(progress.waitForExistence(timeout: 5))
    capture(app, "reading-saved")
  }

  func testSettingsClearRequiresConfirmationAndDeletesCards() {
    let app = launch()
    let settings = app.buttons["settings-Sill"]
    settings.press(forDuration: 0.7)
    XCTAssertFalse(app.buttons["数据与隐私"].exists)
    settings.tap()
    let data = app.buttons["数据与隐私"]
    XCTAssertTrue(data.waitForExistence(timeout: 5))
    data.tap()
    let clear = app.buttons["清空卡片"].firstMatch
    if !clear.isHittable { app.swipeUp() }
    XCTAssertTrue(clear.waitForExistence(timeout: 5))
    capture(app, "settings-data")
    clear.tap()
    XCTAssertTrue(app.buttons["取消"].waitForExistence(timeout: 5))
    app.buttons["取消"].tap()
    clear.tap()
    let confirmation = app.buttons["confirm-clear-cards"]
    XCTAssertTrue(confirmation.waitForExistence(timeout: 5))
    confirmation.tap()
    XCTAssertTrue(confirmation.waitForNonExistence(timeout: 5))
    app.buttons["返回"].firstMatch.tap()
    XCTAssertTrue(app.otherElements["card-article"].waitForNonExistence(timeout: 5))
    XCTAssertFalse(app.staticTexts["测试笔记"].exists)
  }
}

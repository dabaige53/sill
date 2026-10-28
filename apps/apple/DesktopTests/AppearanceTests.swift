import Testing

@testable import Sill
@testable import SillKit

@MainActor struct AppearanceTests {
  @Test func collapsingAnExpandedStackReleasesItsHeightWithoutShrinkingReadCards() {
    let closed = FeedEntry.stack(key: "source", cards: ["a", "b", "c"])
    let opened = FeedEntry.openStack(key: "source", cards: ["a", "b", "c"])
    var cache = MasonryLayout.Cache()
    #expect(closed.id == opened.id, "opening keeps the feed entry identity")
    #expect(cache.height(240, for: closed.measurementID) == 240)
    #expect(cache.height(900, for: opened.measurementID) == 900)
    #expect(cache.height(240, for: closed.measurementID) == 240)
    let card = FeedEntry.card("a")
    #expect(cache.height(300, for: card.measurementID) == 300)
    #expect(cache.height(260, for: card.measurementID) == 300)
  }

  @Test func missingFieldsKeepExistingLayoutAndTypeChangesInvalidateMeasurement() {
    let defaults = Preferences([:])
    #expect(defaults.cardTextSize == .standard)
    #expect(defaults.readerWidth == .full)
    let original = ColumnGeometry(width: 1200, preferences: defaults)
    let larger = Preferences(["cardTextSize": .string("large")])
    let resized = ColumnGeometry(width: 1200, preferences: larger)
    #expect(original != resized)
    #expect(original.columns == resized.columns)
    let padded = Preferences(["cardPadding": .string("roomy")])
    #expect(original != ColumnGeometry(width: 1200, preferences: padded))
  }

  @Test func spacingAndWidthRemainIndependentFromType() {
    let preferences = Preferences([
      "cardSpacing": .string("roomy"), "readerWidth": .string("narrow"),
      "readerTextSize": .string("large"), "textWeight": .string("strong"),
    ])
    let geometry = ColumnGeometry(width: 1200, preferences: preferences)
    #expect(Double(geometry.gap) == AppleMetrics.feedGap * AppleMetrics.layoutSpaceRoomy)
    #expect(
      geometry.columnWidth * Double(geometry.columns) + geometry.gap * Double(geometry.columns - 1)
        <= 1200.001)
    #expect(preferences.cardAppearance.scale == 1)
    #expect(Double(preferences.readerAppearance.scale) == AppleMetrics.layoutTextLarge)
    #expect(Double(preferences.readerWidth.width) == AppleMetrics.layoutReaderNarrow)
    #expect(preferences.readerAppearance.strong)
  }
}

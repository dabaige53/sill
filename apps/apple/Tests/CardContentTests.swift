import Testing

@testable import SillKit

struct CardContentTests {
  @Test func faceSummaryHasATextBoundWithoutChangingStoredText() {
    let text = String(repeating: "结论🙂", count: 60)
    let face = CardRecipes.faceSummary(text)
    #expect(face.unicodeScalars.count == 120)
    #expect(face.hasSuffix("…"))
    #expect(text.unicodeScalars.count == 180)
    let atLimit = String(repeating: "字", count: 120)
    #expect(CardRecipes.faceSummary(atLimit) == atLimit)
  }
}

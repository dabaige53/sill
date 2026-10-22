import Testing

@testable import Sill

struct SourceMarkTests {
  @Test func explicitBrandIdentity() {
    #expect(SourceBrand.matching(name: "Work", kind: "mail") == nil)
    #expect(SourceBrand.matching(name: "Gmail · Work", kind: "mail") != nil)
    #expect(SourceBrand.matching(name: "Channel", kind: "youtube") != nil)
    #expect(SourceBrand.matching(name: "Not GitHub", kind: "web") == nil)
  }
}

import Testing

@testable import Sill

struct SourceMarkTests {
  @Test func explicitBrandIdentity() {
    #expect(SourceBrand.matching(name: "Work", kind: "mail") == nil)
    #expect(SourceBrand.matching(name: "Gmail · Work", kind: "mail") != nil)
    #expect(SourceBrand.matching(name: "Channel", kind: "youtube") != nil)
    #expect(SourceBrand.matching(name: "Not GitHub", kind: "web") == nil)
  }

  @Test func readingTaskAndNoteBrands() {
    for (kind, name) in [
      ("readwise", "Readwise"), ("todoist", "Todoist"), ("dedaobiji", "得到笔记"),
    ] {
      let brand = SourceBrand.matching(name: "Personal", kind: kind)
      #expect(brand != nil)
      #expect(brand?.path.isEmpty == false)
      #expect(SourceBrand.matching(name: name, kind: "web")?.path == brand?.path)
      #expect(
        SourceBrand.matching(name: " \(name.lowercased()) · Personal ", kind: "web")?.path
          == brand?.path)
      #expect(SourceBrand.matching(name: "\(name) Notes", kind: "web") == nil)
    }
    #expect(SourceBrand.matching(name: "Personal", kind: "task") == nil)
    #expect(SourceBrand.matching(name: "Personal", kind: "note") == nil)
  }
}

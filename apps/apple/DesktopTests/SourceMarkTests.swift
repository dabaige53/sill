import Testing

@testable import Sill

struct SourceMarkTests {
  // @wu-test type=behavior | scope=Source brand matching | protects=Show a brand only for a matching source
  @Test func explicitBrandIdentity() {
    #expect(SourceBrand.matching(name: "Work", kind: "mail") == nil)
    #expect(SourceBrand.matching(name: "Gmail · Work", kind: "mail") != nil)
    #expect(SourceBrand.matching(name: "Channel", kind: "youtube") != nil)
    #expect(SourceBrand.matching(name: "Not GitHub", kind: "web") == nil)
  }

  // @wu-test type=behavior | scope=Source brand matching | protects=Match supported source brands without matching unrelated names
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

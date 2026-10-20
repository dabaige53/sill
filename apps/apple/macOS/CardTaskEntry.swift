import SillKit

/// Task IDs are required by the card contract and survive checkbox sorting.
struct CardTaskEntry: Identifiable {
  let value: JSONValue
  var id: String { value["id"]?.string ?? "" }
}

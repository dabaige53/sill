import Foundation
import SillKit

public enum SillMobile {
  public static func localStore(directory: URL) throws -> CardStore {
    try CardStore(directory: directory)
  }
}

import Foundation
import Security

public protocol CloudSessionVault: Sendable {
  func load() throws -> Data?
  func save(_ data: Data) throws
  func clear() throws
}

public struct KeychainCloudSessionVault: CloudSessionVault {
  public init() {}
  private var query: [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "one.sill.cloud-session",
      kSecAttrAccount as String: "https://sill-web-preview.scs1213-temp-email.workers.dev",
    ]
  }
  public func load() throws -> Data? {
    var request = query
    request[kSecReturnData as String] = true
    var value: CFTypeRef?
    let status = SecItemCopyMatching(request as CFDictionary, &value)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess else { throw CloudWorkspaceError.sessionStorage }
    return value as? Data
  }
  public func save(_ data: Data) throws {
    let status = SecItemUpdate(
      query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
    if status == errSecItemNotFound {
      var request = query
      request[kSecValueData as String] = data
      request[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
      guard SecItemAdd(request as CFDictionary, nil) == errSecSuccess else {
        throw CloudWorkspaceError.sessionStorage
      }
    } else if status != errSecSuccess {
      throw CloudWorkspaceError.sessionStorage
    }
  }
  public func clear() throws {
    let status = SecItemDelete(query as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw CloudWorkspaceError.sessionStorage
    }
  }
}

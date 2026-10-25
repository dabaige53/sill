#if os(iOS)
  import SwiftUI
  import UIKit

  struct MobileKeyboardCommands: UIViewRepresentable {
    let enabled: Bool
    let singleKeys: Bool
    let action: (String) -> Void

    func makeUIView(context: Context) -> CommandView { CommandView() }
    func updateUIView(_ view: CommandView, context: Context) {
      view.enabled = enabled
      view.singleKeys = singleKeys
      view.action = action
      // Text inputs keep first responder. This view handles only the idle workspace keyboard.
      DispatchQueue.main.async { [weak view] in
        guard let view, enabled, let window = view.window,
          !window.hasEditingResponder
        else { return }
        view.becomeFirstResponder()
      }
    }

    final class CommandView: UIView {
      var enabled = false
      var singleKeys = true
      var action: (String) -> Void = { _ in }
      override var canBecomeFirstResponder: Bool { enabled }
      override var keyCommands: [UIKeyCommand]? {
        guard enabled else { return [] }
        let search = UIKeyCommand(input: "k", modifierFlags: .command, action: #selector(search))
        var commands = [
          search,
          UIKeyCommand(
            input: UIKeyCommand.inputEscape, modifierFlags: [], action: #selector(cancel)),
        ]
        if singleKeys {
          commands += [
            UIKeyCommand(input: "n", modifierFlags: [], action: #selector(capture)),
            UIKeyCommand(input: "r", modifierFlags: [], action: #selector(refresh)),
            UIKeyCommand(input: "t", modifierFlags: [], action: #selector(top)),
          ]
        }
        return commands
      }
      @objc private func search() { action("search") }
      @objc private func capture() { action("capture") }
      @objc private func refresh() { action("refresh") }
      @objc private func top() { action("top") }
      @objc private func cancel() { action("escape") }
    }
  }

  extension UIView {
    fileprivate var hasEditingResponder: Bool {
      (isFirstResponder && (self is UITextField || self is UITextView))
        || subviews.contains(where: \.hasEditingResponder)
    }
  }
#endif

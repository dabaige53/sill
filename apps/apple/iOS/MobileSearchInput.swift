#if os(iOS)
  import SillKit
  import SwiftUI
  import UIKit

  /// Keep IME composition private to UIKit; committed text alone changes the search results.
  struct MobileSearchInput: UIViewRepresentable {
    @Binding var text: String
    @Binding var focused: Bool
    let placeholder: String
    let backspace: () -> Void
    let move: (Int) -> Void
    let submit: () -> Bool
    let escape: () -> Void

    func makeUIView(context: Context) -> Field {
      let field = Field()
      field.delegate = context.coordinator
      field.addTarget(
        context.coordinator, action: #selector(Coordinator.changed), for: .editingChanged)
      field.font = .systemFont(ofSize: AppleMetrics.font17)
      field.adjustsFontForContentSizeCategory = true
      field.returnKeyType = .search
      field.autocorrectionType = .no
      field.autocapitalizationType = .none
      field.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
      field.setContentHuggingPriority(.defaultLow, for: .horizontal)
      field.accessibilityLabel = Copy.text("web.search.inputLabel")
      configure(field)
      return field
    }
    func updateUIView(_ field: Field, context: Context) {
      context.coordinator.parent = self
      configure(field)
      if field.markedTextRange == nil && field.text != text { field.text = text }
      if focused && !field.isFirstResponder && field.window != nil { field.becomeFirstResponder() }
      if !focused && field.isFirstResponder { field.resignFirstResponder() }
    }
    private func configure(_ field: Field) {
      field.placeholder = placeholder
      field.emptyBackspace = backspace
      field.move = move
      field.escape = escape
    }
    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UITextFieldDelegate {
      var parent: MobileSearchInput
      init(_ parent: MobileSearchInput) { self.parent = parent }
      @objc func changed(_ field: UITextField) {
        if field.markedTextRange == nil { parent.text = field.text ?? "" }
      }
      func textFieldDidBeginEditing(_ field: UITextField) { parent.focused = true }
      func textFieldDidEndEditing(_ field: UITextField) { parent.focused = false }
      func textFieldShouldReturn(_ field: UITextField) -> Bool {
        guard field.markedTextRange == nil else { return false }
        changed(field)
        if !parent.submit() { field.resignFirstResponder() }
        return false
      }
    }

    final class Field: UITextField {
      var emptyBackspace: () -> Void = {}
      var move: (Int) -> Void = { _ in }
      var escape: () -> Void = {}
      override func deleteBackward() {
        if (text ?? "").isEmpty && markedTextRange == nil {
          emptyBackspace()
        } else {
          super.deleteBackward()
        }
      }
      override var keyCommands: [UIKeyCommand]? {
        [
          UIKeyCommand(input: UIKeyCommand.inputUpArrow, modifierFlags: [], action: #selector(up)),
          UIKeyCommand(
            input: UIKeyCommand.inputDownArrow, modifierFlags: [], action: #selector(down)),
          UIKeyCommand(
            input: UIKeyCommand.inputEscape, modifierFlags: [], action: #selector(close)),
        ]
      }
      @objc private func up() { if markedTextRange == nil { move(-1) } }
      @objc private func down() { if markedTextRange == nil { move(1) } }
      @objc private func close() { if markedTextRange == nil { escape() } }
    }
  }
#endif

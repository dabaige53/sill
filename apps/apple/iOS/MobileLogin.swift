#if os(iOS)
import SillKit
import SwiftUI

struct MobileLogin: View {
  let workspace: MobileWorkspace
  @State private var email = ""
  @State private var password = ""
  @State private var confirmation = ""
  @State private var resolving = false
  @FocusState private var field: Field?
  private enum Field { case email, password, confirmation }

  private var settingPassword: Bool { workspace.needsPasswordSetup }
  private var valid: Bool {
    settingPassword
      ? password.count >= 12 && password == confirmation
      : !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !password.isEmpty
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: AppleMetrics.space24) {
        Text("Sill").font(.system(size: AppleMetrics.font44, weight: .bold))
        Text(Copy.text(settingPassword ? "server.loginpage.53ae50023ff4" : "auth.loginTitle"))
          .font(.system(size: AppleMetrics.font30, weight: .bold))
          .accessibilityAddTraits(.isHeader)
        Text(Copy.text(settingPassword ? "server.loginpage.a8d1b4f0a1e0" : "mobile.login.hint"))
          .foregroundStyle(AppleColors.secondary)
        VStack(spacing: AppleMetrics.space16) {
          if !settingPassword {
            TextField(Copy.text("server.loginpage.73075237fd0f"), text: $email)
              .keyboardType(.emailAddress).textContentType(.username)
              .textInputAutocapitalization(.never).autocorrectionDisabled()
              .submitLabel(.next).focused($field, equals: .email)
              .onSubmit { field = .password }
              .modifier(LoginField())
          }
          SecureField(
            Copy.text(settingPassword ? "server.loginpage.566f6ab7157d" : "server.loginpage.a621ab606db2"),
            text: $password
          )
          .textContentType(settingPassword ? .newPassword : .password)
          .submitLabel(settingPassword ? .next : .go).focused($field, equals: .password)
          .onSubmit { if settingPassword { field = .confirmation } else { submit() } }
          .modifier(LoginField())
          if settingPassword {
            SecureField(Copy.text("mobile.confirmPassword"), text: $confirmation)
              .textContentType(.newPassword).submitLabel(.go)
              .focused($field, equals: .confirmation).onSubmit(submit)
              .modifier(LoginField())
          }
        }
        Button(Copy.text(settingPassword ? "server.loginpage.68084c3895c1" : "server.loginpage.1e2df9c3075a"), action: submit)
          .buttonStyle(MobileButtonStyle()).disabled(!valid || workspace.busy)
        if workspace.busy { ProgressView().frame(maxWidth: .infinity) }
        if settingPassword {
          Button(Copy.text("web.cloudentry.3ab8cc15939f")) { Task { await workspace.logout() } }
            .disabled(workspace.busy)
        }
        if let error = workspace.error {
          Text(error).foregroundStyle(AppleColors.secondary)
          Button(Copy.text("mobile.retrySession")) { Task { await workspace.refresh() } }
            .disabled(workspace.busy)
        }
        if workspace.unresolvedWrite {
          Button(Copy.text("mobile.resolveUnknown")) { resolving = true }
            .disabled(workspace.busy)
        }
      }
      .padding(AppleMetrics.space24)
      .frame(maxWidth: AppleMetrics.readerWidth)
      .frame(maxWidth: .infinity)
    }
    .background(AppleColors.canvas)
    .onDisappear { password = ""; confirmation = "" }
    .confirmationDialog(Copy.text("mobile.resolveUnknown"), isPresented: $resolving, titleVisibility: .visible) {
      Button(Copy.text("mobile.resolveUnknown")) {
        Task { await workspace.acknowledgeUnknownWrite() }
      }
      Button(Copy.text("apple.cancel"), role: .cancel) {}
    } message: { Text(Copy.text("mobile.resolveExpiredWrite")) }
  }

  private func submit() {
    guard valid, !workspace.busy else { return }
    field = nil
    Task {
      if settingPassword { await workspace.setPassword(password) }
      else { await workspace.login(email: email, password: password) }
      password = ""
      confirmation = ""
    }
  }
}

private struct LoginField: ViewModifier {
  func body(content: Content) -> some View {
    content.font(.system(size: AppleMetrics.font17))
      .padding(AppleMetrics.space16)
      .background(AppleColors.surface, in: RoundedRectangle(cornerRadius: AppleMetrics.settingsRadius))
  }
}
#endif

import SillKit
import SwiftUI

/// The same narrow login form, labels and actions as the Web account page.
// @design auth-login
struct CloudLogin: View {
  @Environment(Account.self) private var account
  @State private var email = ""
  @State private var password = ""
  @State private var showPassword = false
  @FocusState private var focused: Field?
  private enum Field { case email, password }

  private var setup: Bool { account.needsPasswordSetup }
  var body: some View {
    GeometryReader { geometry in
      ScrollView {
        VStack(spacing: 0) {
          BrandMark()
            .padding(.bottom, AppleMetrics.space24)
          Text(
            Copy.text(
              setup
                ? "server.loginpage.53ae50023ff4"
                : "auth.loginTitle")
          )
          .font(.sans(AppleMetrics.font30, .semibold))
          .foregroundStyle(AppleColors.primary)
          .accessibilityAddTraits(.isHeader)
          .padding(.bottom, AppleMetrics.space30)
          VStack(alignment: .leading, spacing: AppleMetrics.space8) {
            if !setup {
              fieldLabel("server.loginpage.73075237fd0f")
              TextField("", text: $email)
                .textContentType(.username)
                .accessibilityLabel(Copy.text("server.loginpage.73075237fd0f"))
                .accessibilityIdentifier("login-email")
                .focused($focused, equals: .email)
                .modifier(LoginField())
                .padding(.bottom, AppleMetrics.space12)
            }
            Group {
              fieldLabel(setup ? "server.loginpage.566f6ab7157d" : "server.loginpage.a621ab606db2")
              HStack(spacing: AppleMetrics.space8) {
                Group {
                  if showPassword {
                    TextField("", text: $password)
                  } else {
                    SecureField("", text: $password)
                  }
                }
                .textContentType(setup ? .newPassword : .password)
                .accessibilityLabel(Copy.text("server.loginpage.a621ab606db2"))
                .accessibilityIdentifier("login-password")
                .focused($focused, equals: .password)
                Button {
                  showPassword.toggle()
                  focused = .password
                } label: {
                  Icon("eye", size: AppleMetrics.font18)
                }
                .buttonStyle(IconPress())
                .accessibilityLabel(
                  Copy.text(showPassword ? "auth.hidePassword" : "auth.showPassword"))
              }
              .modifier(LoginField())
              .padding(.bottom, AppleMetrics.space8)
            }
            Button(
              Copy.text(
                setup
                  ? "server.loginpage.68084c3895c1"
                  : "server.loginpage.a4e09c4c209d")
            ) {
              submit()
            }
            .buttonStyle(LoginButton())
            .keyboardShortcut(.defaultAction)
            .accessibilityIdentifier("login-submit")
            .disabled(
              account.busy
                || (setup
                  ? password.count < 12
                  : email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    || password.isEmpty)
            )
            if setup {
              Button(Copy.text("web.cloudentry.3ab8cc15939f")) { Task { await account.logout() } }
                .buttonStyle(TextLinkStyle(padded: false))
            }
          }
          .disabled(account.busy)
          VStack(spacing: AppleMetrics.space8) {
            if account.busy { Text(Copy.text("login.processing")) }
            if let message = account.message { Text(message) }
            if let error = account.error { Text(error).foregroundStyle(AppleColors.error) }
          }
          .font(.sans(AppleMetrics.font13))
          .foregroundStyle(AppleColors.secondary)
          .multilineTextAlignment(.center)
          .textSelection(.enabled)
          .accessibilityElement(children: .combine)
          .padding(.top, AppleMetrics.space14)
        }
        .frame(maxWidth: AppleMetrics.authLoginWidth)
        .padding(.horizontal, AppleMetrics.space24)
        .padding(.vertical, AppleMetrics.space48)
        .frame(maxWidth: .infinity)
        .frame(minHeight: geometry.size.height)
      }
      .background(AppleColors.card)
      .onSubmit { submit() }
      .onAppear { focused = setup ? .password : .email }
      .onChange(of: account.error) { _, error in
        if let error { AccessibilityNotification.Announcement(error).post() }
      }
      .onChange(of: setup) { _, value in
        password = ""
        focused = value ? .password : .email
      }
    }
  }

  private func fieldLabel(_ key: String) -> some View {
    Text(Copy.text(key)).font(.sans(AppleMetrics.font14, .medium))
      .foregroundStyle(AppleColors.primary)
  }

  private func submit() {
    guard !account.busy,
      setup
        ? password.count >= 12
        : !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
          && !password.isEmpty
    else { return }
    let secret = password
    password = ""
    Task {
      if setup {
        await account.setPassword(secret)
      } else {
        await account.login(email: email, password: secret)
      }
    }
  }
}

private struct LoginField: ViewModifier {
  func body(content: Content) -> some View {
    content.textFieldStyle(.plain)
      .font(.sans(AppleMetrics.font16))
      .padding(.horizontal, AppleMetrics.space16)
      .frame(minHeight: AppleMetrics.hitTarget)
      .background(AppleColors.card, in: RoundedRectangle(cornerRadius: AppleMetrics.controlRadius))
      .overlay(
        RoundedRectangle(cornerRadius: AppleMetrics.controlRadius)
          .strokeBorder(AppleColors.line, lineWidth: AppleMetrics.lineWidth))
  }
}

private struct LoginButton: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.sans(AppleMetrics.font16, .semibold))
      .frame(maxWidth: .infinity, minHeight: AppleMetrics.hitTarget)
      .foregroundStyle(AppleColors.fixedWhite)
      .background(
        AppleColors.accentFill, in: RoundedRectangle(cornerRadius: AppleMetrics.controlRadius)
      )
      .opacity(configuration.isPressed ? AppleMetrics.disabledOpacity : 1)
      .modifier(HandCursor())
  }
}

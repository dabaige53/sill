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
            .padding(.bottom, AppleMetrics.space20)
          Text(
            Copy.text(
              setup
                ? "server.loginpage.53ae50023ff4"
                : "auth.loginTitle")
          )
          .font(.sans(AppleMetrics.font30, .semibold))
          .foregroundStyle(AppleColors.primary)
          .accessibilityAddTraits(.isHeader)
          .padding(.bottom, AppleMetrics.space24)
          VStack(alignment: .leading, spacing: AppleMetrics.space16) {
            if !setup {
              TextField("", text: $email)
                .textContentType(.username)
                .accessibilityLabel(Copy.text("server.loginpage.73075237fd0f"))
                .accessibilityIdentifier("login-email")
                .focused($focused, equals: .email)
                .modifier(
                  LoginField(
                    label: Copy.text("server.loginpage.73075237fd0f"),
                    floating: focused == .email || !email.isEmpty, active: focused == .email)
                )

            }
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
            .padding(.trailing, AppleMetrics.space48)
            .modifier(
              LoginField(
                label: Copy.text(
                  setup ? "server.loginpage.566f6ab7157d" : "server.loginpage.a621ab606db2"),
                floating: focused == .password || !password.isEmpty, active: focused == .password)
            )
            .overlay(alignment: .trailing) {
              Button {
                withAnimation(
                  Motion.keyboardDriven ? nil : Motion.ease(AppleMetrics.loginLabelDuration)
                ) {
                  showPassword.toggle()
                }
                focused = .password
              } label: {
                ZStack {
                  Icon("eye", size: AppleMetrics.space20).opacity(showPassword ? 0 : 1)
                    .scaleEffect(showPassword ? 0.9 : 1)
                  Icon("eye-off", size: AppleMetrics.space20).opacity(showPassword ? 1 : 0)
                    .scaleEffect(showPassword ? 1 : 0.9)
                }.frame(width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
              }.buttonStyle(IconPress())
                .accessibilityLabel(
                  Copy.text(showPassword ? "auth.hidePassword" : "auth.showPassword")
                )
                .padding(.trailing, AppleMetrics.space4)
            }
            .padding(.bottom, AppleMetrics.space8)
            Button(action: submit) {
              HStack(spacing: AppleMetrics.space8) {
                if account.busy { LoginSpinner() }
                Text(
                  Copy.text(
                    account.busy
                      ? "login.processing"
                      : setup ? "server.loginpage.68084c3895c1" : "server.loginpage.a4e09c4c209d"))
              }
            }
            .buttonStyle(LoginButton())
            .keyboardShortcut(.defaultAction)
            .accessibilityIdentifier("login-submit")
            .disabled(account.busy || !valid)
            if setup {
              Button(Copy.text("web.cloudentry.3ab8cc15939f")) { Task { await account.logout() } }
                .buttonStyle(TextLinkStyle(padded: false))
            }
          }
          .disabled(account.busy)
          VStack(spacing: AppleMetrics.space8) {
            if let message = account.message { Text(message) }
            if let error = account.error { Text(error).foregroundStyle(AppleColors.error) }
          }
          .font(.sans(AppleMetrics.font13))
          .foregroundStyle(AppleColors.secondary)
          .multilineTextAlignment(.leading)
          .frame(maxWidth: .infinity, minHeight: AppleMetrics.space24, alignment: .leading)
          .textSelection(.enabled)
          .accessibilityElement(children: .combine)
          .padding(.top, AppleMetrics.space16)
        }
        .frame(maxWidth: AppleMetrics.authLoginWidth)
        .padding(.horizontal, AppleMetrics.space24)
        .padding(.vertical, AppleMetrics.space24)
        .frame(maxWidth: .infinity)
        .frame(minHeight: geometry.size.height)
      }
      .background(AppleColors.card)
      .onSubmit { submit() }
      .onChange(of: email) { _, value in if value.count > 254 { email = String(value.prefix(254)) }
      }
      .onChange(of: password) { _, value in
        if value.count > 256 { password = String(value.prefix(256)) }
      }
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

  private var valid: Bool {
    !password.isEmpty && password.count <= 256
      && (setup ? password.count >= 12 : Self.validEmail(email))
  }

  static func validEmail(_ email: String) -> Bool {
    let value = email.trimmingCharacters(in: .whitespacesAndNewlines)
    return value.count <= 254
      && value.range(
        of:
          #"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*$"#,
        options: .regularExpression) != nil
  }

  private func submit() {
    guard !account.busy, valid else { return }
    let secret = password
    Task {
      if setup {
        await account.setPassword(secret)
      } else {
        await account.login(email: email, password: secret)
      }
      if account.error == nil { password = "" }
    }
  }
}

private struct LoginField: ViewModifier {
  let label: String
  let floating: Bool
  let active: Bool
  func body(content: Content) -> some View {
    content.textFieldStyle(.plain)
      .font(.sans(AppleMetrics.font16))
      .padding(.horizontal, AppleMetrics.space16)
      .padding(.top, AppleMetrics.space24)
      .padding(.bottom, AppleMetrics.space4)
      .frame(height: AppleMetrics.space56)
      .overlay(alignment: .topLeading) {
        Text(label)
          .font(.sans(AppleMetrics.font16))
          .scaleEffect(
            floating ? AppleMetrics.font12 / AppleMetrics.font16 : 1, anchor: .topLeading
          )
          .foregroundStyle(active ? AppleColors.accent : AppleColors.secondary)
          .padding(.leading, AppleMetrics.space16)
          .padding(.top, floating ? AppleMetrics.space8 : AppleMetrics.space16)
          .allowsHitTesting(false)
          .accessibilityHidden(true)
          .animation(
            Motion.keyboardDriven ? nil : Motion.ease(AppleMetrics.loginLabelDuration),
            value: floating)
      }
      .background(
        active ? AppleColors.card : AppleColors.surface,
        in: RoundedRectangle(cornerRadius: AppleMetrics.controlRadius)
      )
      .overlay(
        RoundedRectangle(cornerRadius: AppleMetrics.controlRadius)
          .strokeBorder(
            active ? AppleColors.accent : AppleColors.line, lineWidth: AppleMetrics.lineWidth))
  }
}

private struct LoginButton: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.sans(AppleMetrics.font16, .semibold))
      .frame(maxWidth: .infinity, minHeight: AppleMetrics.space48)
      .foregroundStyle(AppleColors.fixedWhite)
      .background(
        AppleColors.accentFill, in: RoundedRectangle(cornerRadius: AppleMetrics.controlRadius)
      )
      .scaleEffect(
        configuration.isPressed && !Motion.keyboardDriven ? AppleMetrics.motionPressScale : 1
      )
      .animation(Motion.press, value: configuration.isPressed)
      .modifier(HandCursor())
  }
}

private struct LoginSpinner: View {
  var body: some View {
    TimelineView(.animation(minimumInterval: 1 / 30)) { context in
      Circle().trim(from: 0, to: 0.75)
        .stroke(style: StrokeStyle(lineWidth: AppleMetrics.space2, lineCap: .round))
        .rotationEffect(
          .degrees(
            context.date.timeIntervalSinceReferenceDate.truncatingRemainder(
              dividingBy: AppleMetrics.refreshSpinnerPeriod) * 360
              / AppleMetrics.refreshSpinnerPeriod))
    }.frame(width: AppleMetrics.space16, height: AppleMetrics.space16).accessibilityHidden(true)
  }
}

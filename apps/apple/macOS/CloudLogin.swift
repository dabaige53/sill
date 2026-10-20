import SillKit
import SwiftUI

struct CloudLogin: View {
  @Environment(Workspace.self) var model: Workspace
  @State private var email = ""
  @State private var password = ""
  @State private var passwordPage = false
  @State private var backupEmail = ""
  @State private var showRecovery = false
  var body: some View {
    ZStack {
      AppleColors.canvas.ignoresSafeArea()
      if model.connecting {
        ProgressView().controlSize(.small)
      } else if passwordPage || model.needsPasswordSetup {
        passwordForm
      } else {
        welcome
      }
    }.tint(AppleColors.accent).foregroundStyle(AppleColors.primary)
      .frame(minWidth: AppleMetrics.desktopMinWidth, minHeight: AppleMetrics.desktopMinHeight)
  }
  private var welcome: some View {
    VStack(spacing: AppleMetrics.space24) {
      NativeIcon(name: "sill", size: AppleMetrics.space40)
      Text(Copy.appleWindowTitle).font(.system(size: AppleMetrics.font30, weight: .semibold))
      Text(Copy.text("web.welcome.tagline")).foregroundStyle(AppleColors.secondary)
      Button(Copy.text("web.cloudentry.be4ece4b22aa")) { passwordPage = true }.buttonStyle(
        LoginButtonStyle())
      VStack(alignment: .leading, spacing: AppleMetrics.space12) {
        Text(Copy.text("web.cloudentry.d261be8e9b91"))
        TextField(Copy.text("web.cloudentry.27558ddc9803"), text: $email).textContentType(
          .emailAddress
        ).modifier(LoginFieldStyle())
        Button(Copy.text("web.cloudentry.92b193fad920")) { model.requestLoginLink(email: email) }
          .buttonStyle(LoginButtonStyle()).disabled(model.busy || email.isEmpty)
        Text(model.loginMessage ?? Copy.text("web.cloudentry.5eef9638100a")).font(
          .system(size: AppleMetrics.font13)
        ).foregroundStyle(AppleColors.secondary)
        status
      }.frame(width: AppleMetrics.cardIdealWidth)
    }.padding(AppleMetrics.space40)
  }
  private var passwordForm: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: AppleMetrics.space18) {
        Button(Copy.text("server.loginpage.d4fc4b75f2fe")) {
          if !model.needsPasswordSetup { passwordPage = false }
        }.buttonStyle(.plain).foregroundStyle(AppleColors.accent)
        Text(
          Copy.text(
            model.needsPasswordSetup
              ? "server.loginpage.53ae50023ff4" : "server.loginpage.7ea52566c5ef")
        )
        .font(.system(size: AppleMetrics.previewPaddingTop, weight: .semibold))
        Text(
          Copy.text(model.needsPasswordSetup ? "server.loginpage.a8d1b4f0a1e0" : "auth.loginIntro"))
        if !model.needsPasswordSetup {
          Text(Copy.text("server.loginpage.73075237fd0f"))
          TextField("", text: $email).textContentType(.username).modifier(LoginFieldStyle())
            .accessibilityLabel(Copy.text("server.loginpage.73075237fd0f"))
        }
        Text(
          Copy.text(
            model.needsPasswordSetup
              ? "server.loginpage.566f6ab7157d" : "server.loginpage.a621ab606db2"))
        SecureField("", text: $password).textContentType(
          model.needsPasswordSetup ? .newPassword : .password
        )
        .modifier(LoginFieldStyle()).accessibilityLabel(Copy.text("server.loginpage.a621ab606db2"))
        Button(
          Copy.text(
            model.needsPasswordSetup
              ? "server.loginpage.68084c3895c1" : "server.loginpage.a4e09c4c209d")
        ) {
          if model.needsPasswordSetup {
            model.setPassword(password)
          } else {
            model.login(
              email: email.trimmingCharacters(in: .whitespacesAndNewlines), password: password)
          }
          password = ""
        }.buttonStyle(LoginButtonStyle()).keyboardShortcut(.defaultAction)
          .disabled(
            model.busy
              || (model.needsPasswordSetup
                ? password.count < 12 : email.isEmpty || password.isEmpty)
          )
        if !model.needsPasswordSetup {
          DisclosureGroup(Copy.text("server.loginpage.4be98f6f6564"), isExpanded: $showRecovery) {
            VStack(alignment: .leading, spacing: AppleMetrics.space12) {
              Text(Copy.text("server.loginpage.b6f70b9cbcb5"))
              TextField(Copy.text("server.loginpage.73075237fd0f"), text: $backupEmail).modifier(
                LoginFieldStyle())
              Button(Copy.text("server.loginpage.94d5bba8d2d0")) {
                model.requestLoginLink(email: backupEmail, setupPassword: true)
              }
              .buttonStyle(LoginButtonStyle()).disabled(model.busy || backupEmail.isEmpty)
            }.padding(.top, AppleMetrics.space16)
          }
        }
        if let message = model.loginMessage { Text(message).foregroundStyle(AppleColors.secondary) }
        status
      }.padding(AppleMetrics.space32).frame(width: AppleMetrics.roomyMaxWidth)
        .background(AppleColors.card, in: RoundedRectangle(cornerRadius: AppleMetrics.panelRadius))
        .padding(.vertical, AppleMetrics.railRow)
        .frame(maxWidth: .infinity)
    }
  }
  @ViewBuilder private var status: some View {
    if model.busy { Text(Copy.text("login.processing")).foregroundStyle(AppleColors.secondary) }
    if let error = model.error {
      Text(error).foregroundStyle(AppleColors.error).textSelection(.enabled)
    }
  }
}

private struct LoginFieldStyle: ViewModifier {
  func body(content: Content) -> some View {
    content.textFieldStyle(.plain).padding(AppleMetrics.space12)
      .background(AppleColors.card, in: RoundedRectangle(cornerRadius: AppleMetrics.space10))
      .overlay(
        RoundedRectangle(cornerRadius: AppleMetrics.space10).strokeBorder(
          AppleColors.secondary.opacity(0.4)))
  }
}
private struct LoginButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label.font(.system(size: AppleMetrics.font16)).frame(maxWidth: .infinity)
      .padding(AppleMetrics.space12).foregroundStyle(.white)
      .background(
        AppleColors.accentFill.opacity(configuration.isPressed ? 0.85 : 1),
        in: RoundedRectangle(cornerRadius: AppleMetrics.space10))
  }
}

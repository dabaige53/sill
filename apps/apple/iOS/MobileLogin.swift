#if os(iOS)
  import SillKit
  import SwiftUI

  /// LoginMobile uses the same 352-point form, app mark and password flow as the account page.
  // @design auth-login
  struct MobileLogin: View {
    let workspace: MobileWorkspace
    @State private var email = ""
    @State private var password = ""
    @State private var showPassword = false
    @State private var resolving = false
    @FocusState private var focused: Field?
    @Environment(\.scenePhase) private var scenePhase
    private enum Field { case email, password }
    private var setup: Bool { workspace.needsPasswordSetup }
    private var valid: Bool {
      setup
        ? password.count >= 12
        : !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !password.isEmpty
    }

    var body: some View {
      ScrollView {
        VStack(spacing: 0) {
          MobileBrandMark(size: AppleMetrics.space40)
            .padding(.bottom, AppleMetrics.space24)
          Text(Copy.text(setup ? "server.loginpage.53ae50023ff4" : "auth.loginTitle"))
            .font(.system(size: AppleMetrics.font30, weight: .semibold))
            .multilineTextAlignment(.center)
            .accessibilityAddTraits(.isHeader)
            .padding(.bottom, AppleMetrics.space30)
          form
          status
        }
        .frame(maxWidth: AppleMetrics.authLoginWidth)
        .padding(.horizontal, AppleMetrics.space24)
        .padding(.top, AppleMetrics.space64)
        .padding(.bottom, AppleMetrics.space48)
        .frame(maxWidth: .infinity)
      }
      .background(AppleColors.card)
      .ignoresSafeArea(.container, edges: .top)
      .foregroundStyle(AppleColors.primary)
      .scrollDismissesKeyboard(.interactively)
      .onDisappear { password = "" }
      .onChange(of: scenePhase) { _, value in if value == .background { password = "" } }
      .onChange(of: setup) { _, value in
        password = ""
        focused = value ? .password : .email
      }
      .onChange(of: workspace.error) { _, value in
        if let value { AccessibilityNotification.Announcement(value).post() }
      }
      .confirmationDialog(
        Copy.text("mobile.resolveUnknown"), isPresented: $resolving, titleVisibility: .visible
      ) {
        Button(Copy.text("mobile.resolveUnknown")) {
          Task { await workspace.acknowledgeUnknownWrite() }
        }
        Button(Copy.text("apple.cancel"), role: .cancel) {}
      } message: {
        Text(Copy.text("mobile.resolveExpiredWrite"))
      }
    }

    private var form: some View {
      VStack(alignment: .leading, spacing: AppleMetrics.space8) {
        if !setup {
          fieldLabel("server.loginpage.73075237fd0f")
          TextField("", text: $email)
            .textContentType(.username).keyboardType(.emailAddress)
            .textInputAutocapitalization(.never).autocorrectionDisabled()
            .accessibilityLabel(Copy.text("server.loginpage.73075237fd0f"))
            .accessibilityIdentifier("login-email")
            .submitLabel(.next).focused($focused, equals: .email)
            .onSubmit { focused = .password }
            .modifier(MobileLoginField())
            .padding(.bottom, AppleMetrics.space12)
        }
        fieldLabel(setup ? "server.loginpage.566f6ab7157d" : "server.loginpage.a621ab606db2")
        HStack(spacing: 0) {
          Group {
            if showPassword {
              TextField("", text: $password)
            } else {
              SecureField("", text: $password)
            }
          }
          .textContentType(setup ? .newPassword : .password)
          .textInputAutocapitalization(.never).autocorrectionDisabled()
          .accessibilityLabel(Copy.text("server.loginpage.a621ab606db2"))
          .accessibilityIdentifier("login-password")
          .submitLabel(.go).focused($focused, equals: .password).onSubmit(submit)
          MobileIconButton(
            "eye", label: Copy.text(showPassword ? "auth.hidePassword" : "auth.showPassword")
          ) {
            showPassword.toggle()
            focused = .password
          }
        }
        .modifier(MobileLoginField(trailing: AppleMetrics.space4))
        .padding(.bottom, AppleMetrics.space8)
        Button(
          Copy.text(setup ? "server.loginpage.68084c3895c1" : "server.loginpage.a4e09c4c209d"),
          action: submit
        )
        .buttonStyle(MobileLoginButton())
        .accessibilityIdentifier("login-submit")
        .keyboardShortcut(.defaultAction)
        .disabled(!valid || workspace.busy)
        if setup {
          Button(Copy.text("web.cloudentry.3ab8cc15939f")) { Task { await workspace.logout() } }
            .font(.system(size: AppleMetrics.font13)).foregroundStyle(AppleColors.accent)
            .frame(minHeight: AppleMetrics.hitTarget)
        }
      }.disabled(workspace.busy)
    }

    private var status: some View {
      VStack(spacing: AppleMetrics.space8) {
        if workspace.busy { Text(Copy.text("login.processing")) }
        if let error = workspace.error {
          Text(error).foregroundStyle(AppleColors.error)
          Button(Copy.text("mobile.retrySession")) { Task { await workspace.refresh() } }
            .disabled(workspace.busy)
        }
        if workspace.unresolvedWrite {
          Button(Copy.text("mobile.resolveUnknown")) { resolving = true }.disabled(workspace.busy)
        }
      }
      .font(.system(size: AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
      .multilineTextAlignment(.center).textSelection(.enabled)
      .padding(.top, AppleMetrics.space14)
    }
    private func fieldLabel(_ key: String) -> some View {
      Text(Copy.text(key)).font(.system(size: AppleMetrics.font14, weight: .medium))
    }
    private func submit() {
      guard valid, !workspace.busy else { return }
      let submitted = password
      password = ""
      focused = nil
      Task {
        if setup {
          await workspace.setPassword(submitted)
        } else {
          await workspace.login(email: email, password: submitted)
        }
      }
    }
  }

  private struct MobileLoginField: ViewModifier {
    var trailing: CGFloat = AppleMetrics.space16
    func body(content: Content) -> some View {
      content.textFieldStyle(.plain).font(.system(size: AppleMetrics.font16))
        .padding(.leading, AppleMetrics.space16).padding(.trailing, trailing)
        .frame(minHeight: AppleMetrics.hitTarget)
        .background(
          AppleColors.card, in: RoundedRectangle(cornerRadius: AppleMetrics.controlRadius)
        )
        .overlay(
          RoundedRectangle(cornerRadius: AppleMetrics.controlRadius)
            .strokeBorder(AppleColors.line, lineWidth: AppleMetrics.lineWidth))
    }
  }
  private struct MobileLoginButton: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
      configuration.label.font(.system(size: AppleMetrics.font16, weight: .semibold))
        .frame(maxWidth: .infinity, minHeight: AppleMetrics.hitTarget)
        .foregroundStyle(AppleColors.fixedWhite)
        .background(
          AppleColors.accentFill, in: RoundedRectangle(cornerRadius: AppleMetrics.controlRadius)
        )
        .opacity(configuration.isPressed || !enabled ? AppleMetrics.disabledOpacity : 1)
    }
  }
#endif

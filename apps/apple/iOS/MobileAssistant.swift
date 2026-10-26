#if os(iOS)
  import SillKit
  import SwiftUI

  struct MobileAssistant: View {
    let workspace: MobileWorkspace
    @Binding var context: [String]
    @Binding var draft: String
    @FocusState private var focused: Bool
    let open: (String) -> Void

    var body: some View {
      VStack(alignment: .leading, spacing: AppleMetrics.space16) {
        ScrollView {
          VStack(alignment: .leading, spacing: AppleMetrics.space12) {
            Text(Copy.text("web.ai.body"))
              .font(.system(size: AppleMetrics.font15))
              .foregroundStyle(AppleColors.secondary)
            if !context.isEmpty {
              Text(Copy.text("web.ai.context"))
                .font(.system(size: AppleMetrics.font13, weight: .medium))
                .foregroundStyle(AppleColors.secondary)
              ForEach(context, id: \.self) { id in
                if let card = workspace.card(id) {
                  HStack(spacing: AppleMetrics.space8) {
                    MobileIcon(MobileCardTile.icon(card.type), size: AppleMetrics.space20)
                    Button(card.title) { open(id) }.lineLimit(2).buttonStyle(.plain)
                    Spacer(minLength: 0)
                    MobileIconButton("x", label: Copy.text("web.ai.removeContext")) {
                      withAnimation(MobileMotion.fast) { context.removeAll { $0 == id } }
                    }
                  }
                  .padding(.leading, AppleMetrics.space12)
                  .background(
                    AppleColors.card, in: RoundedRectangle(cornerRadius: AppleMetrics.refRadius)
                  )
                  .transition(.opacity.combined(with: .offset(y: AppleMetrics.motionContextY)))
                }
              }
            }
          }.frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, AppleMetrics.space16)
        }.simultaneousGesture(TapGesture().onEnded { focused = false })
        VStack(spacing: AppleMetrics.space8) {
          TextField(Copy.text("web.ai.composer"), text: $draft, axis: .vertical)
            .font(.system(size: AppleMetrics.font17))
            .lineLimit(1...6).focused($focused)
            .padding(.horizontal, AppleMetrics.space16)
            .padding(.top, AppleMetrics.space16)
          HStack {
            MobileIconButton("plus", label: Copy.text("web.ai.addUnavailable")) {}.disabled(true)
            Spacer()
            MobileIconButton("mic", label: Copy.text("web.ai.speak")) {}.disabled(true)
            MobileIconButton("send", label: Copy.text("web.ai.sendUnavailable")) {}.disabled(true)
          }.padding(.horizontal, AppleMetrics.space8)
        }
        .background(
          AppleColors.card, in: RoundedRectangle(cornerRadius: AppleMetrics.mobileCardRadius))
        Text(Copy.text("web.ai.localOnly"))
          .font(.system(size: AppleMetrics.font12)).foregroundStyle(AppleColors.secondary)
          .frame(maxWidth: .infinity)
      }
      .padding(.horizontal, AppleMetrics.space16)
      .padding(.bottom, focused ? AppleMetrics.space16 : AppleMetrics.feedBottom)
      .background(AppleColors.canvas)
    }
  }
#endif

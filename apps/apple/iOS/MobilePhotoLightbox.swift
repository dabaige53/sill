#if os(iOS)
  import SillKit
  import SwiftUI

  /// A photo keeps the remaining screen for its image; metadata and common tools stay below it.
  struct MobilePhotoLightbox: View {
    let workspace: MobileWorkspace
    let card: MobileCard
    let close: () -> Void
    @State private var index = 0
    @State private var annotations = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var current: MobileCard { workspace.card(card.id) ?? card }
    private var photos: [String] {
      let values = current.raw["photos"]?.strings ?? []
      return values.isEmpty ? [current.raw["image"]?.string].compactMap { $0 } : values
    }
    private var selection: Int { min(max(0, index), max(0, photos.count - 1)) }

    var body: some View {
      VStack(spacing: 0) {
        HStack(spacing: AppleMetrics.space12) {
          VStack(alignment: .leading, spacing: AppleMetrics.space2) {
            Text(current.title).font(.system(size: AppleMetrics.font15, weight: .semibold))
              .lineLimit(2)
            Text("\(photos.isEmpty ? 0 : selection + 1) / \(photos.count)")
              .font(.system(size: AppleMetrics.font13, design: .rounded)).monospacedDigit()
              .foregroundStyle(AppleColors.fixedWhite75)
          }.frame(maxWidth: .infinity, alignment: .leading)
          photoButton("x", label: "web.photo.close", action: close)
        }.padding(.horizontal, AppleMetrics.space20).padding(.vertical, AppleMetrics.space16)
        stage
        VStack(alignment: .leading, spacing: AppleMetrics.space8) {
          if let caption = current.caption, !caption.isEmpty {
            Text(caption).font(.system(size: AppleMetrics.font14)).fixedSize(
              horizontal: false, vertical: true)
          }
          let metadata = [
            current.location,
            current.raw["takenAt"]?.string.flatMap { MobileFormat.publication($0) },
          ]
          .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
          if !metadata.isEmpty { Text(metadata).font(.system(size: AppleMetrics.font13)) }
        }.foregroundStyle(AppleColors.fixedWhite75)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, AppleMetrics.space20).padding(.vertical, AppleMetrics.space12)
        if photos.count > 1 { thumbnails }
        if !current.note.isEmpty {
          Text(current.note).font(.system(size: AppleMetrics.font14)).textSelection(.enabled)
            .frame(maxWidth: .infinity, alignment: .leading).padding(AppleMetrics.space12)
            .background(
              AppleColors.fixedWhite12,
              in: RoundedRectangle(cornerRadius: AppleMetrics.controlRadius)
            )
            .padding(.horizontal, AppleMetrics.space20).padding(.bottom, AppleMetrics.space12)
        }
        toolbar.padding(.bottom, AppleMetrics.space16)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(AppleColors.fixedPhotoCanvas.ignoresSafeArea())
      .foregroundStyle(AppleColors.fixedWhite)
      .environment(\.colorScheme, .dark)
      .accessibilityElement(children: .contain).accessibilityAddTraits(.isModal)
      .sheet(isPresented: $annotations) {
        MobileAnnotations(workspace: workspace, baseline: current)
      }
      .onKeyPress(.leftArrow) {
        step(-1)
        return .handled
      }
      .onKeyPress(.rightArrow) {
        step(1)
        return .handled
      }
    }

    private var stage: some View {
      GeometryReader { geometry in
        ZStack {
          if photos.isEmpty {
            Text(Copy.text("ios.photoUnavailable")).foregroundStyle(AppleColors.fixedWhite75)
          } else {
            MobileCoverImage(
              source: photos[selection], contentMode: .fit, canvas: AppleColors.fixedPhotoCanvas
            )
            .accessibilityHidden(false)
            .id(photos[selection])
            .transition(.opacity)
            .frame(width: geometry.size.width, height: geometry.size.height)
            .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.lightboxImageRadius))
            .accessibilityLabel(
              current.title + Copy.text("web.photo.altIndexPrefix")
                + "\(selection + 1)" + Copy.text("web.common.cardCountSuffix"))
          }
          if photos.count > 1 {
            HStack {
              photoButton("back", label: "web.photo.previous") { step(-1) }
              Spacer()
              photoButton("arrow", label: "web.photo.next") { step(1) }
            }.padding(.horizontal, AppleMetrics.space12)
          }
        }.frame(maxWidth: .infinity, maxHeight: .infinity)
          .contentShape(Rectangle())
          .gesture(
            DragGesture(minimumDistance: AppleMetrics.space24).onEnded { value in
              guard abs(value.translation.width) > abs(value.translation.height) else { return }
              step(value.translation.width < 0 ? 1 : -1)
            })
      }.frame(maxWidth: AppleMetrics.lightboxImageMaxWidth, maxHeight: .infinity)
    }

    private var thumbnails: some View {
      ScrollViewReader { proxy in
        ScrollView(.horizontal) {
          HStack(spacing: AppleMetrics.space6) {
            ForEach(photos.indices, id: \.self) { number in
              Button {
                select(number)
              } label: {
                MobileCoverImage(source: photos[number])
                  .frame(
                    width: AppleMetrics.lightboxThumbSize, height: AppleMetrics.lightboxThumbHeight
                  )
                  .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.lightboxThumbRadius))
                  .overlay {
                    RoundedRectangle(cornerRadius: AppleMetrics.lightboxThumbRadius)
                      .strokeBorder(
                        number == selection ? AppleColors.fixedWhite : .clear,
                        lineWidth: AppleMetrics.selectionLineWidth)
                  }.opacity(number == selection ? 1 : AppleMetrics.lightboxThumbOpacity)
              }.buttonStyle(MobilePressStyle()).id(number)
                .accessibilityLabel(
                  Copy.text("web.photo.indexPrefix") + "\(number + 1)"
                    + Copy.text("web.common.cardCountSuffix")
                )
                .accessibilityAddTraits(number == selection ? .isSelected : [])
            }
          }.padding(AppleMetrics.space16)
        }.scrollIndicators(.hidden)
          .onChange(of: selection) { _, value in
            withAnimation(reduceMotion ? nil : MobileMotion.fast) {
              proxy.scrollTo(value, anchor: .center)
            }
          }
      }.fixedSize(horizontal: false, vertical: true)
    }

    private var toolbar: some View {
      let hidden = Set(workspace.preferences["hiddenActions"]?.strings ?? [])
      return HStack(spacing: AppleMetrics.space4) {
        if !hidden.contains("bookmark") {
          commonButton("bookmark", label: "apple.toggleBookmarkMenu", active: current.bookmarked) {
            Task { await workspace.toggle(current, field: "bookmarked") }
          }
        }
        if !hidden.contains("tag") {
          commonButton("tag", label: "apple.organize") { annotations = true }
        }
        if !hidden.contains("later") {
          commonButton("clock", label: "apple.toggleLaterMenu", active: current.later) {
            Task { await workspace.toggle(current, field: "later") }
          }
        }
      }.padding(AppleMetrics.railInset)
        .mobileGlass(Capsule())
        .disabled(workspace.busy || workspace.unresolvedWrite)
    }

    private func commonButton(
      _ icon: String, label: String, active: Bool = false,
      action: @escaping () -> Void
    ) -> some View {
      Button(action: action) {
        MobileIcon(icon, size: AppleMetrics.space18)
          .foregroundStyle(active ? AppleColors.accent : AppleColors.fixedWhite)
          .frame(width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
      }.buttonStyle(MobilePressStyle()).accessibilityLabel(Copy.text(label))
        .accessibilityAddTraits(active ? .isSelected : [])
    }
    private func photoButton(_ icon: String, label: String, action: @escaping () -> Void)
      -> some View
    {
      Button(action: action) {
        MobileIcon(icon, size: AppleMetrics.space18)
          .frame(width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
          .background(AppleColors.fixedWhite12, in: Circle())
      }.buttonStyle(MobilePressStyle()).accessibilityLabel(Copy.text(label))
    }
    private func step(_ delta: Int) {
      guard photos.count > 1, !annotations else { return }
      select((selection + delta + photos.count) % photos.count)
    }
    private func select(_ number: Int) {
      withAnimation(reduceMotion ? nil : MobileMotion.fast) { index = number }
    }
  }
#endif

import AppKit
import SillKit
import SwiftUI

/// Theme-aware photo paging. Trackpad scrolling belongs to ScrollView; a mouse button drag
/// chooses from its starting page, so native paging cannot advance it a second time.
struct PhotoLightbox: View {
  let card: CardModel
  let state: CardState
  @Environment(Workspace.self) private var workspace
  @Environment(Reader.self) private var reader
  @Environment(Panels.self) private var panels
  @State private var index = 0
  @State private var mousePage: Int?
  @State private var visiblePhoto: Int? = 0
  @FocusState private var focused: Bool

  var body: some View {
    let photos = Self.photos(card)
    let current = min(max(0, index), max(0, photos.count - 1))
    VStack(spacing: 0) {
      top
      stage(photos, current: current)
      if let caption = card.caption, !caption.isEmpty {
        Text(caption)
          .font(.sans(AppleMetrics.font14))
          .foregroundStyle(AppleColors.secondary)
          .multilineTextAlignment(.leading)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.top, AppleMetrics.space12)
          .padding(.bottom, AppleMetrics.space4)
          .padding(.horizontal, AppleMetrics.photoPageGutter)
      }
      let metadata = [card.location, card.takenAt.flatMap { Format.publication($0) }]
        .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
      if !metadata.isEmpty {
        Text(metadata)
          .font(.sans(AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
          .frame(maxWidth: .infinity, alignment: .leading).padding(
            .horizontal, AppleMetrics.photoPageGutter)
      }
      if !photos.isEmpty { thumbs(photos, current: current) }
      if !state.note.isEmpty {
        NoteBox(note: state.note)
          .padding(.top, AppleMetrics.space12)
          .padding(.bottom, AppleMetrics.space4)
          .padding(.horizontal, AppleMetrics.photoPageGutter)
      }
      let tools = ReaderTools.actions(
        card: card, state: state, hidden: workspace.preferences.hiddenActions
      ).filter { !$0.own }
      if !tools.isEmpty {
        ReaderToolbar(card: card, state: state, actions: tools)
          .padding(.bottom, AppleMetrics.space16)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(AppleColors.canvas)
    .foregroundStyle(AppleColors.primary)
    .focusable()
    .focusEffectDisabled()
    .focused($focused)
    .onAppear { focused = true }
    .onKeyPress(.leftArrow) { step(-1, count: photos.count) }
    .onKeyPress(.rightArrow) { step(1, count: photos.count) }
    .onReceive(NotificationCenter.default.publisher(for: NSApplication.didResignActiveNotification))
    { _ in
      if let start = mousePage {
        Motion.instantly {
          index = start
          visiblePhoto = start
        }
        mousePage = nil
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(card.title)
    .accessibilityAddTraits(.isModal)
  }

  private var top: some View {
    HStack {
      VStack(alignment: .leading, spacing: AppleMetrics.space2) {
        Text(card.title).font(.sans(AppleMetrics.font15, .semibold))
        Text("\(min(index + 1, Self.photos(card).count)) / \(Self.photos(card).count)")
          .font(.number(AppleMetrics.font13)).foregroundStyle(AppleColors.secondary)
      }
      Spacer(minLength: 0)
      DarkIconButton(icon: "x", label: Copy.text("web.photo.close")) { reader.close() }
    }
    .padding(.top, AppleMetrics.photoHeaderTop)
    .padding(.bottom, AppleMetrics.space16)
    .padding(.horizontal, AppleMetrics.photoPageGutter)
  }

  private func stage(_ photos: [String], current: Int) -> some View {
    HStack(spacing: AppleMetrics.space12) {
      if photos.count > 1 {
        DarkIconButton(icon: "back", label: Copy.text("web.photo.previous")) {
          _ = step(-1, count: photos.count)
        }.disabled(current == 0)
      }
      GeometryReader { geometry in
        ScrollViewReader { proxy in
          ScrollView(.horizontal) {
            LazyHStack(spacing: 0) {
              ForEach(photos.indices, id: \.self) { n in
                CoverImage(name: photos[n], fit: true)
                  .frame(width: geometry.size.width, height: geometry.size.height)
                  .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.lightboxImageRadius))
                  .id(n)
              }
            }.scrollTargetLayout()
          }
          .scrollIndicators(.hidden)
          .scrollTargetBehavior(.paging)
          .scrollPosition(id: $visiblePhoto)
          .onChange(of: visiblePhoto) { _, value in if let value { index = value } }
          .simultaneousGesture(
            DragGesture().onChanged { _ in
              if mousePage == nil { mousePage = current }
            }.onEnded { value in
              let start = mousePage ?? current
              mousePage = nil
              guard abs(value.translation.width) > abs(value.translation.height),
                abs(value.predictedEndTranslation.width) > geometry.size.width / 4
              else { return }
              index = min(
                max(0, start + (value.predictedEndTranslation.width < 0 ? 1 : -1)), photos.count - 1
              )
              withAnimation(Motion.layout) { visiblePhoto = index }
            }
          )
          .onChange(of: geometry.size) {
            Motion.instantly { proxy.scrollTo(current, anchor: .center) }
          }
        }
      }
      .frame(maxWidth: AppleMetrics.lightboxImageMaxWidth, maxHeight: .infinity)
      if photos.count > 1 {
        DarkIconButton(icon: "arrow", label: Copy.text("web.photo.next")) {
          _ = step(1, count: photos.count)
        }.disabled(current == photos.count - 1)
      }
    }
    .padding(.horizontal, AppleMetrics.photoPageGutter)
    .frame(maxHeight: .infinity)
  }

  private func thumbs(_ photos: [String], current: Int) -> some View {
    ScrollView(.horizontal) {
      HStack(spacing: AppleMetrics.space6) {
        ForEach(photos.indices, id: \.self) { n in
          Button {
            index = n
            withAnimation(Motion.keyboardDriven ? nil : Motion.layout) { visiblePhoto = n }
          } label: {
            CoverImage(name: photos[n])
              .frame(
                width: AppleMetrics.lightboxThumbSize, height: AppleMetrics.lightboxThumbHeight
              )
              .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.lightboxThumbRadius))
              .overlay(
                RoundedRectangle(cornerRadius: AppleMetrics.lightboxThumbRadius)
                  .strokeBorder(
                    n == current ? AppleColors.primary : .clear,
                    lineWidth: AppleMetrics.selectionLineWidth)
              )
              .opacity(n == current ? 1 : AppleMetrics.lightboxThumbOpacity)
          }
          .buttonStyle(.plain)
          .accessibilityLabel(
            Copy.text("web.photo.indexPrefix") + "\(n + 1)"
              + Copy.text("web.common.cardCountSuffix")
          )
          .accessibilityAddTraits(n == current ? .isSelected : [])
        }
      }
      .padding(.vertical, AppleMetrics.space16)
      .padding(.horizontal, AppleMetrics.photoPageGutter)
    }.scrollIndicators(.hidden).fixedSize(horizontal: false, vertical: true)
  }

  private func step(_ delta: Int, count: Int) -> KeyPress.Result {
    guard count > 1, panels.kind == nil else { return .ignored }
    index = min(max(0, index + delta), count - 1)
    withAnimation(Motion.keyboardDriven ? nil : Motion.layout) { visiblePhoto = index }
    return .handled
  }

  static func photos(_ card: CardModel) -> [String] {
    card.photos.isEmpty ? [card.image].compactMap { $0 } : card.photos
  }
}

/// A 44 white icon button on the photo page; hover adds a 12% white disc.
private struct DarkIconButton: View {
  let icon: String
  let label: String
  let action: () -> Void
  @State private var hovered = false
  var body: some View {
    Button(action: action) {
      Icon(icon, size: AppleMetrics.font18)
        .foregroundStyle(AppleColors.primary)
        .frame(width: AppleMetrics.iconButton, height: AppleMetrics.iconButton)
        .background(
          Circle().fill(hovered ? AppleColors.primary.opacity(0.2) : AppleColors.faint)
        )
        .contentShape(Circle())
    }
    .buttonStyle(IconPress(highlight: false))
    .onHover { hovered = $0 }
    .accessibilityLabel(label)
  }
}

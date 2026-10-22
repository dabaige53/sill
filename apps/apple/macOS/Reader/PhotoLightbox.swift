import SillKit
import SwiftUI

/// Web `Panels.lightbox`: a photo card opens on a black page. Place and date with the close
/// button at the top; the photo with previous and next on its sides; thumbnails; the caption and
/// note; then the shared toolbar (bookmark, tags, read later) in the dark colors. ← and → step
/// through the photos. Saving tags returns to the same photo.
struct PhotoLightbox: View {
  let card: CardModel
  let state: CardState
  @Environment(Workspace.self) private var workspace
  @Environment(Reader.self) private var reader
  @Environment(Panels.self) private var panels
  @State private var index = 0
  @FocusState private var focused: Bool

  var body: some View {
    let photos = Self.photos(card)
    let current = min(max(0, index), max(0, photos.count - 1))
    VStack(spacing: 0) {
      top
      stage(photos, current: current)
      if photos.count > 1 { thumbs(photos, current: current) }
      if let caption = card.caption, !caption.isEmpty {
        Text(caption)
          .font(.sans(AppleMetrics.font14))
          .foregroundStyle(AppleColors.fixedWhite75)
          .multilineTextAlignment(.center)
          .padding(.vertical, AppleMetrics.space12)
          .padding(.horizontal, AppleMetrics.space20)
      }
      if !state.note.isEmpty {
        NoteBox(note: state.note)
          .padding(.vertical, AppleMetrics.space12)
          .padding(.horizontal, AppleMetrics.space20)
          .environment(\.colorScheme, .dark)
      }
      let tools = ReaderTools.actions(
        card: card, state: state, hidden: workspace.preferences.hiddenActions
      ).filter { !$0.own }
      if !tools.isEmpty {
        ReaderToolbar(card: card, state: state, actions: tools)
          .environment(\.colorScheme, .dark)
          .padding(.bottom, AppleMetrics.space16)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(AppleColors.fixedPhotoCanvas)
    .foregroundStyle(AppleColors.fixedWhite)
    .focusable()
    .focusEffectDisabled()
    .focused($focused)
    .onAppear { focused = true }
    .onKeyPress(.leftArrow) { step(-1, count: photos.count) }
    .onKeyPress(.rightArrow) { step(1, count: photos.count) }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(card.title)
    .accessibilityAddTraits(.isModal)
  }

  private var top: some View {
    HStack {
      Text(
        [card.location, card.takenAt.flatMap { Format.publication($0) }].compactMap { $0 }
          .filter { !$0.isEmpty }.joined(separator: " · ")
      )
      .font(.sans(AppleMetrics.font13))
      .foregroundStyle(AppleColors.fixedWhite75)
      Spacer(minLength: 0)
      DarkIconButton(icon: "x", label: Copy.text("web.photo.close")) { reader.close() }
    }
    .padding(.vertical, AppleMetrics.space16)
    .padding(.horizontal, AppleMetrics.space20)
  }

  private func stage(_ photos: [String], current: Int) -> some View {
    HStack(spacing: AppleMetrics.space12) {
      if photos.count > 1 {
        DarkIconButton(icon: "back", label: Copy.text("web.photo.previous")) {
          _ = step(-1, count: photos.count)
        }
      }
      Group {
        if let image = photos.isEmpty ? nil : Cover.image(photos[current]) {
          Image(nsImage: image).resizable().scaledToFit()
            .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.lightboxImageRadius))
        } else {
          Cover.tone(photos.isEmpty ? nil : photos[current])
            .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.lightboxImageRadius))
        }
      }
      // Web fades the new photo in (`fast`). Only a change of photo fades: a transition here
      // could leave the first photo at zero opacity when the page itself appears.
      .modifier(ContentFade(value: current))
      .frame(maxWidth: AppleMetrics.lightboxImageMaxWidth, maxHeight: .infinity)
      .accessibilityElement()
      .accessibilityLabel(
        card.title + Copy.text("web.photo.altIndexPrefix") + "\(current + 1)"
          + Copy.text("web.common.cardCountSuffix"))
      if photos.count > 1 {
        DarkIconButton(icon: "arrow", label: Copy.text("web.photo.next")) {
          _ = step(1, count: photos.count)
        }
      }
    }
    .padding(.horizontal, AppleMetrics.space20)
    .frame(maxHeight: .infinity)
  }

  private func thumbs(_ photos: [String], current: Int) -> some View {
    HStack(spacing: AppleMetrics.space8) {
      ForEach(photos.indices, id: \.self) { n in
        Button {
          index = n
        } label: {
          CoverImage(name: photos[n])
            .frame(width: AppleMetrics.lightboxThumbSize, height: AppleMetrics.lightboxThumbSize)
            .clipShape(RoundedRectangle(cornerRadius: AppleMetrics.lightboxThumbRadius))
            .overlay(
              RoundedRectangle(cornerRadius: AppleMetrics.lightboxThumbRadius)
                .strokeBorder(
                  n == current ? AppleColors.fixedWhite : .clear,
                  lineWidth: AppleMetrics.selectionLineWidth)
            )
            .opacity(n == current ? 1 : AppleMetrics.lightboxThumbOpacity)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(
          Copy.text("web.photo.indexPrefix") + "\(n + 1)" + Copy.text("web.common.cardCountSuffix")
        )
        .accessibilityAddTraits(n == current ? .isSelected : [])
      }
    }
    .padding(AppleMetrics.space16)
  }

  private func step(_ delta: Int, count: Int) -> KeyPress.Result {
    guard count > 1, panels.kind == nil else { return .ignored }
    index = (index + delta + count) % count
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
        .foregroundStyle(AppleColors.fixedWhite)
        .frame(width: AppleMetrics.iconButton, height: AppleMetrics.iconButton)
        .background(Circle().fill(hovered ? AppleColors.fixedWhite12 : .clear))
        .contentShape(Circle())
    }
    .buttonStyle(IconPress(highlight: false))
    .onHover { hovered = $0 }
    .accessibilityLabel(label)
  }
}

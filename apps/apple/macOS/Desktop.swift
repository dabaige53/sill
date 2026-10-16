import SillKit
import SwiftUI

struct Desktop: View {
  @EnvironmentObject var model: Workspace
  @Environment(\.accessibilityReduceMotion) var reduceMotion
  @State private var deleting: Card?
  @FocusState private var searchFocused: Bool
  var body: some View {
    ZStack {
      AppleColors.canvas.ignoresSafeArea()
      VStack(spacing: AppleMetrics.zero) {
        if let error = model.error {
          HStack {
            Text(error).font(.callout).textSelection(.enabled)
            Spacer()
            Button(Copy.appleRetry) { model.refresh() }.disabled(model.loading)
          }.padding(AppleMetrics.space14).background(
            AppleColors.warning.opacity(AppleMetrics.warningOpacity)
          ).accessibilityElement(
            children: .contain)
        }
        if model.searchPresented {
          HStack {
            Image(systemName: "magnifyingglass")
            TextField(Copy.appleSearch, text: $model.query).focused($searchFocused).task {
              try? await Task.sleep(for: .milliseconds(AppleMetrics.searchDelay))
              guard !Task.isCancelled else { return }
              searchFocused = true
            }.onDisappear { searchFocused = false }.onChange(of: model.searchFocusRequest) {
              searchFocused = true
            }
            Picker(Copy.appleScope, selection: $model.filter) {
              ForEach([Copy.appleAll, Copy.appleBookmarks, Copy.appleLater], id: \.self) {
                Text($0)
              }
            }.frame(width: AppleMetrics.filterWidth)
            Button(Copy.appleHideSearch) {
              model.searchPresented = false
              model.query = ""
              model.filter = Copy.appleAll
            }
          }.padding().background(.regularMaterial)
        }
        if model.loading && model.cards.isEmpty {
          Spacer()
          ProgressView(Copy.appleOpening)
          Spacer()
        } else if model.visible.isEmpty {
          Spacer()
          VStack(spacing: AppleMetrics.space16) {
            Image(systemName: model.cards.isEmpty ? "square.grid.2x2" : "magnifyingglass").font(
              .system(size: AppleMetrics.font36, weight: .ultraLight)
            ).foregroundStyle(AppleColors.secondary)
            Text(model.cards.isEmpty ? Copy.appleEmptyTitle : Copy.appleNoResults).font(.title2)
            Text(model.cards.isEmpty ? Copy.appleEmptyBody : Copy.appleNoResultsBody)
              .foregroundStyle(AppleColors.secondary)
            if model.cards.isEmpty {
              Button(Copy.appleFirstNote) { model.edit() }.buttonStyle(.borderedProminent).disabled(
                !model.ready)
            }
          }.padding(AppleMetrics.space40)
          Spacer()
        } else {
          ScrollView {
            LazyVGrid(
              columns: [
                GridItem(
                  .adaptive(minimum: AppleMetrics.cardMinWidth, maximum: AppleMetrics.cardMaxWidth),
                  spacing: AppleMetrics.space22)
              ],
              alignment: .center, spacing: AppleMetrics.space22
            ) {
              ForEach(model.visible) { card in
                Button {
                  model.selected = card.id
                } label: {
                  tile(card)
                }.buttonStyle(.plain)
                  .contextMenu {
                    Button(Copy.appleView) { model.selected = card.id }
                    if card.type == "note" { Button(Copy.appleEditNote) { model.edit(card) } }
                    Button(Copy.appleToggleBookmarkMenu) { model.toggle("bookmarked", card: card) }
                    Button(Copy.appleToggleLaterMenu) { model.toggle("later", card: card) }
                    Button(Copy.appleToggleReadMenu) { model.toggle("read", card: card) }
                    Divider()
                    Button(Copy.appleDelete, role: .destructive) { deleting = card }
                  }
                  .accessibilityLabel(card.title + ", " + card.source).accessibilityHint(
                    Copy.appleOpenHint)
              }
            }.padding(AppleMetrics.space32)
          }
        }
      }
    }
    .frame(minWidth: AppleMetrics.desktopMinWidth, minHeight: AppleMetrics.desktopMinHeight)
    .toolbar {
      ToolbarItemGroup {
        Button {
          model.searchPresented.toggle()
        } label: {
          Image(systemName: "magnifyingglass")
        }.help(Copy.appleSearchHelp).accessibilityLabel(Copy.appleSearch)
        Button {
          model.refresh()
        } label: {
          Image(systemName: "arrow.clockwise")
        }.help(model.loading ? Copy.appleRefreshing : Copy.appleRefreshHelp).accessibilityLabel(
          model.loading ? Copy.appleRefreshing : Copy.appleRefresh
        ).keyboardShortcut("r").disabled(model.loading)
        Button {
          model.edit()
        } label: {
          Image(systemName: "square.and.pencil")
        }.help(Copy.appleNewNoteHelp).accessibilityLabel(Copy.appleNewNote).keyboardShortcut("n")
          .disabled(!model.ready)
      }
    }
    .sheet(
      item: Binding(
        get: { model.selected.flatMap { id in model.cards.first { $0.id == id } } },
        set: { model.selected = $0?.id })
    ) { card in reader(card) }
    .sheet(item: $model.draft, onDismiss: { model.persistDraft() }) { _ in
      Editor().environmentObject(model).interactiveDismissDisabled()
    }
    .confirmationDialog(
      Copy.appleDeleteConfirm,
      isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
      titleVisibility: .visible
    ) {
      Button(Copy.appleDeleteCard, role: .destructive) {
        if let deleting { model.delete(deleting) }
        deleting = nil
      }
      Button(Copy.appleCancel, role: .cancel) { deleting = nil }
    }
    .animation(
      reduceMotion ? nil : .easeOut(duration: AppleMetrics.searchAnimation),
      value: model.searchPresented)
  }
  func tile(_ card: Card) -> some View {
    let read = model.items[card.id]?["read"]?.bool == true
    return VStack(alignment: .leading, spacing: AppleMetrics.space12) {
      HStack {
        Image(systemName: card.type == "note" ? "text.alignleft" : "doc.text")
        Text(card.source)
        Spacer()
        if model.items[card.id]?["bookmarked"]?.bool == true {
          Image(systemName: "bookmark.fill").accessibilityLabel(Copy.appleBookmarked)
        }
        if model.items[card.id]?["later"]?.bool == true {
          Image(systemName: "eyeglasses").accessibilityLabel(Copy.appleLater)
        }
      }.font(.system(size: AppleMetrics.font12)).foregroundStyle(AppleColors.secondary)
      Text(card.title).font(.system(size: AppleMetrics.font19, weight: .semibold)).foregroundStyle(
        read ? AppleColors.secondary : AppleColors.primary
      ).lineLimit(3).frame(maxWidth: .infinity, alignment: .leading)
      if !(card.summary.isEmpty && card.body.isEmpty) {
        Text(card.summary.isEmpty ? card.body : card.summary).font(
          .system(size: AppleMetrics.font14)
        )
        .foregroundStyle(AppleColors.secondary).lineSpacing(AppleMetrics.space5).lineLimit(5)
      }
      Spacer(minLength: AppleMetrics.zero)
    }.padding(AppleMetrics.space22).frame(
      maxWidth: .infinity, minHeight: AppleMetrics.cardMinHeight, alignment: .topLeading
    )
    .background(
      read ? AppleColors.readCard : AppleColors.card,
      in: RoundedRectangle(cornerRadius: AppleMetrics.space22)
    )
    .overlay(
      RoundedRectangle(cornerRadius: AppleMetrics.space22).strokeBorder(
        AppleColors.primary.opacity(AppleMetrics.borderOpacity))
    )
    .shadow(
      color: AppleColors.shadow.opacity(read ? AppleMetrics.zero : AppleMetrics.shadowOpacity),
      radius: AppleMetrics.space12, y: AppleMetrics.space5)
  }
  func reader(_ card: Card) -> some View {
    VStack(spacing: AppleMetrics.zero) {
      HStack {
        Text(card.source).foregroundStyle(AppleColors.secondary)
        Spacer()
        Button {
          model.toggle("bookmarked", card: card)
        } label: {
          Image(
            systemName: model.items[card.id]?["bookmarked"]?.bool == true
              ? "bookmark.fill" : "bookmark")
        }.accessibilityLabel(Copy.appleToggleBookmark)
        Button {
          model.toggle("later", card: card)
        } label: {
          Image(systemName: "eyeglasses")
        }.accessibilityLabel(Copy.appleToggleLater)
        Button {
          model.toggle("read", card: card)
        } label: {
          Image(
            systemName: model.items[card.id]?["read"]?.bool == true
              ? "checkmark.circle.fill" : "checkmark.circle")
        }.accessibilityLabel(Copy.appleToggleRead)
        if card.type == "note" {
          Button(Copy.appleEdit) {
            model.selected = nil
            model.edit(card)
          }
        }
        Button(Copy.appleCloseReader) { model.selected = nil }.keyboardShortcut(.cancelAction)
      }.padding(AppleMetrics.space20)
      Divider()
      ScrollView {
        VStack(alignment: .leading, spacing: AppleMetrics.space24) {
          Text(card.title).font(.system(size: AppleMetrics.font30, weight: .semibold))
          if !card.summary.isEmpty && !card.body.hasPrefix(card.summary) {
            Text(card.summary).foregroundStyle(AppleColors.secondary)
          }
          Text(card.body).font(.system(size: AppleMetrics.font17)).lineSpacing(AppleMetrics.space10)
            .frame(
              maxWidth: .infinity, alignment: .leading)
          if let tasks = card.value.tasks {
            ForEach(Array(tasks.enumerated()), id: \.offset) { _, task in Text("• " + task.text) }
          }
          if let link = card.value.url, let url = URL(string: link),
            ["https", "http"].contains(url.scheme ?? "")
          {
            Link(Copy.appleOriginal, destination: url)
          }
        }.textSelection(.enabled).padding(AppleMetrics.space36).frame(
          maxWidth: .infinity, alignment: .leading)
      }
    }.frame(width: AppleMetrics.readerWidth, height: AppleMetrics.readerHeight)
  }
}

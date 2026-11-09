import AppKit
import QuickLook
import QuickLookThumbnailing
import SwiftUI

struct LibraryView: View {
    let library: Library
    @State private var category: Category? = .all
    @State private var query = ""
    @State private var preview: URL?

    private enum Category: Hashable {
        case all
        case kind(MediaKind)
    }

    private var title: String {
        if case .kind(let kind) = category { return kind.title }
        return "Медиатека"
    }

    private var visibleItems: [MediaItem] {
        let search = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return library.items.filter { item in
            if case .kind(let kind) = category, item.kind != kind { return false }
            return search.isEmpty || item.name.localizedStandardContains(search)
        }
    }

    var body: some View {
        NavigationSplitView {
            List(selection: $category) {
                Section("Коллекция") {
                    Label("Все медиа", systemImage: "square.grid.2x2")
                        .tag(Category.all)
                    ForEach(MediaKind.allCases) { kind in
                        Label(kind.title, systemImage: kind.icon)
                            .tag(Category.kind(kind))
                    }
                }
            }
            .navigationSplitViewColumnWidth(min: 165, ideal: 205)
        } detail: {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    if library.items.isEmpty {
                        welcome
                    } else if visibleItems.isEmpty {
                        ContentUnavailableView(
                            query.isEmpty ? "Здесь пока пусто" : "Ничего не найдено",
                            systemImage: query.isEmpty ? "square.grid.2x2" : "magnifyingglass"
                        )
                        .frame(maxWidth: .infinity)
                    } else {
                        Text("Файлов: \(visibleItems.count)")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 165), spacing: 16)], spacing: 16) {
                            ForEach(visibleItems) { item in
                                MediaCard(item: item) { open(item) }
                                    .contextMenu {
                                        Button("Просмотреть") { open(item) }
                                        Button("Показать в Finder") {
                                            NSWorkspace.shared.activateFileViewerSelecting([item.url])
                                        }
                                        Button("Убрать из медиатеки") { library.remove(item) }
                                    }
                            }
                        }
                    }
                }
                .padding(24)
            }
            .background(.background)
            .navigationTitle(title)
            .searchable(text: $query, prompt: "Поиск по имени файла")
            .toolbar {
                ToolbarItem {
                    if library.isImporting {
                        ProgressView().controlSize(.small)
                            .accessibilityLabel("Добавление медиа")
                    } else {
                        Button(action: library.chooseMedia) {
                            Label("Добавить медиа", systemImage: "plus")
                        }
                        .help("Добавить медиа")
                    }
                }
            }
        }
        .quickLookPreview($preview)
        .alert("MediaChips", isPresented: Binding(
            get: { library.message != nil },
            set: { if !$0 { library.message = nil } }
        )) {
            Button("ОК") { library.message = nil }
        } message: {
            Text(library.message ?? "")
        }
    }

    private var welcome: some View {
        VStack(alignment: .leading, spacing: 18) {
            Label("MEDIACHIPS", systemImage: "square.stack.fill")
                .font(.caption.weight(.semibold))
                .tracking(3)
                .foregroundStyle(Color(red: 0.82, green: 0.76, blue: 1))
            Text("Ваши медиа\nв одном месте")
                .font(.system(size: 46, weight: .bold))
                .tracking(-1.8)
                .accessibilityAddTraits(.isHeader)
            Text("Добавьте видео, изображения и аудио.\nФайлы останутся в своих папках.")
                .font(.title3)
                .foregroundStyle(.white.opacity(0.8))
            Button(action: library.chooseMedia) {
                Label("Добавить медиа", systemImage: "plus")
            }
            .buttonStyle(.borderedProminent)
            .tint(Color(red: 0.40, green: 0.28, blue: 0.72))
            .controlSize(.large)
            .disabled(library.isImporting)
        }
        .padding(36)
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            ZStack(alignment: .trailing) {
                LinearGradient(
                    colors: [Color(red: 0.13, green: 0.09, blue: 0.23), Color(red: 0.28, green: 0.18, blue: 0.45)],
                    startPoint: .bottomLeading, endPoint: .topTrailing
                )
                Image(systemName: "play.rectangle.on.rectangle.fill")
                    .font(.system(size: 178, weight: .thin))
                    .rotationEffect(.degrees(-13))
                    .foregroundStyle(.white.opacity(0.09))
                    .padding(.trailing, 26)
                    .accessibilityHidden(true)
            }
        }
        .clipShape(.rect(cornerRadius: 24))
    }

    private func open(_ item: MediaItem) {
        guard FileManager.default.isReadableFile(atPath: item.url.path) else {
            library.message = "Файл недоступен. Проверьте, что он на прежнем месте и диск подключён."
            return
        }
        preview = item.url
    }
}

private struct MediaCard: View {
    let item: MediaItem
    let open: () -> Void
    var body: some View {
        Button(action: open) {
            VStack(alignment: .leading, spacing: 8) {
                MediaThumbnail(item: item)
                Text(item.name)
                    .font(.callout.weight(.medium))
                    .lineLimit(1)
            }
        }
        .buttonStyle(.plain)
        .help(item.name)
    }
}

struct MediaThumbnail: View {
    let item: MediaItem
    @State private var thumbnail: NSImage?

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                item.kind.color.opacity(0.13)
                if let thumbnail {
                    Image(nsImage: thumbnail)
                        .resizable()
                        .scaledToFill()
                        .frame(width: geometry.size.width, height: geometry.size.height)
                } else {
                    Image(systemName: item.kind.icon)
                        .font(.largeTitle)
                        .foregroundStyle(item.kind.color)
                }
            }
        }
        .aspectRatio(16 / 10.0, contentMode: .fit)
        .clipShape(.rect(cornerRadius: 10))
        .task(id: item.id) {
            let request = QLThumbnailGenerator.Request(
                fileAt: item.url, size: CGSize(width: 360, height: 225),
                scale: 2, representationTypes: .thumbnail
            )
            thumbnail = try? await QLThumbnailGenerator.shared.generateBestRepresentation(for: request).nsImage
        }
    }
}

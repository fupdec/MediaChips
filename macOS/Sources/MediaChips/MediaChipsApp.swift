import AppKit
import SwiftUI
import UniformTypeIdentifiers

@main
struct MediaChipsApp: App {
    @State private var library = Library()

    var body: some Scene {
        WindowGroup("MediaChips") {
            TabView {
                ServerLibraryView()
                    .tabItem { Label("Каталог сервера", systemImage: "server.rack") }
                LibraryView(library: library)
                    .tabItem { Label("Локальные файлы", systemImage: "folder") }
            }
            .frame(minWidth: 740, minHeight: 500)
        }
        .defaultSize(width: 1050, height: 720)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("Добавить медиа…", action: library.chooseMedia)
                    .keyboardShortcut("o")
                    .disabled(library.isImporting)
            }
        }
    }
}

enum MediaKind: String, CaseIterable, Codable, Identifiable, Sendable {
    case video, image, audio

    var id: Self { self }

    var title: String {
        switch self {
        case .video: "Видео"
        case .image: "Изображения"
        case .audio: "Аудио"
        }
    }

    var icon: String {
        switch self {
        case .video: "film"
        case .image: "photo"
        case .audio: "waveform"
        }
    }

    var color: Color {
        switch self {
        case .video: .indigo
        case .image: .purple
        case .audio: .teal
        }
    }
}

struct MediaItem: Codable, Identifiable, Sendable {
    let url: URL
    let kind: MediaKind

    var id: URL { url }
    var name: String { url.deletingPathExtension().lastPathComponent }

    nonisolated static func scan(_ urls: [URL]) -> [MediaItem] {
        let keys: Set<URLResourceKey> = [.isDirectoryKey, .isRegularFileKey, .contentTypeKey]
        func item(at url: URL) -> MediaItem? {
            guard let values = try? url.resourceValues(forKeys: keys),
                  values.isRegularFile == true, let type = values.contentType else { return nil }
            let kind: MediaKind
            if type.conforms(to: .movie) || type.conforms(to: .video) {
                kind = .video
            } else if type.conforms(to: .image) {
                kind = .image
            } else if type.conforms(to: .audio) {
                kind = .audio
            } else {
                return nil
            }
            return MediaItem(url: url.standardizedFileURL, kind: kind)
        }

        return urls.flatMap { url -> [MediaItem] in
            if (try? url.resourceValues(forKeys: keys).isDirectory) == true {
                guard let entries = FileManager.default.enumerator(
                    at: url, includingPropertiesForKeys: Array(keys),
                    options: [.skipsHiddenFiles, .skipsPackageDescendants]
                ) else { return [] }
                return entries.compactMap { ($0 as? URL).flatMap(item(at:)) }
            }
            return item(at: url).map { [$0] } ?? []
        }
    }
}

@MainActor @Observable
final class Library {
    private(set) var items: [MediaItem] = []
    private(set) var isImporting = false
    var message: String?

    private let catalogURL = URL.applicationSupportDirectory
        .appending(path: "MediaChips Native/library.json")

    init() {
        do {
            items = try JSONDecoder().decode([MediaItem].self, from: Data(contentsOf: catalogURL))
        } catch let error as CocoaError where error.code == .fileReadNoSuchFile {
            // The catalog is created on first import.
        } catch {
            message = "Не удалось открыть медиатеку. \(error.localizedDescription)"
        }
    }

    func chooseMedia() {
        guard !isImporting else { return }
        let panel = NSOpenPanel()
        panel.title = "Добавить медиа"
        panel.prompt = "Добавить"
        panel.canChooseFiles = true
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = true
        panel.allowedContentTypes = [.image, .movie, .video, .audio]
        isImporting = true

        Task {
            defer { isImporting = false }
            guard await panel.begin() == .OK else { return }
            let urls = panel.urls
            let scanned = await Task.detached(priority: .userInitiated) {
                MediaItem.scan(urls)
            }.value
            guard !scanned.isEmpty else {
                message = "В выбранных файлах и папках нет поддерживаемых медиа."
                return
            }
            var known = Set(items.map(\.id))
            let added = scanned.filter { known.insert($0.id).inserted }
            guard !added.isEmpty else {
                message = "Эти файлы уже есть в медиатеке."
                return
            }
            save(items + added)
        }
    }

    func remove(_ item: MediaItem) {
        save(items.filter { $0.id != item.id })
    }

    private func save(_ updated: [MediaItem]) {
        do {
            try FileManager.default.createDirectory(
                at: catalogURL.deletingLastPathComponent(), withIntermediateDirectories: true
            )
            try JSONEncoder().encode(updated).write(to: catalogURL, options: .atomic)
            items = updated
        } catch {
            message = "Не удалось сохранить медиатеку. \(error.localizedDescription)"
        }
    }
}

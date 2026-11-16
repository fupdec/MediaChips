import QuickLook
import SwiftUI
import UniformTypeIdentifiers

struct ServerLibraryView: View {
    @AppStorage("mediaChipsServerAddress") private var address = MediaChipsAPI.defaultAddress
    @AppStorage("mediaChipsCatalogSortField") private var sort = CatalogSortField.id
    @AppStorage("mediaChipsCatalogSortDirection") private var direction = CatalogSortDirection.asc
    @State private var draftAddress = ""
    @State private var editingMedia: ServerMedia?
    @State private var editingAddress = false
    @State private var query = ""
    @State private var page = 1
    @State private var mediaTypes: [ServerMediaType] = []
    @State private var mediaTypeID: Int?
    @State private var hasMore = false
    @State private var items: [ServerMedia] = []
    @State private var error: String?
    @State private var fileUnavailable = false
    @State private var preview: URL?
    @State private var reload = 0
    @State private var loading = true

    private var request: Request {
        Request(address: address, query: query.trimmingCharacters(in: .whitespacesAndNewlines),
                mediaTypeID: mediaTypeID, sort: sort, direction: direction, reload: reload)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Каталог MediaChips").font(.largeTitle.bold())
                    Text(address).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Button {
                    draftAddress = address
                    editingAddress = true
                } label: {
                    Label("Адрес сервера", systemImage: "server.rack")
                }
            }

            HStack {
                TextField("Поиск по всей медиатеке", text: $query)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityLabel("Поиск по всей медиатеке")
                if request.query.isEmpty && !mediaTypes.isEmpty {
                    Picker("Тип медиа", selection: $mediaTypeID) {
                        ForEach(mediaTypes) { type in
                            Text(type.title).tag(Optional(type.id))
                        }
                    }
                    .fixedSize()

                    Menu {
                        Picker("Поле", selection: $sort) {
                            ForEach(CatalogSortField.allCases, id: \.self) { field in
                                Text(field.title).tag(field)
                            }
                        }
                        Divider()
                        Picker("Порядок", selection: $direction) {
                            ForEach(CatalogSortDirection.allCases, id: \.self) { order in
                                Text(order.title).tag(order)
                            }
                        }
                    } label: {
                        Label("Сортировка", systemImage: "arrow.up.arrow.down")
                    }
                    .fixedSize()
                    .help("\(sort.title), \(direction.title.lowercased())")
                }
            }

            if let error {
                ContentUnavailableView {
                    Label("Каталог недоступен", systemImage: "exclamationmark.circle")
                } description: {
                    Text(error)
                } actions: {
                    Button("Повторить") { reload += 1 }
                }
            } else if loading && items.isEmpty {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if items.isEmpty {
                ContentUnavailableView(query.isEmpty ? "Каталог пуст" : "Ничего не найдено", systemImage: "square.grid.2x2")
            } else {
                catalog
            }
        }
        .padding(24)
        .task(id: request) { [request] in await load(request, page: 1) }
        .quickLookPreview($preview)
        .alert("Файл недоступен на этом Mac", isPresented: $fileUnavailable) {
            Button("ОК", role: .cancel) {}
        } message: {
            Text("Проверь путь к оригиналу и подключение диска.")
        }
        .sheet(item: $editingMedia) { item in
            EditServerMediaView(address: address, id: item.id) { reload += 1 }
        }
        .sheet(isPresented: $editingAddress) {
            VStack(alignment: .leading, spacing: 16) {
                Text("Адрес сервера MediaChips").font(.headline)
                TextField(MediaChipsAPI.defaultAddress, text: $draftAddress)
                    .textFieldStyle(.roundedBorder)
                HStack {
                    Spacer()
                    Button("Отмена", role: .cancel) { editingAddress = false }
                    Button("Подключить") {
                        mediaTypeID = nil
                        mediaTypes = []
                        address = draftAddress.trimmingCharacters(in: .whitespacesAndNewlines)
                        reload += 1
                        editingAddress = false
                    }
                    .keyboardShortcut(.defaultAction)
                }
            }
            .padding(24)
            .frame(width: 420)
        }
    }

    private var catalog: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 165), spacing: 16)], spacing: 16) {
                ForEach(items) { item in
                    Button { open(item) } label: {
                        VStack(alignment: .leading, spacing: 8) {
                            ServerThumbnail(item: item, api: try? MediaChipsAPI(address: address))
                            Text(item.title).font(.callout.weight(.medium)).lineLimit(1)
                        }
                    }
                    .buttonStyle(.plain)
                    .help(item.title)
                    .contextMenu {
                        Button("Открыть") { open(item) }
                        Button("Редактировать…") { editingMedia = item }
                    }
                }
            }
            if request.query.isEmpty && hasMore {
                Button("Загрузить ещё") {
                    let current = request
                    let nextPage = page + 1
                    loading = true
                    Task { await load(current, page: nextPage) }
                }
                .disabled(loading)
                .padding()
            }
        }
    }

    private func load(_ current: Request, page nextPage: Int) async {
        guard current == request else { return }
        loading = true
        error = nil
        if nextPage == 1 {
            items = []
            hasMore = false
        }
        defer { if current == request && !Task.isCancelled { loading = false } }

        do {
            if !current.query.isEmpty { try await Task.sleep(for: .milliseconds(250)) }
            let api = try MediaChipsAPI(address: current.address)
            let loaded: [ServerMedia]
            if current.query.isEmpty {
                if nextPage == 1 {
                    let types = try await api.mediaTypes().filter { $0.hidden != true }
                    guard current == request, !Task.isCancelled else { return }
                    mediaTypes = types
                    let selected = types.first { $0.id == current.mediaTypeID }?.id ?? types.first?.id
                    if selected != current.mediaTypeID {
                        mediaTypeID = selected
                        return
                    }
                }
                guard let id = current.mediaTypeID else { return }
                loaded = try await api.catalog(
                    mediaTypeID: id, page: nextPage, sort: current.sort, direction: current.direction
                )
            } else {
                loaded = try await api.search(current.query)
            }
            guard current == request, !Task.isCancelled else { return }
            page = nextPage
            hasMore = loaded.count == MediaChipsAPI.pageSize
            if nextPage == 1 {
                items = loaded
            } else {
                let known = Set(items.map(\.id))
                items.append(contentsOf: loaded.filter { !known.contains($0.id) })
            }
        } catch {
            guard current == request, !Task.isCancelled else { return }
            self.error = error.localizedDescription
        }
    }

    private func open(_ item: ServerMedia) {
        guard let url = item.localURL, FileManager.default.isReadableFile(atPath: url.path) else {
            fileUnavailable = true
            return
        }
        preview = url
    }

    private struct Request: Equatable {
        let address: String
        let query: String
        let mediaTypeID: Int?
        let sort: CatalogSortField
        let direction: CatalogSortDirection
        let reload: Int
    }
}

private struct ServerThumbnail: View {
    let item: ServerMedia
    let api: MediaChipsAPI?

    var body: some View {
        if let url = item.localURL, let type = UTType(filenameExtension: url.pathExtension) {
            if type.conforms(to: .image), let preview = api?.imagePreview(for: item) {
                AsyncImage(url: preview) { phase in
                    GeometryReader { size in
                        if let image = phase.image {
                            image.resizable().scaledToFill()
                                .frame(width: size.size.width, height: size.size.height)
                        } else {
                            placeholder
                        }
                    }
                }
                .aspectRatio(16 / 10.0, contentMode: .fit)
                .clipShape(.rect(cornerRadius: 10))
            } else {
                let kind: MediaKind = type.conforms(to: .audio) ? .audio : .video
                MediaThumbnail(item: MediaItem(url: url, kind: kind))
            }
        } else {
            placeholder.aspectRatio(16 / 10.0, contentMode: .fit)
        }
    }

    private var placeholder: some View {
        RoundedRectangle(cornerRadius: 10)
            .fill(.quaternary)
            .overlay { Image(systemName: "square.stack").foregroundStyle(.secondary) }
    }
}

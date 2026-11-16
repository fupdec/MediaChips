import SwiftUI

struct EditServerMediaView: View {
    let address: String
    let id: Int
    let onSaved: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var original: ServerMedia?
    @State private var name = ""
    @State private var rating = 0.0
    @State private var favorite = false
    @State private var bookmark = ""
    @State private var error: String?
    @State private var saving = false
    @State private var attempt = 0
    @State private var savedTags: [ServerTag] = []
    @State private var tags: [ServerTag] = []
    @State private var tagQuery = ""
    @State private var tagResults: [ServerTag] = []
    @State private var tagSearchError: String?
    @State private var searchingTags = false

    private var normalizedTagQuery: String {
        tagQuery.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var hasTagChanges: Bool {
        Set(tags.map(\.id)) != Set(savedTags.map(\.id))
    }

    private var changes: [String: Any] {
        guard let original else { return [:] }
        var result: [String: Any] = [:]
        if name != (original.name ?? "") {
            let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
            result["name"] = trimmed.isEmpty ? NSNull() as Any : trimmed
        }
        if rating != (original.rating ?? 0) { result["rating"] = rating }
        if favorite != (original.favorite ?? false) { result["favorite"] = favorite }
        if bookmark != (original.bookmark ?? "") {
            result["bookmark"] = bookmark.isEmpty ? NSNull() as Any : bookmark
        }
        return result
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Редактировать медиа").font(.headline)
            if let original {
                Form {
                    TextField("Название", text: $name)
                    Stepper(value: $rating, in: 0...5, step: 0.5) {
                        Text("Рейтинг: \(rating.formatted()) из 5")
                    }
                    Toggle("Избранное", isOn: $favorite)
                    TextField("Заметка", text: $bookmark, axis: .vertical)
                        .lineLimit(3...6)
                    tagFields
                    if let path = original.path {
                        Text(path).font(.caption).foregroundStyle(.secondary)
                            .textSelection(.enabled)
                    }
                }
                .disabled(saving)
            } else if error == nil {
                ProgressView().controlSize(.small)
            }
            if let error {
                Text(error).foregroundStyle(.red)
            }
            HStack {
                Spacer()
                Button("Отмена", role: .cancel) { dismiss() }.disabled(saving)
                if original == nil && error != nil {
                    Button("Повторить") { attempt += 1 }
                } else {
                    Button(saving ? "Сохранение…" : "Сохранить") {
                        let payload = changes
                        saving = true
                        Task { await save(payload) }
                    }
                    .keyboardShortcut(.defaultAction)
                    .disabled(saving || (changes.isEmpty && !hasTagChanges))
                }
            }
        }
        .padding(24)
        .frame(width: 480, height: 540)
        .interactiveDismissDisabled(saving)
        .task(id: attempt) {
            error = nil
            do {
                let api = try MediaChipsAPI(address: address)
                async let details = api.media(id: id)
                async let assignments = api.assignedTags(mediaID: id)
                let (item, assigned) = try await (details, assignments)
                guard !Task.isCancelled else { return }
                savedTags = assigned
                tags = assigned
                name = item.name ?? ""
                rating = item.rating ?? 0
                favorite = item.favorite ?? false
                bookmark = item.bookmark ?? ""
                original = item
            } catch {
                if !Task.isCancelled { self.error = error.localizedDescription }
            }
        }
    }

    private var tagFields: some View {
        Section("Теги") {
            if tags.isEmpty {
                Text("Теги не назначены").foregroundStyle(.secondary)
            }
            ForEach(tags) { tag in
                HStack {
                    Text(tag.title)
                    Spacer()
                    Button {
                        tags.removeAll { $0.id == tag.id }
                    } label: {
                        Image(systemName: "minus.circle")
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel("Снять тег «\(tag.title)»")
                }
            }
            TextField("Найти тег", text: $tagQuery)
            if !normalizedTagQuery.isEmpty {
                if searchingTags {
                    ProgressView().controlSize(.small)
                } else if let tagSearchError {
                    Text(tagSearchError).foregroundStyle(.red)
                } else {
                    let assigned = Set(tags.map(\.id))
                    let available = tagResults.filter { $0.metaId != nil && !assigned.contains($0.id) }
                    if available.isEmpty {
                        Text("Нет подходящих тегов").foregroundStyle(.secondary)
                    }
                    ForEach(available) { tag in
                        Button {
                            tags.append(tag)
                            tagQuery = ""
                        } label: {
                            Label(tag.title, systemImage: "plus.circle")
                        }
                        .buttonStyle(.borderless)
                    }
                }
            }
        }
        .task(id: normalizedTagQuery) { [query = normalizedTagQuery] in
            tagResults = []
            tagSearchError = nil
            searchingTags = !query.isEmpty
            guard searchingTags else { return }
            defer {
                if !Task.isCancelled && query == normalizedTagQuery { searchingTags = false }
            }
            do {
                try await Task.sleep(for: .milliseconds(250))
                let results = try await MediaChipsAPI(address: address).searchTags(query)
                guard !Task.isCancelled, query == normalizedTagQuery else { return }
                tagResults = results
            } catch {
                if !Task.isCancelled && query == normalizedTagQuery {
                    tagSearchError = error.localizedDescription
                }
            }
        }
    }

    private func save(_ payload: [String: Any]) async {
        defer { saving = false }
        error = nil
        do {
            let api = try MediaChipsAPI(address: address)
            let previous = Set(savedTags.map(\.id))
            let desired = Set(tags.map(\.id))
            for tag in tags where !previous.contains(tag.id) {
                try await api.assignTag(tag, mediaID: id)
                savedTags.append(tag)
                onSaved()
            }
            for tag in savedTags.filter({ !desired.contains($0.id) }) {
                try await api.removeTag(tag, mediaID: id)
                savedTags.removeAll { $0.id == tag.id }
                onSaved()
            }
            if !payload.isEmpty {
                try await api.updateMedia(id: id, changes: payload)
                onSaved()
            }
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

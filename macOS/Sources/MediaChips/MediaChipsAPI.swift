import Foundation

struct ServerMedia: Decodable, Identifiable {
    let id: Int
    let path: String?
    let name: String?
    let rating: Double?
    let favorite: Bool?
    let bookmark: String?

    var title: String {
        if let name, !name.isEmpty { return name }
        return localURL?.lastPathComponent ?? "Медиа №\(id)"
    }

    var localURL: URL? {
        guard let path, path.hasPrefix("/") else { return nil }
        return URL(fileURLWithPath: path)
    }
}

struct ServerMediaType: Decodable, Identifiable {
    let id: Int
    let name: String?
    let type: String?
    let hidden: Bool?

    var title: String { name ?? type ?? "Тип №\(id)" }
}

enum CatalogSortField: String, CaseIterable {
    case id, name, createdAt, mediaCreatedAt, filesize, rating, views

    var title: String {
        switch self {
        case .id: "ID"
        case .name: "Название"
        case .createdAt: "Дата добавления"
        case .mediaCreatedAt: "Дата создания файла"
        case .filesize: "Размер файла"
        case .rating: "Рейтинг"
        case .views: "Просмотры"
        }
    }
}

enum CatalogSortDirection: String, CaseIterable {
    case asc, desc

    var title: String {
        switch self {
        case .asc: "По возрастанию"
        case .desc: "По убыванию"
        }
    }
}

struct ServerTag: Decodable, Identifiable {
    let id: Int
    let name: String?
    let metaId: Int?

    var title: String { name ?? "Тег №\(id)" }
}

struct MediaChipsAPI {
    static let defaultAddress = "http://127.0.0.1:12321"
    static let pageSize = 48
    private let baseURL: URL

    init(address: String) throws {
        guard let components = URLComponents(string: address.trimmingCharacters(in: .whitespacesAndNewlines)),
              ["http", "https"].contains(components.scheme?.lowercased() ?? ""),
              ["127.0.0.1", "localhost", "::1", "[::1]"].contains(components.host?.lowercased() ?? ""),
              components.user == nil, components.password == nil,
              components.query == nil, components.fragment == nil,
              components.path.isEmpty || components.path == "/",
              let url = components.url else {
            throw APIError.invalidAddress
        }
        baseURL = url
    }

    func mediaTypes() async throws -> [ServerMediaType] {
        let request = URLRequest(url: baseURL.appending(path: "api/MediaType"), timeoutInterval: 15)
        return try await decode([ServerMediaType].self, request: request)
    }

    func catalog(
        mediaTypeID: Int, page: Int, sort: CatalogSortField, direction: CatalogSortDirection
    ) async throws -> [ServerMedia] {
        try await post("api/Media/items", body: [
            "mediaTypeId": mediaTypeID, "page": page, "limit": Self.pageSize, "skipTotals": true,
            "sortBy": sort.rawValue, "direction": direction.rawValue
        ])
    }

    func search(_ query: String) async throws -> [ServerMedia] {
        try await post("api/home/search/media", body: ["q": query, "limit": Self.pageSize])
    }

    func media(id: Int) async throws -> ServerMedia {
        let request = URLRequest(url: baseURL.appending(path: "api/Media/\(id)"), timeoutInterval: 15)
        guard let item = try await decode(ServerMedia?.self, request: request) else {
            throw APIError.status(404)
        }
        return item
    }

    func updateMedia(id: Int, changes: [String: Any]) async throws {
        var request = URLRequest(url: baseURL.appending(path: "api/Media/\(id)"), timeoutInterval: 15)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: changes)
        _ = try await decode([Int].self, request: request)
    }

    func assignedTags(mediaID: Int) async throws -> [ServerTag] {
        struct Link: Decodable { let tag: ServerTag? }
        var url = URLComponents(url: baseURL.appending(path: "api/TagsInMedia"), resolvingAgainstBaseURL: false)
        url?.queryItems = [URLQueryItem(name: "mediaId", value: String(mediaID))]
        guard let endpoint = url?.url else { throw URLError(.badURL) }
        let links = try await decode([Link].self, request: URLRequest(url: endpoint, timeoutInterval: 15))
        var seen = Set<Int>()
        return links.compactMap(\.tag).filter { seen.insert($0.id).inserted }
    }

    func searchTags(_ query: String) async throws -> [ServerTag] {
        struct Results: Decodable { let items: [ServerTag] }
        let request = try postRequest("api/home/search/tags", body: ["q": query, "limit": 20])
        return try await decode(Results.self, request: request).items
    }

    func assignTag(_ tag: ServerTag, mediaID: Int) async throws {
        guard let metaID = tag.metaId else { throw URLError(.badServerResponse) }
        let request = try postRequest("api/TagsInMedia/createOne", body: [
            "mediaId": mediaID, "tagId": tag.id, "metaId": metaID
        ])
        _ = try await responseData(for: request)
    }

    func removeTag(_ tag: ServerTag, mediaID: Int) async throws {
        let request = try postRequest("api/TagsInMedia/deleteFromMedia", body: [
            "mediaId": mediaID, "tagId": tag.id
        ])
        _ = try await responseData(for: request)
    }

    func imagePreview(for item: ServerMedia) -> URL? {
        guard let path = item.localURL?.path else { return nil }
        var components = URLComponents(url: baseURL.appending(path: "api/get-file"), resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "url", value: path), URLQueryItem(name: "maxEdge", value: "384")]
        return components?.url
    }

    private func post(_ endpoint: String, body: [String: Any]) async throws -> [ServerMedia] {
        try await decode(ItemsResponse.self, request: postRequest(endpoint, body: body)).items
    }

    private func postRequest(_ endpoint: String, body: [String: Any]) throws -> URLRequest {
        var request = URLRequest(url: baseURL.appending(path: endpoint), timeoutInterval: 15)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        return request
    }

    private func decode<T: Decodable>(_ type: T.Type, request: URLRequest) async throws -> T {
        try await JSONDecoder().decode(type, from: responseData(for: request))
    }

    private func responseData(for request: URLRequest) async throws -> Data {
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        guard (200..<300).contains(response.statusCode) else { throw APIError.status(response.statusCode) }
        return data
    }

    private struct ItemsResponse: Decodable {
        let items: [ServerMedia]
    }

    private enum APIError: LocalizedError {
        case invalidAddress
        case status(Int)

        var errorDescription: String? {
            switch self {
            case .invalidAddress: "Укажи адрес локального сервера, например \(MediaChipsAPI.defaultAddress)."
            case .status(let code): "Сервер вернул HTTP \(code)."
            }
        }
    }
}

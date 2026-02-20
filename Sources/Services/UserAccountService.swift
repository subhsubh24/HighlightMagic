import Foundation
import Security

@Observable
final class UserAccountService {
    static let shared = UserAccountService()

    var userID: String
    var savedProjects: [SavedProject] = []

    private let iCloudStore = NSUbiquitousKeyValueStore.default
    private let projectsDirectory: URL

    init() {
        // Load or create anonymous user ID from Keychain
        if let existing = KeychainHelper.load(key: "user_anonymous_id") {
            userID = existing
        } else {
            let newID = UUID().uuidString
            KeychainHelper.save(key: "user_anonymous_id", value: newID)
            userID = newID
        }

        // Setup projects directory
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        projectsDirectory = docs.appendingPathComponent("Projects", isDirectory: true)
        try? FileManager.default.createDirectory(
            at: projectsDirectory,
            withIntermediateDirectories: true
        )

        loadProjects()
        syncFromiCloud()
    }

    // MARK: - Project Management

    func saveProject(_ project: SavedProject) {
        if let index = savedProjects.firstIndex(where: { $0.id == project.id }) {
            savedProjects[index] = project
        } else {
            savedProjects.append(project)
        }

        persistProjects()
        syncToiCloud()
    }

    func deleteProject(id: UUID) {
        savedProjects.removeAll { $0.id == id }

        // Remove thumbnail
        let thumbURL = projectsDirectory.appendingPathComponent("\(id).thumb.jpg")
        try? FileManager.default.removeItem(at: thumbURL)

        persistProjects()
        syncToiCloud()
    }

    func saveThumbnail(_ imageData: Data, for projectID: UUID) {
        let url = projectsDirectory.appendingPathComponent("\(projectID).thumb.jpg")
        try? imageData.write(to: url)
    }

    func thumbnailURL(for projectID: UUID) -> URL {
        projectsDirectory.appendingPathComponent("\(projectID).thumb.jpg")
    }

    // MARK: - Persistence

    private func persistProjects() {
        let url = projectsDirectory.appendingPathComponent("projects.json")
        if let data = try? JSONEncoder().encode(savedProjects) {
            try? data.write(to: url)
        }
    }

    private func loadProjects() {
        let url = projectsDirectory.appendingPathComponent("projects.json")
        guard let data = try? Data(contentsOf: url),
              let projects = try? JSONDecoder().decode([SavedProject].self, from: data) else {
            return
        }
        savedProjects = projects
    }

    // MARK: - iCloud Sync

    private func syncToiCloud() {
        guard let data = try? JSONEncoder().encode(savedProjects) else { return }
        iCloudStore.set(data, forKey: "saved_projects")
        iCloudStore.synchronize()
    }

    private func syncFromiCloud() {
        guard let data = iCloudStore.data(forKey: "saved_projects"),
              let cloudProjects = try? JSONDecoder().decode([SavedProject].self, from: data) else {
            return
        }

        // Merge: cloud wins for newer items
        for cloudProject in cloudProjects {
            if let localIndex = savedProjects.firstIndex(where: { $0.id == cloudProject.id }) {
                if cloudProject.updatedAt > savedProjects[localIndex].updatedAt {
                    savedProjects[localIndex] = cloudProject
                }
            } else {
                savedProjects.append(cloudProject)
            }
        }

        persistProjects()
    }

    func startObservingCloudChanges() {
        NotificationCenter.default.addObserver(
            forName: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
            object: iCloudStore,
            queue: .main
        ) { [weak self] _ in
            self?.syncFromiCloud()
        }
    }
}

struct SavedProject: Identifiable, Codable, Hashable {
    let id: UUID
    var name: String
    var videoSourcePath: String
    var prompt: String
    var templateName: String?
    var clipConfigs: [SavedClipConfig]
    var createdAt: Date
    var updatedAt: Date
    var isExported: Bool

    init(
        id: UUID = UUID(),
        name: String,
        videoSourcePath: String,
        prompt: String = "",
        templateName: String? = nil,
        clipConfigs: [SavedClipConfig] = [],
        createdAt: Date = .now,
        updatedAt: Date = .now,
        isExported: Bool = false
    ) {
        self.id = id
        self.name = name
        self.videoSourcePath = videoSourcePath
        self.prompt = prompt
        self.templateName = templateName
        self.clipConfigs = clipConfigs
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.isExported = isExported
    }
}

struct SavedClipConfig: Codable, Hashable {
    var trimStartSeconds: Double
    var trimEndSeconds: Double
    var filterName: String
    var captionText: String
    var captionStyleName: String
    var musicTrackName: String?
}

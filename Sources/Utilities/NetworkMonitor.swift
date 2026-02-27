import Foundation
import Network

@Observable @MainActor
final class NetworkMonitor {
    static let shared = NetworkMonitor()

    var isConnected = true
    var isExpensive = false // Cellular
    var connectionType: ConnectionType = .unknown

    enum ConnectionType {
        case wifi, cellular, wired, unknown
    }

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "com.highlightmagic.networkmonitor")

    private init() {
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                self?.isConnected = path.status == .satisfied
                self?.isExpensive = path.isExpensive

                if path.usesInterfaceType(.wifi) {
                    self?.connectionType = .wifi
                } else if path.usesInterfaceType(.cellular) {
                    self?.connectionType = .cellular
                } else if path.usesInterfaceType(.wiredEthernet) {
                    self?.connectionType = .wired
                } else {
                    self?.connectionType = .unknown
                }
            }
        }
        monitor.start(queue: queue)
    }

    deinit {
        monitor.cancel()
    }

    /// Check if Claude Vision API should be used (prefer Wi-Fi for large uploads)
    var shouldUseCloudAI: Bool {
        isConnected && !isExpensive
    }
}

import Foundation
import UIKit
import os.log

enum CrashReporting {
    private static let logger = Logger(subsystem: "com.highlightmagic.app", category: "crash")
    private static let signpostLog = OSLog(subsystem: "com.highlightmagic.app", category: .pointsOfInterest)

    // MARK: - Error Logging

    static func log(_ error: Error, context: String = "", file: String = #file, line: Int = #line) {
        let fileName = (file as NSString).lastPathComponent
        logger.error("[\(fileName):\(line)] \(context): \(error.localizedDescription)")

        #if DEBUG
        print("[ERROR] [\(fileName):\(line)] \(context): \(error)")
        #endif
    }

    static func logWarning(_ message: String, file: String = #file, line: Int = #line) {
        let fileName = (file as NSString).lastPathComponent
        logger.warning("[\(fileName):\(line)] \(message)")
    }

    static func logInfo(_ message: String) {
        logger.info("\(message)")
    }

    // MARK: - Performance Tracking

    static func beginSignpost(_ name: StaticString) -> OSSignpostID {
        let id = OSSignpostID(log: signpostLog)
        os_signpost(.begin, log: signpostLog, name: name, signpostID: id)
        return id
    }

    static func endSignpost(_ name: StaticString, id: OSSignpostID) {
        os_signpost(.end, log: signpostLog, name: name, signpostID: id)
    }

    /// Measure an async block with signpost instrumentation
    static func measure<T>(_ name: StaticString, block: () async throws -> T) async rethrows -> T {
        let id = beginSignpost(name)
        defer { endSignpost(name, id: id) }
        return try await block()
    }

    // MARK: - Crash Reporting

    static func initialize() {
        NSSetUncaughtExceptionHandler { exception in
            logger.fault("Uncaught exception: \(exception.name.rawValue) — \(exception.reason ?? "no reason")")
        }

        logInfo("CrashReporting initialized")
    }

    // MARK: - Memory Warnings

    static func logMemoryWarning() {
        logWarning("Low memory warning received")

        // Proactively clear caches
        Task {
            await ThumbnailService.shared.clearCache()
        }

        // Log memory footprint for debugging
        var info = mach_task_basic_info()
        var count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size) / 4
        let result = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &count)
            }
        }
        if result == KERN_SUCCESS {
            let usedMB = info.resident_size / (1024 * 1024)
            logWarning("Memory footprint: \(usedMB)MB")
        }
    }

    // MARK: - Battery Level Check

    @MainActor
    static var isLowBattery: Bool {
        UIDevice.current.isBatteryMonitoringEnabled = true
        return UIDevice.current.batteryLevel > 0 && UIDevice.current.batteryLevel < 0.1
            && UIDevice.current.batteryState == .unplugged
    }
}

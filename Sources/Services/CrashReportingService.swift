import Foundation
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

    // MARK: - Crash Reporting Stub

    /// In production, integrate with Firebase Crashlytics or Sentry
    static func initialize() {
        // Register for uncaught exception handling
        NSSetUncaughtExceptionHandler { exception in
            logger.fault("Uncaught exception: \(exception.name.rawValue) — \(exception.reason ?? "no reason")")
            // In production: send to Crashlytics/Sentry
        }

        logInfo("CrashReporting initialized")
    }

    // MARK: - Memory Warnings

    static func logMemoryWarning() {
        logWarning("Low memory warning received")
        // Clear thumbnail caches, release non-essential resources
    }
}

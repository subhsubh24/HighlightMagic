// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "HighlightMagic",
    platforms: [
        .iOS(.v18)
    ],
    products: [
        .library(
            name: "HighlightMagic",
            targets: ["HighlightMagic"]
        )
    ],
    targets: [
        .target(
            name: "HighlightMagic",
            path: "Sources",
            resources: [
                .process("Resources"),
                .copy("Info.plist")
            ],
            swiftSettings: [
                .swiftLanguageMode(.v6)
            ]
        )
    ]
)

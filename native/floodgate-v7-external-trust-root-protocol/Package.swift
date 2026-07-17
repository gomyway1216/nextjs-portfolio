// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "FloodgateV7ExternalTrustRootProtocol",
    platforms: [
        .macOS(.v13),
    ],
    products: [
        .library(
            name: "FloodgateV7ExternalTrustRootProtocol",
            targets: ["FloodgateV7ExternalTrustRootProtocol"]
        ),
    ],
    dependencies: [],
    targets: [
        .target(
            name: "FloodgateV7ExternalTrustRootProtocol",
            dependencies: []
        ),
        .testTarget(
            name: "FloodgateV7ExternalTrustRootProtocolTests",
            dependencies: ["FloodgateV7ExternalTrustRootProtocol"]
        ),
    ]
)

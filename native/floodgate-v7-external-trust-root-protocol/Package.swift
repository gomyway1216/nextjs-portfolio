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
        .executable(
            name: "floodgate-v7-trust-root-supervisor",
            targets: ["FloodgateV7TrustRootSupervisor"]
        ),
        .executable(
            name: "floodgate-v7-trust-root-verifier",
            targets: ["FloodgateV7TrustRootVerifier"]
        ),
    ],
    dependencies: [],
    targets: [
        .target(
            name: "FloodgateV7ExternalTrustRootProtocol",
            dependencies: []
        ),
        .executableTarget(
            name: "FloodgateV7TrustRootSupervisor",
            dependencies: []
        ),
        .executableTarget(
            name: "FloodgateV7TrustRootVerifier",
            dependencies: []
        ),
        .testTarget(
            name: "FloodgateV7ExternalTrustRootProtocolTests",
            dependencies: ["FloodgateV7ExternalTrustRootProtocol"]
        ),
    ]
)

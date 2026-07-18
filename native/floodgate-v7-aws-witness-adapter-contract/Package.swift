// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "FloodgateV7AWSWitnessAdapterContract",
    platforms: [
        .macOS(.v13),
    ],
    products: [],
    dependencies: [
        .package(
            path: "../floodgate-v7-external-trust-root-protocol"
        ),
    ],
    targets: [
        .target(
            name: "FloodgateV7AWSWitnessAdapterContract",
            dependencies: [
                .product(
                    name: "FloodgateV7ExternalTrustRootProtocol",
                    package:
                        "floodgate-v7-external-trust-root-protocol"
                ),
            ]
        ),
        .testTarget(
            name: "FloodgateV7AWSWitnessAdapterContractTests",
            dependencies: [
                "FloodgateV7AWSWitnessAdapterContract",
                .product(
                    name: "FloodgateV7ExternalTrustRootProtocol",
                    package:
                        "floodgate-v7-external-trust-root-protocol"
                ),
            ]
        ),
    ]
)

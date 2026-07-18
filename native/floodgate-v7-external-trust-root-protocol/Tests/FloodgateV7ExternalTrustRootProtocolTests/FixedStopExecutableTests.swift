import Foundation
import XCTest

final class FixedStopExecutableTests: XCTestCase {
    func testFixedStopSourcesHaveNoProtocolDependencyOrInputPath()
        throws
    {
        let packageRoot =
            URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let packageSource = try String(
            contentsOf:
                packageRoot.appendingPathComponent("Package.swift"),
            encoding: .utf8
        )
        let compactPackageSource =
            packageSource.filter { !$0.isWhitespace }
        for targetName in [
            "FloodgateV7TrustRootSupervisor",
            "FloodgateV7TrustRootVerifier",
        ] {
            XCTAssertTrue(
                compactPackageSource.contains(
                    ".executableTarget(name:\"\(targetName)\",dependencies:[])"
                )
            )
            let mainSource = try String(
                contentsOf:
                    packageRoot.appendingPathComponent(
                        "Sources/\(targetName)/main.swift"
                    ),
                encoding: .utf8
            )
            XCTAssertEqual(
                mainSource,
                """
                import Darwin

                private let unavailableExitCode: Int32 = 78

                _exit(unavailableExitCode)

                """
            )
        }
    }

    func testSupervisorAndVerifierAreArgumentIndependentFixedStops()
        throws
    {
        let productsDirectory =
            Bundle(for: Self.self).bundleURL
            .deletingLastPathComponent()
        for executableName in [
            "floodgate-v7-trust-root-supervisor",
            "floodgate-v7-trust-root-verifier",
        ] {
            let process = Process()
            let stdout = Pipe()
            let stderr = Pipe()
            let stdin = Pipe()
            process.executableURL =
                productsDirectory.appendingPathComponent(
                    executableName
                )
            process.arguments = [
                "--caller-supplied-path",
                "/private/should-not-be-read",
            ]
            process.environment = [
                "FGV7_UNTRUSTED_INPUT": "must-not-change-behavior",
            ]
            process.currentDirectoryURL = URL(fileURLWithPath: "/")
            process.standardInput = stdin
            process.standardOutput = stdout
            process.standardError = stderr

            try process.run()
            stdin.fileHandleForWriting.write(
                Data("untrusted stdin\n".utf8)
            )
            try stdin.fileHandleForWriting.close()
            process.waitUntilExit()

            XCTAssertEqual(
                process.terminationReason,
                .exit,
                executableName
            )
            XCTAssertEqual(
                process.terminationStatus,
                78,
                executableName
            )
            XCTAssertEqual(
                stdout.fileHandleForReading.readDataToEndOfFile(),
                Data(),
                executableName
            )
            XCTAssertEqual(
                stderr.fileHandleForReading.readDataToEndOfFile(),
                Data(),
                executableName
            )
        }
    }
}

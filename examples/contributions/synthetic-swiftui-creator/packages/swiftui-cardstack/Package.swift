// swift-tools-version: 5.9
// SYNTHETIC FIXTURE: not a real creator's repository
// Copied from repo-b-components and trimmed to the library target. The test target stayed upstream.
import PackageDescription

let package = Package(
    name: "CardStack",
    platforms: [.iOS(.v16)],
    products: [
        .library(name: "CardStack", targets: ["CardStack"]),
    ],
    targets: [
        .target(name: "CardStack"),
    ]
)

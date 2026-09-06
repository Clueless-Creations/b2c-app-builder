// swift-tools-version: 5.9
// SYNTHETIC FIXTURE: not a real creator's repository
import PackageDescription

let package = Package(
    name: "CardStack",
    platforms: [.iOS(.v16)],
    products: [
        .library(name: "CardStack", targets: ["CardStack"]),
    ],
    targets: [
        .target(name: "CardStack"),
        .testTarget(name: "CardStackTests", dependencies: ["CardStack"]),
    ]
)

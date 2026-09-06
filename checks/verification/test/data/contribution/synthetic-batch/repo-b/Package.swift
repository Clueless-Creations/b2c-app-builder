// SYNTHETIC FIXTURE: an invented Swift package manifest for batch intake tests. Intake never resolves or builds it.
// swift-tools-version:5.9
import PackageDescription

let package = Package(
  name: "CardStack",
  targets: [
    .target(name: "CardStack"),
    .testTarget(name: "CardStackTests", dependencies: ["CardStack"]),
  ]
)

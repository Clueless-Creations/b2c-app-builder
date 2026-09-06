// swift-tools-version: 5.9
import PackageDescription
let package = Package(
  name: "SuperwallRevenueCatExample",
  platforms: [.iOS(.v16), .macOS(.v13)],
  products: [.library(name: "MonetizationNative", targets: ["MonetizationNative"])],
  dependencies: [
    .package(url: "https://github.com/superwall/Superwall-iOS", exact: "4.16.3"),
    .package(url: "https://github.com/RevenueCat/purchases-ios", exact: "5.88.0")
  ],
  targets: [
    .target(name: "MonetizationCore"),
    .target(name: "MonetizationNative", dependencies: [
      "MonetizationCore",
      .product(name: "SuperwallKit", package: "Superwall-iOS", condition: .when(platforms: [.iOS])),
      .product(name: "RevenueCat", package: "purchases-ios", condition: .when(platforms: [.iOS]))
    ]),
    .testTarget(name: "MonetizationCoreTests", dependencies: ["MonetizationCore"])
  ]
)

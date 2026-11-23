// swift-tools-version:5.9
// Swift package manifest for the CustomDomain iOS SDK: one library, one test target.
// The bridge logic has no UIKit dependency so its tests also run on macOS.
// SPDX-License-Identifier: Apache-2.0
import PackageDescription

let package = Package(
    name: "CustomDomain",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [
        .library(name: "CustomDomain", targets: ["CustomDomain"]),
    ],
    targets: [
        .target(name: "CustomDomain"),
        .testTarget(name: "CustomDomainTests", dependencies: ["CustomDomain"]),
    ]
)

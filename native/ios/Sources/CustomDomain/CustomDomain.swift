// Public types of the SDK: configuration, the result, callbacks, and the return link entry point.
// No UIKit here. Keep it small: integrators read this file to learn the API.
// SPDX-License-Identifier: Apache-2.0
import Foundation

public struct CustomDomainConfiguration {
    /// The hosted widget origin. Change only for a self hosted install.
    public var baseURL: URL
    public var applicationId: String
    /// Prefill the domain field.
    public var domain: String?
    /// The custom scheme your app registered, without "://".
    public var returnScheme: String
    /// Optional https return (iOS 17.4 or later) claimed by your app.
    public var returnHTTPS: (host: String, path: String)?

    public init(applicationId: String, returnScheme: String, domain: String? = nil,
                returnHTTPS: (host: String, path: String)? = nil,
                baseURL: URL = URL(string: "https://app.customdomain.ai")!) {
        self.applicationId = applicationId
        self.returnScheme = returnScheme
        self.domain = domain
        self.returnHTTPS = returnHTTPS
        self.baseURL = baseURL
    }

    var appReturn: String { "\(returnScheme)://customdomain" }

    var widgetURL: URL {
        var parts = URLComponents(url: baseURL.appendingPathComponent("widget/app"), resolvingAgainstBaseURL: false)!
        parts.queryItems = [URLQueryItem(name: "app", value: applicationId)]
        return parts.url!
    }
}

public struct CustomDomainResult: Equatable {
    public let domain: String
    public let provider: String?
}

public struct CustomDomainError: Error, Equatable {
    public let code: String
    public let message: String
}

public struct CustomDomainCallbacks {
    /// Return a token minted by your server. Never ship a key in the app.
    public var fetchToken: () async throws -> String
    public var onSuccess: (CustomDomainResult) -> Void
    public var onError: (CustomDomainError) -> Void
    public var onClose: () -> Void

    public init(fetchToken: @escaping () async throws -> String,
                onSuccess: @escaping (CustomDomainResult) -> Void = { _ in },
                onError: @escaping (CustomDomainError) -> Void = { _ in },
                onClose: @escaping () -> Void = {}) {
        self.fetchToken = fetchToken
        self.onSuccess = onSuccess
        self.onError = onError
        self.onClose = onClose
    }
}

public extension Notification.Name {
    static let customDomainReturn = Notification.Name("ai.customdomain.return")
}

public enum CustomDomain {
    /// Call from `onOpenURL` or your app delegate with every incoming link.
    /// Returns true when the link carries a resume token and was passed to the open widget.
    @discardableResult
    public static func handleReturn(_ url: URL) -> Bool {
        guard let token = ReturnLink.resumeToken(from: url) else { return false }
        NotificationCenter.default.post(name: .customDomainReturn, object: nil, userInfo: ["resumeToken": token])
        return true
    }
}

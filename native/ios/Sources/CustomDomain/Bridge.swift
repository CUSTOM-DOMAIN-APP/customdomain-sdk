// The pure half of the bridge: parses what the widget page posts, builds what the app posts back.
// No UIKit, no network, no state, so every rule here is covered by plain unit tests.
// Message names follow the widget's host protocol (type and payload); lists are open, so ignore unknown types.
// SPDX-License-Identifier: Apache-2.0
import Foundation

/// The name of the script message handler the hosted page posts to.
public let customDomainBridgeName = "customdomainBridge"

/// What the app can open when the widget asks for it.
public struct OpenURLRequest: Equatable {
    public let url: URL
    /// signin, domain-connect, nameservers, docs or other.
    public let kind: String
    public let provider: String?
    public let appReturn: String?
}

/// A message from the widget page, reduced to what the SDK acts on.
public enum BridgeEvent: Equatable {
    case ready
    case openURL(OpenURLRequest)
    case success(domain: String, provider: String?)
    case error(code: String, message: String)
    case close
    case tokenExpired
    case other(type: String)
}

public enum BridgeParser {
    /// Accepts a JSON string or an already decoded dictionary. Returns nil when the body is not a widget message.
    public static func parse(_ body: Any) -> BridgeEvent? {
        guard let dict = dictionary(from: body),
              let type = dict["type"] as? String,
              type.hasPrefix("customdomain:") else { return nil }
        let payload = dict["payload"] as? [String: Any] ?? [:]
        switch type {
        case "customdomain:ready":
            return .ready
        case "customdomain:open-url":
            guard let raw = payload["url"] as? String, let url = safeURL(raw) else { return .other(type: type) }
            return .openURL(OpenURLRequest(
                url: url,
                kind: payload["kind"] as? String ?? "other",
                provider: payload["provider"] as? String,
                appReturn: payload["appReturn"] as? String))
        case "customdomain:success":
            guard let domain = payload["domain"] as? String else { return .other(type: type) }
            return .success(domain: domain, provider: payload["provider"] as? String)
        case "customdomain:error":
            let code = payload["code"] as? String ?? "GenericError"
            let message = payload["details"] as? String ?? payload["message"] as? String ?? payload["title"] as? String ?? ""
            return .error(code: code, message: message)
        case "customdomain:close", "customdomain:request-close":
            return .close
        case "customdomain:token-expired":
            return .tokenExpired
        default:
            return .other(type: type)
        }
    }

    /// Only https links with a host are ever handed to the system browser.
    public static func safeURL(_ raw: String) -> URL? {
        guard let url = URL(string: raw), url.scheme?.lowercased() == "https",
              let host = url.host, !host.isEmpty else { return nil }
        return url
    }

    static func dictionary(from body: Any) -> [String: Any]? {
        if let dict = body as? [String: Any] { return dict }
        if let text = body as? String, let data = text.data(using: .utf8),
           let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] { return object }
        return nil
    }
}

/// Messages the app sends into the widget page.
public enum BridgeMessage {
    public static let sdkVersion = "0.1.0"

    public static func capabilities(platform: String = "ios", colorScheme: String, locale: String, appReturn: String?) -> [String: Any] {
        var payload: [String: Any] = [
            "openUrl": true,
            "platform": platform,
            "sdkVersion": sdkVersion,
            "colorScheme": colorScheme,
            "locale": locale,
        ]
        if let appReturn = appReturn { payload["appReturn"] = appReturn }
        return envelope("customdomain:capabilities", payload)
    }

    public static func initialize(token: String, domain: String?) -> [String: Any] {
        var payload: [String: Any] = ["token": token]
        if let domain = domain { payload["domain"] = domain }
        return envelope("customdomain:init", payload)
    }

    public static func token(_ token: String?) -> [String: Any] {
        envelope("customdomain:token", ["token": token ?? NSNull()])
    }

    /// Sent when the system browser sheet ended. `resumeToken` is nil when the person cancelled.
    public static func appReturn(resumeToken: String?) -> [String: Any] {
        var payload: [String: Any] = ["cancelled": resumeToken == nil]
        if let resumeToken = resumeToken { payload["resume"] = resumeToken }
        return envelope("customdomain:app-return", payload)
    }

    /// The script that delivers a message to the page.
    public static func script(for message: [String: Any]) -> String? {
        guard JSONSerialization.isValidJSONObject(message),
              let data = try? JSONSerialization.data(withJSONObject: message),
              let json = String(data: data, encoding: .utf8) else { return nil }
        return "window.postMessage(\(json), window.location.origin);"
    }

    static func envelope(_ type: String, _ payload: [String: Any]) -> [String: Any] {
        ["type": type, "payload": payload]
    }
}

public enum ReturnLink {
    /// Reads the resume token from an app return link, for example `myapp://customdomain?resume=abc`.
    public static func resumeToken(from url: URL) -> String? {
        guard let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
              let value = items.first(where: { $0.name == "resume" })?.value,
              !value.isEmpty else { return nil }
        return value
    }
}

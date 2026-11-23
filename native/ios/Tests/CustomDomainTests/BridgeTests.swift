// Unit tests for the pure bridge rules: parsing widget messages, building app messages, return links.
// Runs on macOS and iOS; nothing here touches a web view.
// SPDX-License-Identifier: Apache-2.0
import XCTest
@testable import CustomDomain

final class BridgeTests: XCTestCase {
    func testParsesJSONString() {
        XCTAssertEqual(BridgeParser.parse(#"{"type":"customdomain:ready","payload":{}}"#), .ready)
    }

    func testParsesDictionaryBody() {
        let body: [String: Any] = ["type": "customdomain:close", "payload": [:]]
        XCTAssertEqual(BridgeParser.parse(body), .close)
    }

    func testIgnoresOtherMessages() {
        XCTAssertNil(BridgeParser.parse("not json"))
        XCTAssertNil(BridgeParser.parse(["type": "other:thing"]))
        XCTAssertNil(BridgeParser.parse(42))
    }

    func testOpenURLAcceptsHTTPS() {
        let body: [String: Any] = ["type": "customdomain:open-url",
                                   "payload": ["url": "https://provider.example/auth", "kind": "signin", "provider": "p"]]
        guard case .openURL(let request)? = BridgeParser.parse(body) else { return XCTFail("expected openURL") }
        XCTAssertEqual(request.url.absoluteString, "https://provider.example/auth")
        XCTAssertEqual(request.kind, "signin")
        XCTAssertEqual(request.provider, "p")
    }

    func testOpenURLRejectsOtherSchemes() {
        for raw in ["http://x.example", "javascript:alert(1)", "file:///etc/hosts", "myapp://x", "https://"] {
            let body: [String: Any] = ["type": "customdomain:open-url", "payload": ["url": raw]]
            XCTAssertEqual(BridgeParser.parse(body), .other(type: "customdomain:open-url"), raw)
        }
    }

    func testSuccessAndError() {
        let ok: [String: Any] = ["type": "customdomain:success", "payload": ["domain": "acme.com", "provider": NSNull()]]
        XCTAssertEqual(BridgeParser.parse(ok), .success(domain: "acme.com", provider: nil))
        let bad: [String: Any] = ["type": "customdomain:error", "payload": ["code": "NetworkError", "title": "t", "details": "d"]]
        XCTAssertEqual(BridgeParser.parse(bad), .error(code: "NetworkError", message: "d"))
    }

    func testTokenExpiredAndRequestClose() {
        XCTAssertEqual(BridgeParser.parse(["type": "customdomain:token-expired"]), .tokenExpired)
        XCTAssertEqual(BridgeParser.parse(["type": "customdomain:request-close"]), .close)
    }

    func testCapabilitiesMessage() {
        let message = BridgeMessage.capabilities(colorScheme: "dark", locale: "en_US", appReturn: "myapp://customdomain")
        XCTAssertEqual(message["type"] as? String, "customdomain:capabilities")
        let payload = message["payload"] as? [String: Any]
        XCTAssertEqual(payload?["openUrl"] as? Bool, true)
        XCTAssertEqual(payload?["platform"] as? String, "ios")
        XCTAssertEqual(payload?["appReturn"] as? String, "myapp://customdomain")
    }

    func testInitAndTokenMessages() {
        let initMessage = BridgeMessage.initialize(token: "t", domain: "acme.com")
        let payload = initMessage["payload"] as? [String: Any]
        XCTAssertEqual(payload?["token"] as? String, "t")
        XCTAssertEqual(payload?["domain"] as? String, "acme.com")
        let empty = BridgeMessage.token(nil)["payload"] as? [String: Any]
        XCTAssertTrue(empty?["token"] is NSNull)
    }

    func testAppReturnMessage() {
        let done = BridgeMessage.appReturn(resumeToken: "abc")["payload"] as? [String: Any]
        XCTAssertEqual(done?["resume"] as? String, "abc")
        XCTAssertEqual(done?["cancelled"] as? Bool, false)
        let cancelled = BridgeMessage.appReturn(resumeToken: nil)["payload"] as? [String: Any]
        XCTAssertEqual(cancelled?["cancelled"] as? Bool, true)
    }

    func testScriptIsValidPostMessage() throws {
        let script = try XCTUnwrap(BridgeMessage.script(for: BridgeMessage.initialize(token: "t\"x", domain: nil)))
        XCTAssertTrue(script.hasPrefix("window.postMessage({"))
        XCTAssertTrue(script.hasSuffix(", window.location.origin);"))
        XCTAssertTrue(script.contains(#"t\"x"#))
    }

    func testResumeTokenFromReturnLink() {
        XCTAssertEqual(ReturnLink.resumeToken(from: URL(string: "myapp://customdomain?resume=abc123")!), "abc123")
        XCTAssertNil(ReturnLink.resumeToken(from: URL(string: "myapp://customdomain")!))
        XCTAssertNil(ReturnLink.resumeToken(from: URL(string: "myapp://customdomain?resume=")!))
    }

    func testWidgetURL() {
        let config = CustomDomainConfiguration(applicationId: "app 1", returnScheme: "myapp")
        XCTAssertEqual(config.widgetURL.absoluteString, "https://app.customdomain.ai/widget/app?app=app%201")
        XCTAssertEqual(config.appReturn, "myapp://customdomain")
    }
}

// SwiftUI view that hosts the widget page in a WKWebView and runs the bridge.
// Sign in opens in ASWebAuthenticationSession, never inside the web view; navigation away from the widget origin is refused.
// The pure message rules live in Bridge.swift; keep this file to wiring only.
// SPDX-License-Identifier: Apache-2.0
#if canImport(UIKit)
import SwiftUI
import UIKit
import WebKit
import AuthenticationServices

public struct CustomDomainView: UIViewRepresentable {
    let configuration: CustomDomainConfiguration
    let callbacks: CustomDomainCallbacks

    public init(configuration: CustomDomainConfiguration, callbacks: CustomDomainCallbacks) {
        self.configuration = configuration
        self.callbacks = callbacks
    }

    public func makeCoordinator() -> Coordinator { Coordinator(configuration: configuration, callbacks: callbacks) }

    public func makeUIView(context: Context) -> WKWebView {
        let controller = WKUserContentController()
        controller.add(WeakHandler(context.coordinator), name: customDomainBridgeName)
        let config = WKWebViewConfiguration()
        config.userContentController = controller
        config.websiteDataStore = .nonPersistent()
        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = context.coordinator
        view.uiDelegate = context.coordinator
        view.scrollView.contentInsetAdjustmentBehavior = .never
        context.coordinator.webView = view
        view.load(URLRequest(url: configuration.widgetURL))
        return view
    }

    public func updateUIView(_ uiView: WKWebView, context: Context) {}

    public static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: customDomainBridgeName)
        coordinator.stop()
    }

    public final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate,
                                    ASWebAuthenticationPresentationContextProviding {
        let configuration: CustomDomainConfiguration
        let callbacks: CustomDomainCallbacks
        weak var webView: WKWebView?
        private var session: ASWebAuthenticationSession?
        private var observer: NSObjectProtocol?

        init(configuration: CustomDomainConfiguration, callbacks: CustomDomainCallbacks) {
            self.configuration = configuration
            self.callbacks = callbacks
            super.init()
            observer = NotificationCenter.default.addObserver(forName: .customDomainReturn, object: nil, queue: .main) { [weak self] note in
                self?.send(BridgeMessage.appReturn(resumeToken: note.userInfo?["resumeToken"] as? String))
            }
        }

        func stop() {
            session?.cancel()
            if let observer = observer { NotificationCenter.default.removeObserver(observer) }
        }

        // MARK: messages from the page

        public func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.frameInfo.isMainFrame, let event = BridgeParser.parse(message.body) else { return }
            handle(event)
        }

        func handle(_ event: BridgeEvent) {
            switch event {
            case .ready:
                send(BridgeMessage.capabilities(colorScheme: colorScheme, locale: Locale.current.identifier, appReturn: configuration.appReturn))
                deliverToken { BridgeMessage.initialize(token: $0, domain: self.configuration.domain) }
            case .tokenExpired:
                deliverToken { BridgeMessage.token($0) }
            case .openURL(let request):
                openSignIn(request.url)
            case .success(let domain, let provider):
                callbacks.onSuccess(CustomDomainResult(domain: domain, provider: provider))
            case .error(let code, let message):
                callbacks.onError(CustomDomainError(code: code, message: message))
            case .close:
                callbacks.onClose()
            case .other:
                break
            }
        }

        private var colorScheme: String {
            UITraitCollection.current.userInterfaceStyle == .dark ? "dark" : "light"
        }

        private func deliverToken(_ build: @escaping (String) -> [String: Any]) {
            Task { @MainActor in
                do {
                    let token = try await callbacks.fetchToken()
                    send(build(token))
                } catch {
                    callbacks.onError(CustomDomainError(code: "TokenError", message: error.localizedDescription))
                }
            }
        }

        func send(_ message: [String: Any]) {
            guard let script = BridgeMessage.script(for: message) else { return }
            webView?.evaluateJavaScript(script)
        }

        // MARK: system browser sign in

        private func openSignIn(_ url: URL) {
            let finish: (URL?, Error?) -> Void = { [weak self] callback, _ in
                DispatchQueue.main.async {
                    self?.session = nil
                    self?.send(BridgeMessage.appReturn(resumeToken: callback.flatMap(ReturnLink.resumeToken(from:))))
                }
            }
            let session: ASWebAuthenticationSession
            if #available(iOS 17.4, *), let https = configuration.returnHTTPS {
                session = ASWebAuthenticationSession(url: url, callback: .https(host: https.host, path: https.path), completionHandler: finish)
            } else {
                session = ASWebAuthenticationSession(url: url, callbackURLScheme: configuration.returnScheme, completionHandler: finish)
            }
            session.presentationContextProvider = self
            self.session = session
            session.start()
        }

        public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
            webView?.window ?? ASPresentationAnchor()
        }

        // MARK: keep the web view on our origin

        public func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = action.request.url else { return decisionHandler(.cancel) }
            let sameOrigin = url.scheme == configuration.baseURL.scheme && url.host == configuration.baseURL.host
            decisionHandler(sameOrigin || url.absoluteString == "about:blank" ? .allow : .cancel)
        }

        /// Popups are never opened.
        public func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                            for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? { nil }
    }

    /// Stops the content controller from keeping the coordinator alive.
    private final class WeakHandler: NSObject, WKScriptMessageHandler {
        weak var target: WKScriptMessageHandler?
        init(_ target: WKScriptMessageHandler) { self.target = target }
        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            target?.userContentController(controller, didReceive: message)
        }
    }
}
#endif

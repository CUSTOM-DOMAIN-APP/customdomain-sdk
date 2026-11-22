// A FrameLayout that hosts the widget page in a WebView and runs the bridge.
// Sign in opens in a Custom Tab, never inside the WebView; navigation away from the widget origin is refused.
// The page talks through a web message listener limited to the widget origin (never addJavascriptInterface).
// The pure message rules live in Bridge.kt; keep this file to wiring only.
// SPDX-License-Identifier: Apache-2.0
package ai.customdomain

import android.annotation.SuppressLint
import android.content.Context
import android.content.res.Configuration
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.AttributeSet
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.browser.customtabs.CustomTabsIntent
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

class CustomDomainView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : FrameLayout(context, attrs) {

    private val main = Handler(Looper.getMainLooper())
    private var config: CustomDomainConfig? = null
    private var callbacks: CustomDomainCallbacks? = null
    private val webView = WebView(context)

    init {
        addView(webView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }

    /** Loads the widget. Call once. */
    @SuppressLint("SetJavaScriptEnabled")
    fun start(config: CustomDomainConfig, callbacks: CustomDomainCallbacks) {
        this.config = config
        this.callbacks = callbacks
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = false
        webView.settings.setSupportMultipleWindows(false)
        webView.settings.allowFileAccess = false
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                !isOwnOrigin(request.url)
        }
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            callbacks.onError("WebViewUnsupported", "This device's WebView is too old.")
            return
        }
        WebViewCompat.addWebMessageListener(webView, BRIDGE_NAME, setOf(config.origin)) { _, message, _, isMainFrame, _ ->
            if (isMainFrame) BridgeParser.parse(message.data)?.let { main.post { handle(it) } }
        }
        CustomDomain.register(this)
        webView.loadUrl(config.widgetUrl)
    }

    /** Pass the system back button here first. Returns true: the widget handles it. */
    fun onBackPressed(): Boolean {
        send(BridgeMessage.back())
        return true
    }

    override fun onDetachedFromWindow() {
        CustomDomain.unregister(this)
        super.onDetachedFromWindow()
    }

    internal fun deliverReturn(resumeToken: String?) = send(BridgeMessage.appReturn(resumeToken))

    private fun handle(event: BridgeEvent) {
        val cfg = config ?: return
        val cb = callbacks ?: return
        when (event) {
            is BridgeEvent.Ready -> {
                val dark = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
                send(BridgeMessage.capabilities(if (dark) "dark" else "light", java.util.Locale.getDefault().toLanguageTag(), cfg.appReturn))
                deliverToken { BridgeMessage.init(it, cfg.domain) }
            }
            is BridgeEvent.TokenExpired -> deliverToken { BridgeMessage.token(it) }
            is BridgeEvent.OpenUrl -> CustomTabsIntent.Builder().build().launchUrl(context, Uri.parse(event.request.url))
            is BridgeEvent.Success -> cb.onSuccess(CustomDomainResult(event.domain, event.provider))
            is BridgeEvent.Error -> cb.onError(event.code, event.message)
            is BridgeEvent.Close -> cb.onClose()
            is BridgeEvent.Other -> Unit
        }
    }

    private fun deliverToken(build: (String) -> JSONObject) {
        val cb = callbacks ?: return
        cb.fetchToken(object : TokenCallback {
            override fun onToken(token: String) { main.post { send(build(token)) } }
            override fun onError(error: Throwable) { main.post { cb.onError("TokenError", error.message ?: "") } }
        })
    }

    private fun send(message: JSONObject) {
        webView.evaluateJavascript(BridgeMessage.script(message), null)
    }

    private fun isOwnOrigin(uri: Uri): Boolean {
        val own = Uri.parse(config?.baseUrl ?: return false)
        return uri.scheme == own.scheme && uri.host == own.host
    }
}

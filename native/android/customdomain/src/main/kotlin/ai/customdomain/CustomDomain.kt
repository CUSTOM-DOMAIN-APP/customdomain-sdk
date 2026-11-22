// Public types of the SDK: configuration, result, callbacks, and the return link entry point.
// Keep it small: integrators read this file to learn the API.
// SPDX-License-Identifier: Apache-2.0
package ai.customdomain

import java.lang.ref.WeakReference

data class CustomDomainConfig(
    val applicationId: String,
    /** The https link (or custom scheme link) your app claims, for example https://acme.com/cd-return. */
    val appReturn: String,
    /** Prefill the domain field. */
    val domain: String? = null,
    /** The hosted widget origin. Change only for a self hosted install. */
    val baseUrl: String = "https://app.customdomain.ai",
) {
    val widgetUrl: String
        get() = "${baseUrl.trimEnd('/')}/widget/app?app=${java.net.URLEncoder.encode(applicationId, "UTF-8")}"

    /** The origin string the web message listener allows. */
    val origin: String
        get() = java.net.URI(baseUrl).let { "${it.scheme}://${it.authority}" }
}

data class CustomDomainResult(val domain: String, val provider: String?)

/** Receives the token your server minted. */
interface TokenCallback {
    fun onToken(token: String)
    fun onError(error: Throwable)
}

class CustomDomainCallbacks(
    /** Ask your server for a token. Never ship a key in the app. */
    val fetchToken: (TokenCallback) -> Unit,
    val onSuccess: (CustomDomainResult) -> Unit = {},
    val onError: (code: String, message: String) -> Unit = { _, _ -> },
    val onClose: () -> Unit = {},
)

object CustomDomain {
    private val views = mutableListOf<WeakReference<CustomDomainView>>()

    internal fun register(view: CustomDomainView) {
        views.removeAll { it.get() == null }
        views.add(WeakReference(view))
    }

    internal fun unregister(view: CustomDomainView) {
        views.removeAll { it.get() == null || it.get() === view }
    }

    /**
     * Call from the activity that owns your return link, in onCreate and onNewIntent, with `intent.dataString`.
     * Returns true when the link carries a resume token and was passed to the open widget.
     */
    @JvmStatic
    fun handleReturn(link: String?): Boolean {
        if (link == null) return false
        val token = ReturnLink.resumeToken(link) ?: return false
        views.mapNotNull { it.get() }.forEach { it.deliverReturn(token) }
        return true
    }
}

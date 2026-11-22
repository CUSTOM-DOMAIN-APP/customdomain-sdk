// The pure half of the bridge: parses what the widget page posts, builds what the app posts back.
// No Android classes except org.json, so every rule is covered by JVM unit tests.
// Message names follow the widget's host protocol (type and payload); lists are open, so ignore unknown types.
// SPDX-License-Identifier: Apache-2.0
package ai.customdomain

import java.net.URI
import org.json.JSONObject

/** The name of the web message listener the hosted page posts to. */
const val BRIDGE_NAME = "customdomainBridge"

const val SDK_VERSION = "0.1.0"

/** What the app opens in Custom Tabs when the widget asks for it. */
data class OpenUrlRequest(val url: String, val kind: String, val provider: String?, val appReturn: String?)

/** A message from the widget page, reduced to what the SDK acts on. */
sealed class BridgeEvent {
    object Ready : BridgeEvent()
    data class OpenUrl(val request: OpenUrlRequest) : BridgeEvent()
    data class Success(val domain: String, val provider: String?) : BridgeEvent()
    data class Error(val code: String, val message: String) : BridgeEvent()
    object Close : BridgeEvent()
    object TokenExpired : BridgeEvent()
    data class Other(val type: String) : BridgeEvent()
}

object BridgeParser {
    /** Returns null when the body is not a widget message. */
    fun parse(body: String?): BridgeEvent? {
        if (body == null) return null
        val root = try { JSONObject(body) } catch (e: Exception) { return null }
        val type = root.optString("type")
        if (!type.startsWith("customdomain:")) return null
        val payload = root.optJSONObject("payload") ?: JSONObject()
        return when (type) {
            "customdomain:ready" -> BridgeEvent.Ready
            "customdomain:open-url" -> {
                val url = payload.optString("url")
                if (!isSafeUrl(url)) BridgeEvent.Other(type)
                else BridgeEvent.OpenUrl(OpenUrlRequest(
                    url = url,
                    kind = payload.optString("kind", "other"),
                    provider = str(payload, "provider"),
                    appReturn = str(payload, "appReturn")))
            }
            "customdomain:success" -> {
                val domain = str(payload, "domain")
                if (domain == null) BridgeEvent.Other(type) else BridgeEvent.Success(domain, str(payload, "provider"))
            }
            "customdomain:error" -> BridgeEvent.Error(
                code = str(payload, "code") ?: "GenericError",
                message = str(payload, "details") ?: str(payload, "message") ?: str(payload, "title") ?: "")
            "customdomain:close", "customdomain:request-close" -> BridgeEvent.Close
            "customdomain:token-expired" -> BridgeEvent.TokenExpired
            else -> BridgeEvent.Other(type)
        }
    }

    /** Only https links with a host are ever handed to the system browser. */
    fun isSafeUrl(raw: String): Boolean {
        val uri = try { URI(raw) } catch (e: Exception) { return false }
        return uri.scheme.equals("https", ignoreCase = true) && !uri.host.isNullOrEmpty()
    }

    private fun str(o: JSONObject, key: String): String? =
        if (o.isNull(key) || !o.has(key)) null else o.optString(key).ifEmpty { null }
}

/** Messages the app sends into the widget page. */
object BridgeMessage {
    fun capabilities(colorScheme: String, locale: String, appReturn: String?): JSONObject =
        envelope("customdomain:capabilities", JSONObject().apply {
            put("openUrl", true)
            put("platform", "android")
            put("sdkVersion", SDK_VERSION)
            put("colorScheme", colorScheme)
            put("locale", locale)
            if (appReturn != null) put("appReturn", appReturn)
        })

    fun init(token: String, domain: String?): JSONObject =
        envelope("customdomain:init", JSONObject().apply {
            put("token", token)
            if (domain != null) put("domain", domain)
        })

    fun token(token: String?): JSONObject =
        envelope("customdomain:token", JSONObject().put("token", token ?: JSONObject.NULL))

    /** Sent when the Custom Tab ended. [resumeToken] is null when the person cancelled. */
    fun appReturn(resumeToken: String?): JSONObject =
        envelope("customdomain:app-return", JSONObject().apply {
            put("cancelled", resumeToken == null)
            if (resumeToken != null) put("resumeToken", resumeToken)
        })

    /** The Android back button, passed to the widget first. */
    fun back(): JSONObject = envelope("customdomain:back", JSONObject())

    /** The script that delivers a message to the page. */
    fun script(message: JSONObject): String = "window.postMessage(${message}, window.location.origin);"

    private fun envelope(type: String, payload: JSONObject) =
        JSONObject().put("type", type).put("payload", payload)
}

object ReturnLink {
    /** Reads the resume token from an app return link, for example `https://acme.com/cd-return?resume=abc`. */
    fun resumeToken(link: String): String? {
        val query = try { URI(link).rawQuery } catch (e: Exception) { null } ?: return null
        for (pair in query.split("&")) {
            val parts = pair.split("=", limit = 2)
            if (parts[0] == "resume" && parts.size == 2 && parts[1].isNotEmpty()) {
                return java.net.URLDecoder.decode(parts[1], "UTF-8")
            }
        }
        return null
    }
}

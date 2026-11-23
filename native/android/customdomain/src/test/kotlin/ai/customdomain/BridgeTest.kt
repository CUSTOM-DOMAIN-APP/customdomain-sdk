// JVM unit tests for the pure bridge rules: parsing widget messages, building app messages, return links.
// No emulator needed.
// SPDX-License-Identifier: Apache-2.0
package ai.customdomain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BridgeTest {
    @Test fun parsesReady() {
        assertEquals(BridgeEvent.Ready, BridgeParser.parse("""{"type":"customdomain:ready","payload":{}}"""))
    }

    @Test fun ignoresNonWidgetMessages() {
        assertNull(BridgeParser.parse(null))
        assertNull(BridgeParser.parse("not json"))
        assertNull(BridgeParser.parse("""{"type":"other:thing"}"""))
    }

    @Test fun openUrlAcceptsHttps() {
        val event = BridgeParser.parse("""{"type":"customdomain:open-url","payload":{"url":"https://provider.example/auth","kind":"signin","provider":"p"}}""")
        assertEquals(BridgeEvent.OpenUrl(OpenUrlRequest("https://provider.example/auth", "signin", "p", null)), event)
    }

    @Test fun openUrlRejectsOtherSchemes() {
        for (raw in listOf("http://x.example", "javascript:alert(1)", "file:///etc/hosts", "myapp://x", "https://", "")) {
            val event = BridgeParser.parse("""{"type":"customdomain:open-url","payload":{"url":"$raw"}}""")
            assertEquals(raw, BridgeEvent.Other("customdomain:open-url"), event)
        }
    }

    @Test fun successAndError() {
        assertEquals(BridgeEvent.Success("acme.com", null),
            BridgeParser.parse("""{"type":"customdomain:success","payload":{"domain":"acme.com","provider":null}}"""))
        assertEquals(BridgeEvent.Error("NetworkError", "d"),
            BridgeParser.parse("""{"type":"customdomain:error","payload":{"code":"NetworkError","title":"t","details":"d"}}"""))
    }

    @Test fun tokenExpiredAndRequestClose() {
        assertEquals(BridgeEvent.TokenExpired, BridgeParser.parse("""{"type":"customdomain:token-expired"}"""))
        assertEquals(BridgeEvent.Close, BridgeParser.parse("""{"type":"customdomain:request-close"}"""))
    }

    @Test fun capabilitiesMessage() {
        val m = BridgeMessage.capabilities("dark", "en-US", "https://acme.com/cd-return")
        assertEquals("customdomain:capabilities", m.getString("type"))
        val p = m.getJSONObject("payload")
        assertTrue(p.getBoolean("openUrl"))
        assertEquals("android", p.getString("platform"))
        assertEquals("https://acme.com/cd-return", p.getString("appReturn"))
    }

    @Test fun initAndTokenMessages() {
        val p = BridgeMessage.init("t", "acme.com").getJSONObject("payload")
        assertEquals("t", p.getString("token"))
        assertEquals("acme.com", p.getString("domain"))
        assertTrue(BridgeMessage.token(null).getJSONObject("payload").isNull("token"))
    }

    @Test fun appReturnMessage() {
        val done = BridgeMessage.appReturn("abc").getJSONObject("payload")
        assertEquals("abc", done.getString("resume"))
        assertFalse(done.getBoolean("cancelled"))
        assertTrue(BridgeMessage.appReturn(null).getJSONObject("payload").getBoolean("cancelled"))
    }

    @Test fun scriptIsPostMessage() {
        val s = BridgeMessage.script(BridgeMessage.back())
        assertTrue(s.startsWith("window.postMessage({"))
        assertTrue(s.endsWith(", window.location.origin);"))
    }

    @Test fun resumeTokenFromReturnLink() {
        assertEquals("abc123", ReturnLink.resumeToken("https://acme.com/cd-return?resume=abc123"))
        assertEquals("a b", ReturnLink.resumeToken("myapp://customdomain?x=1&resume=a%20b"))
        assertNull(ReturnLink.resumeToken("https://acme.com/cd-return"))
        assertNull(ReturnLink.resumeToken("https://acme.com/cd-return?resume="))
    }

    @Test fun widgetUrlAndOrigin() {
        val c = CustomDomainConfig("app 1", "https://acme.com/cd-return")
        assertEquals("https://app.customdomain.ai/widget/app?app=app+1", c.widgetUrl)
        assertEquals("https://app.customdomain.ai", c.origin)
    }
}

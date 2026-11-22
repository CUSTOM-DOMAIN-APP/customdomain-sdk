// Sample activity: a button that opens the CustomDomain sheet, and the return link hook.
// Replace the application id and the token endpoint with your own; the token must come from your server.
// SPDX-License-Identifier: Apache-2.0
package ai.customdomain.sample

import ai.customdomain.CustomDomain
import ai.customdomain.CustomDomainCallbacks
import ai.customdomain.CustomDomainConfig
import ai.customdomain.CustomDomainSheet
import android.content.Intent
import android.os.Bundle
import android.widget.Button
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val button = Button(this).apply { text = "Connect your domain" }
        setContentView(button)
        button.setOnClickListener {
            CustomDomainSheet.show(
                supportFragmentManager,
                CustomDomainConfig(applicationId = "YOUR_APPLICATION_ID", appReturn = "https://example.com/cd-return"),
                CustomDomainCallbacks(
                    fetchToken = { done -> /* ask your server, then */ done.onToken("TOKEN_FROM_YOUR_SERVER") },
                    onSuccess = { println("Connected ${it.domain}") },
                ),
            )
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        CustomDomain.handleReturn(intent.dataString)
    }
}

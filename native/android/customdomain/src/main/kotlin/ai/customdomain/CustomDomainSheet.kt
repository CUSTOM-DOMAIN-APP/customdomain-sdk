// A full screen dialog fragment that shows CustomDomainView with a close button.
// Use CustomDomainView directly when you want to place the widget in your own layout.
// SPDX-License-Identifier: Apache-2.0
package ai.customdomain

import android.app.Dialog
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageButton
import androidx.fragment.app.DialogFragment
import androidx.fragment.app.FragmentManager

class CustomDomainSheet : DialogFragment() {
    private var config: CustomDomainConfig? = null
    private var callbacks: CustomDomainCallbacks? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setStyle(STYLE_NORMAL, android.R.style.Theme_Material_Light_NoActionBar)
    }

    override fun onCreateDialog(savedInstanceState: Bundle?): Dialog {
        val cfg = config
        val cb = callbacks
        // The sheet cannot be rebuilt after the process dies: the callbacks are gone.
        if (cfg == null || cb == null) { dismissAllowingStateLoss(); return super.onCreateDialog(savedInstanceState) }
        val root = FrameLayout(requireContext())
        val view = CustomDomainView(requireContext())
        root.addView(view, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        val close = ImageButton(requireContext()).apply {
            setImageResource(android.R.drawable.ic_menu_close_clear_cancel)
            contentDescription = "Close"
            setBackgroundColor(0)
            setOnClickListener { dismiss(); cb.onClose() }
        }
        root.addView(close, FrameLayout.LayoutParams(120, 120, Gravity.TOP or Gravity.END))
        view.start(cfg, CustomDomainCallbacks(
            fetchToken = cb.fetchToken,
            onSuccess = cb.onSuccess,
            onError = cb.onError,
            onClose = { dismissAllowingStateLoss(); cb.onClose() },
        ))
        return Dialog(requireContext(), theme).apply {
            setContentView(root)
            setOnKeyListener { _, keyCode, event ->
                val back = keyCode == android.view.KeyEvent.KEYCODE_BACK && event.action == android.view.KeyEvent.ACTION_UP
                if (back) view.onBackPressed() else false
            }
        }
    }

    companion object {
        /** Shows the widget full screen. */
        @JvmStatic
        fun show(manager: FragmentManager, config: CustomDomainConfig, callbacks: CustomDomainCallbacks) {
            CustomDomainSheet().also { it.config = config; it.callbacks = callbacks }.show(manager, "customdomain")
        }
    }
}

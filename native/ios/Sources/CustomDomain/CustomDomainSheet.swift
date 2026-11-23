// A ready made sheet: the widget view with a close button, shown with the usual SwiftUI sheet modifier.
// Use CustomDomainView directly when you want to place the widget in your own screen.
// SPDX-License-Identifier: Apache-2.0
#if canImport(UIKit)
import SwiftUI

public struct CustomDomainSheet: View {
    @Binding var isPresented: Bool
    let configuration: CustomDomainConfiguration
    let callbacks: CustomDomainCallbacks

    public init(isPresented: Binding<Bool>, configuration: CustomDomainConfiguration, callbacks: CustomDomainCallbacks) {
        self._isPresented = isPresented
        self.configuration = configuration
        self.callbacks = callbacks
    }

    public var body: some View {
        NavigationView {
            CustomDomainView(configuration: configuration, callbacks: closing(callbacks))
                .ignoresSafeArea(edges: .bottom)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button { isPresented = false; callbacks.onClose() } label: { Image(systemName: "xmark") }
                            .accessibilityLabel("Close")
                    }
                }
        }
    }

    private func closing(_ base: CustomDomainCallbacks) -> CustomDomainCallbacks {
        var copy = base
        copy.onClose = { isPresented = false; base.onClose() }
        return copy
    }
}

public extension View {
    /// Presents the widget in a sheet.
    func customDomainSheet(isPresented: Binding<Bool>, configuration: CustomDomainConfiguration, callbacks: CustomDomainCallbacks) -> some View {
        sheet(isPresented: isPresented) {
            CustomDomainSheet(isPresented: isPresented, configuration: configuration, callbacks: callbacks)
        }
    }
}
#endif

// Minimal SwiftUI sample: a button that opens the CustomDomain sheet.
// Replace the application id and the token endpoint with your own; the token must come from your server.
// SPDX-License-Identifier: Apache-2.0
import SwiftUI
import CustomDomain

struct ContentView: View {
    @State private var show = false

    var body: some View {
        Button("Connect your domain") { show = true }
            .customDomainSheet(
                isPresented: $show,
                configuration: CustomDomainConfiguration(applicationId: "YOUR_APPLICATION_ID", returnScheme: "customdomainsample"),
                callbacks: CustomDomainCallbacks(
                    fetchToken: {
                        let (data, _) = try await URLSession.shared.data(from: URL(string: "https://your-server.example/customdomain-token")!)
                        return String(decoding: data, as: UTF8.self)
                    },
                    onSuccess: { print("Connected", $0.domain) }))
            .onOpenURL { CustomDomain.handleReturn($0) }
    }
}

# iOS App Target Setup (ROADMAP A6) — the ~20-minute Mac job

**Goal:** turn the current SwiftPM **library** into an **archivable iOS app** so HighlightMagic can be
built, signed, and uploaded to App Store Connect. The autonomous loop CANNOT do this (it runs on Linux,
no Xcode, and must not author/verify an Xcode project blindly) — it's a one-time job on a Mac.

**Current state:** `Package.swift` builds a `.library` target `HighlightMagic` from `Sources/`. The app
ENTRY already exists — `Sources/App/HighlightMagicApp.swift` (`@main`), `Sources/Info.plist` (has the
`NSPhotoLibrary*UsageDescription` strings), and `Sources/HighlightMagic.entitlements`. They just need
wrapping in a real app target with a SHARED, archivable scheme.

**Prereqs:** a Mac with the latest Xcode; an Apple Developer account (for signing — you can create the
target first and sign after).

## Steps (~20 min)
1. Open in Xcode: `open Package.swift` (or File → Open the repo folder).
2. File → New → **Target → iOS App**. Name **`HighlightMagic`**, Interface **SwiftUI**, Language **Swift**,
   Bundle Identifier **`com.highlightmagic.app`**, Minimum Deployments **iOS 18**. (Xcode creates a `.xcodeproj`.)
3. Use the EXISTING code, not Xcode's stubs: delete the generated `App.swift`/`ContentView.swift` stubs and
   add `Sources/App/HighlightMagicApp.swift` (the real `@main`) plus the rest of `Sources/` to the app
   target's **Compile Sources** (or make the app target depend on the local `HighlightMagic` package library).
4. Bind the existing config to the target: **Info.plist → `Sources/Info.plist`**; **Code Signing Entitlements
   → `Sources/HighlightMagic.entitlements`**; set **Marketing Version** (e.g. `1.0`) + **Build** (`1`); confirm
   the photo-library usage strings appear under Info.
5. Capabilities: add what the app uses (Photo Library; StoreKit if in-app purchase; Push if used).
6. **Make the scheme SHARED:** Product → Scheme → Manage Schemes → check **Shared** for the `HighlightMagic`
   scheme (so it commits under `*.xcodeproj/xcshareddata/xcschemes/` and CI + archive can use it).
7. Signing: select your **Team**; leave "Automatically manage signing" on (or set a provisioning profile).
8. **Verify it ARCHIVES** (the real A6 gate, not "it compiles"): Product → **Archive** (Any iOS Device) →
   a valid archive appears in the Organizer. CLI sanity: `xcodebuild -scheme HighlightMagic -showBuildSettings`
   resolves and `xcodebuild -scheme HighlightMagic archive -archivePath build/HM.xcarchive` succeeds.
9. **Commit** the `.xcodeproj` + shared scheme to the repo — keep the scheme named `HighlightMagic` so the
   existing `ios` CI (`xcodebuild -scheme HighlightMagic … build test`) keeps working.

## After this (human-core release chain — still owner-only, see REMAINING_STEPS.md)
App Store Connect app record (bundle id `com.highlightmagic.app`) → upload screenshots + preview → Archive →
Upload → Submit. Signing certs / provisioning / submission are Apple-account actions the loop can't take.

## Optional (prevents A6 regressing)
Once the `.xcodeproj` + shared scheme are committed, extend the `ios` CI job with an unsigned
`xcodebuild -scheme HighlightMagic archive` step so the archivable config stays green automatically.

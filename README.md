# Highlight Magic

A freemium iOS app that turns raw personal videos into share-ready short highlights automatically.

## Features

- **Smart Video Analysis**: On-device AI using Vision framework (motion, face, scene detection) to find the best moments
- **Prompt-Guided Detection**: Optional text prompts to focus on specific highlight types
- **Clip Editor**: Trim, add captions, choose filters, pick background music
- **Vertical Export**: Optimized 1080x1920 MP4 output for TikTok/Reels/Shorts
- **Share Sheet**: Direct sharing to social platforms
- **Freemium Model**: 5 free exports/month with watermark; Pro subscription removes limits

## Requirements

- iOS 18.0+
- Xcode 16.0+
- Swift 6.0

## Architecture

- **SwiftUI + MVVM** with `@Observable` macro
- **Swift 6 strict concurrency** with actors for all services
- **AVFoundation** for video composition and export
- **Vision framework** for on-device highlight detection
- **StoreKit 2** for subscription management

## Project Structure

```
Sources/
  App/           - App entry point and global state
  Models/        - Data models (VideoItem, HighlightSegment, EditedClip, etc.)
  Views/
    Screens/     - Full-screen views (Home, Editor, Export, Paywall, etc.)
    Components/  - Reusable UI components
  Services/      - Business logic (detection, export, thumbnails, StoreKit)
  Utilities/     - Constants, theme, extensions
  Resources/     - Asset catalog, StoreKit config
```

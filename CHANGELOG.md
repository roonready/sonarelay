# Changelog

Versions follow Semantic Versioning. Stable releases use `x.y.z`; beta releases use `x.y.z-beta.N`.

## [1.4.0-beta.10] - 2026-11-24

- Use MP3 for DLNA receivers that advertise MP3 support without FLAC support.
- Make the updates panel more compact.

## [1.4.0-beta.9] - 2026-11-23

- Include the album artist and track number in Last.fm Now Playing and scrobbles when Windows provides them.

## [1.4.0-beta.8] - 2026-11-23

- Add a checkbox on the Windows installer finish page to launch SonaRelay after installation or update.

## [1.4.0-beta.7] - 2026-11-23

- Find BluOS players using mDNS and Lenbrook UDP discovery. Startup and manual scans also check the standard BluOS port on the selected /24 subnet.

## [1.4.0-beta.6] - 2026-11-23

- Compact always-on-top receiver panel with track, artist and artwork from Windows GSMTC.
- WASAPI Process Loopback captures PCM from the source process tree for network relay.
- Last.fm tracks listening progress from the GSMTC timeline.
- The panel starts at 320 × 520 and discovers receivers through an automatically selected network interface.
- A connected Last.fm account gets a profile link directly below the current track.

## [1.4.0-beta.5] - 2026-11-18

### Fixed

- Keep the selected volume slider position while dragging and while the output confirms the change.
- Remove horizontal scrolling from the volume controls.

## [1.4.0-beta.4] - 2026-11-18

### Changed

- Compact left sidebar on short windows, with scrolling confined to individual sections when needed.

## [1.4.0-beta.2] - 2026-11-18

### Changed

- The track card shows the catalog provider separately from the album label.

## [1.3.0] - 2026-11-17

### Added

- A Windows master-volume slider for local output, available before playback and refreshed when the system volume changes. Existing mute state is preserved.

### Changed

- Selecting a supported output sets its volume to 10 before playback is allowed, including the Windows master volume for local output. Starting a stream preserves subsequent manual volume adjustments; discovery refreshes do not reset them.

## [1.2.0] - 2026-11-16

### Added

- Separate local `release:beta` and `release:stable` publishing commands with version/channel validation.

### Changed

- Development and installed builds use separate Chromium profiles; a second launch of the same profile focuses the existing window instead of sharing its cache.

## [1.2.0-beta.1] - 2026-11-16

### Added

- Separate local `release:beta` and `release:stable` publishing commands with version/channel validation.

### Changed

- Development and installed builds use separate Chromium profiles; a second launch of the same profile focuses the existing window instead of sharing its cache.

## [1.1.1-beta.1] - 2026-11-16

### Fixed

- Show the specific localized Last.fm error when Electron wraps an IPC failure in another Error object.

### Added

- Safe diagnostics for rejected Last.fm authorization responses, reporting response type and token length without exposing tokens or API credentials.
- Regression tests for wrapped authorization errors and secret-free diagnostics.

### Known limitations

- This prerelease is intended for testing Last.fm connection. A reported failure to recognize an authorization token is still under investigation; isolated requests from Node.js and Electron succeeded.
- Last.fm requires locally configured application credentials and browser authorization. Credentials are not included in the installer.
- Stable installations do not automatically receive this beta. Install its Windows x64 installer manually to opt in.

## [1.1.0] - 2026-11-16

### Added

- GitHub Releases publishing from a local Windows x64 computer using electron-builder and NSIS.
- Automatic startup update checks, background downloads, progress and an explicit restart-to-install action.
- Separate stable and beta update policies; stable installations do not receive beta releases.
- English and Russian interface with a saved language preference.
- SonaRelay logo, application icon and favicons.
- Apache License 2.0 and local release documentation.

### Changed

- Unified application branding as SonaRelay.
- User documentation is available in English first, followed by Russian.
- Removed track information and diagnostic counters from the main interface.

## [1.0.3]

- Earlier local Windows installer baseline, before GitHub auto updates were added.

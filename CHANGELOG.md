# Changelog

Versions follow Semantic Versioning. Stable releases use `x.y.z`; beta releases use `x.y.z-beta.N`.

## [1.3.0] - 2026-11-17

### Added

- A Windows master-volume slider for local output, available before playback and refreshed when the system volume changes. Existing mute state is preserved.
- Collapsible radio stream details: source codec, sample rate, channels, bit depth and known bitrate, shown separately from the output encoding. Station-declared bitrate is labelled separately from actual stream data.

### Fixed

- Restored receiver volume controls during radio playback; the output panel is no longer limited to Yandex Music mode.
- Receiver volume can be read and adjusted before starting a stream. Radio start waits while a volume request is pending; unknown values are shown explicitly.

### Changed

- Selecting a supported output sets its volume to 10 before playback is allowed, including the Windows master volume for local output. Starting a stream preserves subsequent manual volume adjustments; discovery refreshes do not reset them.

## [1.2.1] - 2026-11-17

### Changed

- Removed the Yandex Music button from the interface. The source panel now contains only Наше Радио and Radio Calico.
- Updated UI smoke checks for the two radio buttons.

## [1.2.0] - 2026-11-16

### Added

- A versioned first-use Yandex Music sign-in notice, with local acknowledgment, session-storage information and cancellation before switching sources.
- Separate local `release:beta` and `release:stable` publishing commands with version/channel validation.
- Direct internet radio sources: Наше Радио and Radio Calico, each with its own start/stop button.
- Streaming HTTP redirects, optional ICY metadata, bounded PCM decoding using the bundled FFmpeg, and native Windows audio output through WinMM.
- Radio output through the existing network receiver pipeline, with no additional media server.
- Tests for redirects, interrupted streams, cancellation, station switching, native playback and the real application buttons.
- Radio Now Playing and scrobbling through the shared Last.fm service, with catalog duration lookup, a four-minute fallback for unknown radio durations, and visible accepted-submission status.

### Changed

- Development and installed builds use separate Chromium profiles; a second launch of the same profile focuses the existing window instead of sharing its cache.
- Yandex Music now opens only when its source button is selected. Radio playback does not create an embedded music browser or require browser cookies.
- Radio and Yandex Music share Last.fm settings and submission handling. MusicBrainz is not used.

### Validation

- Real native playback and application button tests were performed on Windows 11. Windows 10 compatibility still requires a separate machine test.

## [1.2.0-beta.1] - 2026-11-16

### Added

- A versioned first-use Yandex Music sign-in notice, with local acknowledgment, session-storage information and cancellation before switching sources.
- Separate local `release:beta` and `release:stable` publishing commands with version/channel validation.
- Direct internet radio sources: Наше Радио and Radio Calico, each with its own start/stop button.
- Streaming HTTP redirects, optional ICY metadata, bounded PCM decoding using the bundled FFmpeg, and native Windows audio output through WinMM.
- Radio output through the existing network receiver pipeline, with no additional media server.
- Tests for redirects, interrupted streams, cancellation, station switching, native playback and the real application buttons.
- Radio Now Playing and scrobbling through the shared Last.fm service, with catalog duration lookup, a four-minute fallback for unknown radio durations, and visible accepted-submission status.

### Changed

- Development and installed builds use separate Chromium profiles; a second launch of the same profile focuses the existing window instead of sharing its cache.
- Yandex Music now opens only when its source button is selected. Radio playback does not create an embedded music browser or require browser cookies.
- Radio and Yandex Music share Last.fm settings and submission handling. MusicBrainz is not used.

### Validation

- Real native playback and application button tests were performed on Windows 11. Windows 10 compatibility still requires a separate machine test.

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

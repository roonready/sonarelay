# Changelog

Versions follow Semantic Versioning. Stable releases use `x.y.z`; beta releases use `x.y.z-beta.N`.

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

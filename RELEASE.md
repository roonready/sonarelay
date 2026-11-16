# Local Windows builds and GitHub Releases

This is the maintainer guide. The user guide is [README.md](README.md).
All installers are built on the developer's Windows x64 computer using Electron, electron-builder and NSIS. No GitHub Actions build or custom update server is used.

## One-time repository setup

Install Node.js and Git for Windows. In PowerShell, open this project folder and run:

```powershell
npm.cmd ci
npm.cmd run configure:github -- roonready/sonarelay
```

The configured destination is `roonready/sonarelay`. The command updates `release.config.json` and the repository links in `package.json`. The repository address is public information and belongs in source control. Use a different owner/repository only if you intend to move the release source.

Create a public repository named SonaRelay on GitHub without initializing it with additional files. Alternatively, run `npm.cmd run github:create` after setting `GH_TOKEN` as described below. The command creates a public repository or verifies that an existing one is public; it never changes an existing private repository's visibility.

If this folder is not already a Git repository:

```powershell
git init -b main
git add .
git commit -m "Prepare SonaRelay public release"
git remote add origin https://github.com/roonready/sonarelay.git
git push -u origin main
```

For an existing repository, inspect `git remote -v` and use its normal commit/push workflow. Keep `project-history.md`, `.env` files, local Last.fm keys, build outputs and tokens out of Git. `.gitignore` covers these local files; ignoring a file does not untrack an already committed copy.

## GitHub token

Publishing reads a GitHub Personal Access Token from **GH_TOKEN** in the local process environment. If it is unset, the release command loads the project's ignored `.env` file. Keep that file local. Never put a real token in tracked JSON/YAML, npm scripts, commits, command arguments, or the distributed app. Environment values take precedence over `.env`.

For an existing repository, a fine-grained PAT needs access to that repository and **Contents: Read and write** for releases and tags. Creating a repository additionally requires repository-creation permissions; you can create the repository in the GitHub UI instead. A classic PAT can use `public_repo` for public repositories.

To enter a token without putting it in PowerShell history:

```powershell
$releaseToken = Read-Host 'GitHub PAT' -AsSecureString
$releaseCredential = [System.Net.NetworkCredential]::new('', $releaseToken)
$env:GH_TOKEN = $releaseCredential.Password
Remove-Variable releaseCredential, releaseToken
```

After publishing, remove it from the shell:

```powershell
Remove-Item Env:GH_TOKEN
```

Installed apps read public GitHub Releases anonymously. Their update configuration contains the public repository address, not the publishing token.

## Local application build

```powershell
npm.cmd run build
```

Compiled application files are written to `out/`.

## Local installer, without publishing

Configure the real repository first, then run:

```powershell
npm.cmd run dist
```

This runs type checks, tests, the application build and NSIS packaging. It never uploads files. The installer is `dist/SonaRelay-Setup-<version>-x64.exe`.

Run `node scripts/verify-dist.cjs` to check the packaged application, public feed, matching versions and SHA-512 metadata, blockmap, FFmpeg and installer integrity.

`dist/` also contains the installer blockmap and `latest.yml` for a stable build, or `beta.yml` for a beta build. The installed app includes electron-builder's generated `app-update.yml`. No separate update URL needs to be maintained.

For an unpacked local build:

```powershell
npm.cmd run dist:unpacked
```

The update flow is intended for NSIS-installed builds. Development runs do not check for updates.

Development uses `%APPDATA%\sonarelay-dev`, while installed builds keep `%APPDATA%\sonarelay`. Chromium sessions and caches are separate, so running both does not make them share locked browser files. Each profile allows one running instance. Development can read the installed profile's Last.fm application keys as a fallback; its authorization session and browser logins remain separate. An explicit `--user-data-dir` is respected and does not use production credentials as a fallback.

## Publish an update

1. Choose a new Semantic Version and update it with npm. Do not reuse a published version.
2. Add a matching `## [<version>]` section and notes to `CHANGELOG.md`.
3. Commit and push all source changes to the configured repository.
4. Set `GH_TOKEN` in the current PowerShell session.
5. Run `npm.cmd run release:beta` or `npm.cmd run release:stable` locally on Windows x64. Each command checks that the package version belongs to its channel, preventing accidental publication to the other channel. The generic `release` command remains available for compatibility.

Stable example:

```powershell
npm.cmd version 1.2.0 --no-git-tag-version
# Edit CHANGELOG.md, then commit and push the changes.
npm.cmd run release:stable
```

Beta example:

```powershell
npm.cmd version 1.2.0-beta.1 --no-git-tag-version
# Edit CHANGELOG.md, then commit and push the changes.
npm.cmd run release:beta
```

The release script requires a clean Git checkout and verifies that the current commit exists in the public repository. It runs all checks and builds locally. **electron-builder GitHub Publisher** uploads the installer, update metadata and blockmap into a draft release. Only after the required assets exist does the script publish the release, marking beta versions as prereleases. It never publishes incomplete uploads intentionally. A failed upload can leave a draft; inspect it and retry the same unpublished version if appropriate.

Release tags are `v<package.json version>`, for example `v1.1.1` or `v1.2.0-beta.1`. The release name, updater metadata and installer use the same version. No token is supplied to electron-builder configuration or embedded into the app.

## Channels and installation

| Installed build | Update policy | Metadata |
| --- | --- | --- |
| Stable `x.y.z` | Newer stable versions only | `latest.yml` |
| Beta `x.y.z-beta.N` | Newer beta versions and newer stable releases | `beta.yml`, with stable metadata fallback provided by electron-updater |

The channel is derived from the installed version. A stable user opts into beta by deliberately installing a beta installer. There is no automatic stable-to-beta transition. Downgrades and prereleases other than `beta.N` are rejected by the app. To leave beta before a newer stable version exists, install the desired stable version manually.

At startup, installed Windows builds check GitHub Releases. A new version is shown in the app and downloaded in the background. The panel shows progress and a **Restart and install** button when ready. Closing the app normally does not install a pending update. Pressing the button finishes the existing shutdown routine before starting the installer. Network or download errors are shown in English or Russian and can be retried.

## Verification before a public rollout

Install one NSIS version, publish a higher version, and verify discovery, download progress, restart and the resulting installed version on Windows. Test stable against an available higher beta to confirm that it stays on stable, and test a beta installation against a higher beta and a subsequent stable release. A unit test or a successful installer build does not replace this real two-version update test.

The app currently uses unsigned Windows installers. The configured checksums still validate downloaded artifacts; code signing can be added separately when a publisher certificate is available. Keep the app ID and installation mode stable between versions so updates target the existing installation.

Reference: [electron-builder auto updates](https://www.electron.build/docs/features/auto-update/), [GitHub Publisher](https://www.electron.build/docs/publish/).

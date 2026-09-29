# VOID Browser

VOID includes a compact tabbed browser with these tools:

- **Pull-out tabs:** drag tabs to reorder them, or drag one outside the window to open it in its own browser window.
- **Music:** switch between Spotify and a local player that imports audio files, keeps them in your library, and reports playback problems instead of silently failing.
- **Bookmarks:** save the current page with the star button and open saved pages from the list button beside it.
- **Screenshots:** save an image of the current page from the camera button.
- **Picture in picture:** hover over a video and use the small floating button on the video to pop it out.
- **New tab wallpapers:** set a static image or build a still design with custom colors and patterns, or choose Matrix-style falling text, moving wave lines, breathing hexagons, a GIF, or a looping MP4/WebM. Animations pause when the new tab is hidden.
- **Ad and tracker blocking:** toggle it from the status bar.
- **Low overhead interface:** compact controls, reduced-motion support, and no extra browser framework.

Keyboard shortcuts include `Ctrl+T` for a new tab, `Ctrl+L` for the address bar,
`Ctrl+D` to bookmark a page, and `Ctrl+Shift+M` to open Music.

## Run from source

Install Node.js 22.12 or newer, then open a terminal in this folder and run:

```powershell
npm install
npm start
```

## Build the Windows installer

On a 64-bit Windows computer, run:

```powershell
npm run dist:win
```

The setup program will be written to `dist/VOID-Browser-Setup-0.8.4-x64.exe`.
It uses an assisted installer so you can choose the install folder. It installs
for the current Windows user by default, creates Start menu and desktop
shortcuts, offers to launch VOID when setup finishes, and keeps the browser's
user data if you later uninstall it.

`npm run dist` is an alias for the Windows installer build.

## Build the macOS installers

macOS app packages need to be built on a Mac. The included GitHub Actions workflow
does this on a Mac runner and creates separate DMG files for Intel and Apple Silicon.
In GitHub, open **Actions → Build macOS installers → Run workflow**, then download
the `VOID-Browser-macOS-...` artifact from the completed run. It contains both DMGs.

On a Mac with Node.js 22.12 or newer, run:

```bash
npm ci
bash scripts/create-mac-icon.sh
npm run dist:mac
```

The app is not signed or notarized. macOS may show a security warning on first launch;
trusted distribution requires an Apple Developer signing certificate and notarization.

The installer is not signed with a publisher certificate, so Windows may show
a security prompt when it is run. A code-signing certificate is needed for a
trusted publisher name.

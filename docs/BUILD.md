# Building the SA Copilot installers

## Windows (.exe) — on Windows 10/11 x64

1. Node 22+ and this repo with `npm install` done.
2. Optional: `DECK_TEMPLATE` in `.env` pointing at the pitch deck `.pptx` (bundled into the installer).
3. `npm run dist:win` → `release/SA Copilot Setup <version>.exe` (the first run downloads a portable Python and the pip packages).

## macOS (.dmg) — on a Mac

1. Install Node 22+ (`brew install node`) and Xcode command line tools (`xcode-select --install`).
2. On Apple Silicon also install Rosetta (needed to prepare the Intel build's Python): `softwareupdate --install-rosetta --agree-to-license`.
3. Copy the repo to the Mac, `npm install`, optional `DECK_TEMPLATE` in `.env`.
4. `npm run dist:mac` → `release/SA Copilot-<version>-arm64.dmg` (Apple Silicon) and `…-x64.dmg` (Intel).

The macOS icon (`build/icon.png`) is currently the 256 px Windows icon scaled to 1024 px; replace it with a real 1024×1024 export for a sharp Dock icon.

## Opening the unsigned app

- **Windows:** SmartScreen says "Windows protected your PC" → **More info** → **Run anyway**.
- **macOS:** open the DMG, drag SA Copilot to Applications. First launch: right-click the app → **Open** → **Open**. If macOS says the app "is damaged", run `xattr -dr com.apple.quarantine "/Applications/SA Copilot.app"` in Terminal and open it again.

## First start

The Setup screen asks for the 9router API key: click **Open 9router dashboard**, sign in to your provider, create a key, paste it. Everything else is in **Settings → Connections**. To move data from another device use **Settings → Backup**.

Data lives in `%APPDATA%\SA Copilot` (Windows) or `~/Library/Application Support/SA Copilot` (macOS) and is kept on uninstall/update. Logs: Settings → Connections → **Open logs**.

## Running the desktop app from the repo

`npm run desktop` builds the UI, bundles the server and starts Electron (it works from VS Code terminals too, which set `ELECTRON_RUN_AS_NODE`). Set `SA_COPILOT_DATA_DIR` to use a throwaway data folder.

## macOS test checklist (after `npm run dist:mac`)

- [ ] Install the DMG for your Mac's architecture; first launch via right-click → Open works.
- [ ] Splash goes through database → AI router → SA Copilot; the Setup screen appears.
- [ ] After entering the 9router key, Settings → Connections → **Test connection** lists models.
- [ ] Upload a PDF in Requirements → it is converted (markitdown works).
- [ ] Generate the pitch deck → the `.pptx` downloads (python-pptx works).
- [ ] Settings → Backup → Download backup, then Restore it → data unchanged.
- [ ] Quit (⌘Q) → `ps aux | grep -E 'postgres|9router|server-dist' | grep -v grep` shows nothing from SA Copilot.
- [ ] Reopen → projects are still there.

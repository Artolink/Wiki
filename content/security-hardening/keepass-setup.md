---
title: "All your passwords in one vault: KeePass 2 with OTP and browser autofill"
tags:
  - Utilities
---

## Why a local password vault

Cloud password managers are convenient... until a breach happens.

The alternative is **self-hosting**: a single encrypted file under your control, synced however you want (Dropbox, OneDrive, Syncthing, USB key... or nothing at all).

[KeePass 2](https://keepass.info/) is the canonical open-source option:
- one `.kdbx` file, AES-256/ChaCha20 encrypted, opened with a master password (and optionally a key file or hardware token).
- offline-first: no breach possible by design unless your local machine is owned.
- extensible via plugins: including the two we're adding here, **KeePassOTP** for two-factor codes and **KeePassRPC** for browser autofill.

KeePass 1 is the old line and unmaintained; **always pick KeePass 2**.

## Install KeePass 2

Windows:
1. Download the latest installer from https://keepass.info/download.html (pick **Professional Edition**, the regular one).
2. Run it, accept defaults. Installation lands in `C:\Program Files\KeePass Password Safe 2\`.
3. First launch: the *Plugins* folder it'll need is `C:\Program Files\KeePass Password Safe 2\Plugins\` (on most installs you'll need admin rights to drop files there: explorer asks for elevation automatically).

The portable ZIP also works if you want everything in one folder: useful on a USB stick.

## Create the first database

1. *File → New* → pick a path for the `.kdbx` (Dropbox / OneDrive folder is fine, the file is encrypted at rest).
2. **Master password** — long, memorable, **only one** you ever need to remember. Use a passphrase: `correct-horse-battery-staple` style, 4+ random words is plenty.
3. Optional but recommended: **key file** alongside the master password. The vault then needs *both* to open — useful if the `.kdbx` ever leaks. Of course store the key file separately (NOT in the same cloud folder!)

Each entry has *Title / User / Password / URL / Notes* plus arbitrary custom fields. 

Use **groups** (folders) to organize.

## Plugin 1 — KeePassOTP (TOTP / 2FA codes inside the vault)

Stop juggling between the password manager and Google Authenticator on the phone: store the OTP secret next to the password it protects.

### Install

1. Grab `KeePassOTP.plgx` from the [releases page](https://github.com/Rookiestyle/KeePassOTP/releases).
2. Drop the `.plgx` file into `C:\Program Files\KeePass Password Safe 2\Plugins\`.
3. Restart KeePass. The plugin appears in *Tools → KeePassOTP*.

### Configure OTP for an entry

1. Open the entry (the one for the site that uses 2FA).
2. Right-click → **OTP → Settings**.
3. Paste the **base32 secret** the site provides (you can also scan or drag/drop the QR code in the *QR code reader* tab).

The entry now shows the live 6-digit code in a column and copies it to the clipboard with a hotkey (default `Ctrl+T`).

The code refreshes every 30s like any TOTP app.

## Plugin 2 — KeePassRPC + Kee (browser autofill)

Manual copy-paste from KeePass to the browser is fine but slow. The pair **KeePassRPC** (KeePass-side plugin) + **Kee** (browser extension) wires them together: the extension talks to KeePass over a local WebSocket and autofills login forms.

### Install KeePassRPC

1. Download `KeePassRPC.plgx` from https://github.com/kee-org/keepassrpc/releases.
2. Drop into the same `Plugins/` folder.
3. Restart KeePass. *Tools → KeePassRPC (idle)* should appear in the menu.

KeePassRPC opens a WebSocket on `localhost:12546`: only the browser extension on the same machine can reach it, but if a corporate firewall complains, that's the port to whitelist.

### Install Kee in the browser

- Firefox: https://addons.mozilla.org/en-US/firefox/addon/kee/
- Chrome / Edge: search "Kee" in the relevant store, or grab from https://www.kee.pm/.

### First connection

1. With KeePass open and the database **unlocked**, install/launch Kee in the browser.
2. KeePass will pop up a dialog: *"A new client (Kee) is asking to connect"*. Verify the unique key/auth code matches what Kee shows in the browser, click **Yes**.
3. Done: Kee now sees all your entries.

## Things to know

- For mobile access, [KeePassDX](https://www.keepassdx.com/) (Android) or [Strongbox](https://strongboxsafe.com/) (iOS) read the same `.kdbx`, so same OTP secrets and entries.
- **Backup is your responsibility.** No cloud sync = no automatic recovery. Keep multiple encrypted copies. The vault file is small (KBs), no excuse not to.
- **OTP doesn't replace true 2FA**: if you want true 2FA, keep OTPs on a separate device (phone). Tradeoff between convenience and security: pick consciously.

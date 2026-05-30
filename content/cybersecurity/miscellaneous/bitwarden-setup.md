---
title: "Cloud password manager done right: Bitwarden"
tags:
  - Utilities
---

## Why Bitwarden

Bitwarden is the open-source cloud counterpart to [[keepass-setup|KeePass]]. 

Same goal: one master password unlocks every other credential you own, but instead of a local `.kdbx` file synced manually, Bitwarden runs a cloud vault that syncs automatically across all your devices.

Free for personal use (unlimited entries, unlimited devices), audited regularly, and the **server is also open source**: you can self-host it if you don't want to trust the official cloud.

## Bitwarden vs KeePass

The two cover the same need from opposite philosophies.

Pick based on your priorities:

| Aspect              | Bitwarden                                             | [[keepass-setup                              |
| ------------------- | ----------------------------------------------------- | -------------------------------------------- |
| Storage             | Cloud (or self-hosted server)                         | Local `.kdbx` file                           |
| Sync across devices | Automatic, real-time                                  | DIY (Dropbox, Syncthing, USB...)             |
| Browser autofill    | Official extension, just works                        | Requires KeePassRPC plugin + Kee extension   |
| TOTP / 2FA codes    | Built in (Premium plan or self-host)                  | Free via KeePassOTP plugin                   |
| Offline access      | Cached locally. works offline, syncs when back online | Native (no internet ever needed)             |
| Breach risk         | Server-side (encrypted vault, but still cloud)        | Only if your local file leaks                |
| Setup effort        | ~5 minutes (account + extension)                      | 20+ minutes (install + plugins + sync setup) |
| Cost                | Free tier covers 99% of personal use                  | Free forever, no tiers                       |

>[!TLDR]
>**Bitwarden** if you have multiple devices and want zero-effort sync; **KeePass** if you want absolute control and don't trust any cloud (even encrypted).

You can also use **both**: Bitwarden for daily-use accounts, KeePass for the high-risk stuff (root passwords, recovery codes, crypto seeds...).

## Account setup

1. Go to https://vault.bitwarden.com and click **Create account**.
2. **Master password**: long, memorable, *the only one you'll ever need to remember*.
   **There is no recovery**: if you lose it, your vault is gone forever. Write it down on paper and store it somewhere physically safe (a sealed envelope in a drawer is fine, physical attackers are rarely your real threat model).
3. Optional but recommended: enable **2FA on the account itself** (*Settings → Two-step Login*). TOTP via an authenticator app works fine.
4. Free plan covers unlimited entries, unlimited devices, and sharing with one other user. Premium (~$10/year) adds built-in TOTP codes, file attachments, and emergency access.

## Browser extension

Install only from the official stores (don't grab random forks):

- Firefox: https://addons.mozilla.org/firefox/addon/bitwarden-password-manager/
- Chrome / Edge / Brave: search *"Bitwarden Password Manager"* in the relevant store
- Safari: Mac App Store

After login, the extension auto-detects forms and offers to autofill. 

Two shortcuts worth memorising:

- `Ctrl+Shift+L`: autofill the current page
- `Ctrl+Shift+Y`: open the extension popup

## Mobile app

Same login on Android (Play Store) or iOS (App Store).

On Android, enable **Autofill service** (*Settings → Autofill service → Bitwarden*) to get autofill in any app, not just the browser. 

On iOS the equivalent is *Settings → Passwords → AutoFill Passwords*.

## Importing from KeePass

If you're migrating from [[keepass-setup|KeePass]]:

1. In KeePass: *File → Export → KeePass XML (2.x)* → save the `.xml` somewhere temporary.
2. In Bitwarden vault (web): *Tools → Import data → File format: KeePass 2 XML* → upload.
3. Entries, folders, custom fields, and attachments are preserved. TOTP secrets require the Premium plan to be stored and used.
4. **After verifying the import**, securely delete the XML export: it contains your passwords in *plaintext*!

## Self-hosted option: Vaultwarden

If you'd rather not trust the official cloud, [Vaultwarden](https://github.com/dani-garcia/vaultwarden) is a Rust reimplementation of the Bitwarden server. 

Same API → the official clients (browser extension, mobile app, desktop) connect to it transparently. 

Runs as a single Docker container in ~50 MB of RAM:

```bash
docker run -d --name vaultwarden \
  -e DOMAIN=https://vault.yourdomain.com \
  -v /opt/vaultwarden:/data \
  -p 8080:80 \
  vaultwarden/server:latest
```

Put it behind nginx + Certbot for HTTPS (see [[nginx-web-server-setup|nginx setup]] + [[certbot-setup-guide|Certbot setup]]), then point the official Bitwarden clients at `https://vault.yourdomain.com` instead of the default cloud. 

You get **the same UX as Bitwarden cloud, on your own server**: and all the Premium features (TOTP, attachments) are free in Vaultwarden.

## Things to know

- **Bitwarden is end-to-end encrypted**: the server sees only ciphertext. Even Bitwarden Inc. can't read your vault. But trust depends on the client (browser extension, mobile app) being unmodified: install only from official stores!
- **For high-value secrets** (root passwords, crypto seeds, recovery codes for your account 2FA itself), consider keeping them in an offline [[keepass-setup|KeePass vault]] *outside* Bitwarden.
- **Browser extension auto-lock**: default is 15 minutes idle. *Settings → Account security → Vault timeout*: drop it to 5 minutes on shared or work machines.
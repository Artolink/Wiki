---
title: Visual Studio Code - Reference Guide
---

## Installation

### Windows
1. Go to [https://code.visualstudio.com](https://code.visualstudio.com) and download the installer (`.exe`).
2. Run the installer and follow the setup wizard.
3. Check **"Add to PATH"** during installation to use `code` from the terminal.
### Linux (Debian/Ubuntu)
```bash
sudo apt update
sudo apt install wget gpg
wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > packages.microsoft.gpg
sudo install -o root -g root -m 644 packages.microsoft.gpg /etc/apt/trusted.gpg.d/
sudo sh -c 'echo "deb [arch=amd64] https://packages.microsoft.com/repos/code stable main" > /etc/apt/sources.list.d/vscode.list'
sudo apt update
sudo apt install code
```

***

## Keyboard Shortcuts

### Multi-Cursor & Selection

| Shortcut | Description |
|---|---|
| `ALT + Click` | Add a cursor at each clicked position — lets you edit multiple lines simultaneously at arbitrary points. |
| `CTRL + ALT + ↑ / ↓` | Add cursors on the lines above or below the current one — useful for editing consecutive lines. |
| `CTRL + ← / →` | Move all active cursors one **word/block** at a time (no selection). |
| `CTRL + SHIFT + ← / →` | Move all active cursors one **word/block** at a time, **extending the selection** (highlighted in blue). |
| `SHIFT + ← / →` | Move all active cursors one **character** at a time, extending the selection — behaves like standard single-cursor selection. |
| `CTRL + SHIFT + L` | Select **all occurrences** of the current word or highlighted text in the file and place a cursor on each one — ideal for bulk renaming. |

### Line Management

| Shortcut | Description |
|---|---|
| `ALT + ↑ / ↓` | Move the current line (or selected lines) **up or down**, swapping position with the adjacent line. |
| `ALT + Z` | Toggle **word wrap** — when a line extends beyond the visible screen width, it wraps onto the next visual line instead of requiring horizontal scrolling. |

***

## Regular Expressions (Regex)

> 🚧 *This section is a placeholder — content coming soon.*
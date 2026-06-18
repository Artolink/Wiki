---
title: 🐍 Python
---
## When to use Python (vs Bash / Ansible)

> [!TIP]
> Reach for **Python** when a Bash script would get complex: real data structures, parsing JSON/YAML/CSV, HTTP/API calls, non-trivial logic and error handling, or anything you'll maintain and test. 
> 
> Keep **Bash** for short ops, and use **Ansible** to configure fleets of machines.
> Rule of thumb: if a Bash script grows past ~100 lines or starts manipulating data, consider rewriting it in Python.

## Guidelines for a Python script

### Skeleton & safety
* Start with `#!/usr/bin/env python3` and a **module docstring** (what it does, usage, requirements).
* Put logic in functions; end with `if __name__ == "__main__": sys.exit(main())`.
* Use **type hints** and keep it **`ruff` / `black`-clean** (+ `mypy` for types).
* Run it in a **virtualenv**: pin dependencies in `requirements.txt` / `pyproject.toml`, don't rely on system-wide `pip`.

### Arguments & usage
* Offer a `--dry-run` (`action="store_true"`) that changes nothing. For destructive scripts, consider dry-run as the default + an explicit `--apply`.

### Robustness
* Catch **specific** exceptions (never bare `except:`): fail with a clear message and a non-zero exit.
* Make it **idempotent**, and check inputs/dependencies up front (`Path.is_file()`, `shutil.which(...)`).
* Avoid mutable default arguments: prefer f-strings.

### Running commands & services
* **Validate config before reload/restart** (`sshd -t`, `nginx -t`…): reload only if something actually changed, and prefer `reload` over `restart`.

### Files
* Check a path exists before reading/editing it.
* **Back up before overwriting** (timestamped) and **verify the backup** before touching the original.

### Secrets & privileges
* **Never hardcode secrets**: read from env (`os.environ`) or **`getpass.getpass()`** at runtime, never log them.
* If root is required, check **`os.geteuid() == 0`** early and exit with a clear message otherwise.

### Output, logging, exit codes
* Use the **`logging`** module (not `print`) for logs → **stderr**: reserve **stdout** for real data.
* Return **meaningful exit codes** via `sys.exit(...)` (0 = success, non-zero on failure): print a final summary if the script does several things.

## A minimal script that follows all of the above

> [!EXAMPLE]- A minimal script that follows all of the above
> `ensure_setting.py`: makes sure a `key value` line exists in a config file, backs it up, validates, and reloads the service **only if it changed**. 
> 
> Re-running it does nothing once the setting is in place.
>
> ```python
> #!/usr/bin/env python3
> """ensure_setting.py — ensure a "key value" line exists in a config file,
> then reload a service only if the file actually changed.
>
> Idempotent: re-running changes nothing once the setting is in place.
>
> Usage:   ensure_setting.py [--dry-run] <config-file> <key> <value>
> Example: ensure_setting.py /etc/ssh/sshd_config MaxAuthTries 3
> Requires: root
> """
> from __future__ import annotations
>
> import argparse
> import logging
> import os
> import shutil
> import subprocess
> import sys
> from datetime import datetime
> from pathlib import Path
>
> SERVICE = "sshd"  # service to reload on change ("sshd -t" tests its config)
>
> logging.basicConfig(
>     level=logging.INFO,
>     format="%(asctime)s  %(levelname)s  %(message)s",
>     datefmt="%Y-%m-%d %H:%M:%S",
>     stream=sys.stderr,
> )
> log = logging.getLogger("ensure-setting")
>
>
> def parse_args() -> argparse.Namespace:
>     p = argparse.ArgumentParser(description="Ensure 'key value' is set in a config file.")
>     p.add_argument("file", type=Path, help="config file to edit")
>     p.add_argument("key")
>     p.add_argument("value")
>     p.add_argument("--dry-run", action="store_true",
>                    help="show what would change, change nothing")
>     return p.parse_args()
>
>
> def main() -> int:
>     args = parse_args()
>     file: Path = args.file
>     desired = f"{args.key} {args.value}"
>
>     # --- preconditions (privilege + dependency + file checks) ---
>     if os.geteuid() != 0:
>         log.error("must run as root")
>         return 1
>     if shutil.which(SERVICE) is None:
>         log.error("missing dependency: %s", SERVICE)
>         return 1
>     if not file.is_file():
>         log.error("file not found: %s", file)
>         return 1
>
>     lines = file.read_text().splitlines()
>
>     # --- idempotency: already correct? ---
>     if desired in lines:
>         log.info("no change needed: '%s' already set in %s", desired, file)
>         return 0
>
>     # --- dry-run ---
>     if args.dry_run:
>         log.info("[dry-run] would set '%s' in %s, back it up and reload %s",
>                  desired, file, SERVICE)
>         return 0
>
>     # --- backup (timestamped) and verify ---
>     ts = datetime.now().strftime("%Y-%m-%d_%H%M%S")
>     backup = file.with_name(f"{file.name}.{ts}.bak")
>     shutil.copy2(file, backup)
>     if backup.stat().st_size == 0:
>         log.error("backup failed, aborting")
>         return 1
>     log.info("backup: %s", backup)
>
>     # --- apply: drop any line for this key, append the desired one ---
>     kept = [ln for ln in lines if ln.split()[:1] != [args.key]]
>     kept.append(desired)
>     file.write_text("\n".join(kept) + "\n")
>     log.info("set '%s' in %s", desired, file)
>
>     # --- validate BEFORE reloading; restore backup on failure ---
>     try:
>         subprocess.run([SERVICE, "-t"], check=True)   # e.g. sshd -t / nginx -t
>     except subprocess.CalledProcessError:
>         log.error("config test failed -> restoring backup, NOT reloading")
>         shutil.copy2(backup, file)
>         return 1
>
>     subprocess.run(["systemctl", "reload", SERVICE], check=True)
>     log.info("reloaded %s (changed)", SERVICE)
>     return 0
>
>
> if __name__ == "__main__":
>     sys.exit(main())
> ```
>
> Concepts shown: module docstring · functions + `main()` / `if __name__` · type hints · `--dry-run` · **specific** exception caught (`CalledProcessError`) · **idempotency** + input/dependency checks (`shutil.which`, `Path.is_file`) · timestamped **backup** (verified) · **validate-before-reload** (+ restore on failure) · reload-only-if-changed · root check (`os.geteuid`) · `logging` → stderr · meaningful `sys.exit` codes.


## EXTRA: Find where a script is being run

When `ps aux | grep python` comes up empty (for example a short-lived or scheduled script you never catch in the act) you're really hunting two things: **the trigger** (what schedules it) and **the caller** (the parent process that launches it). 

The techniques below are general (any script or binary), not Python-specific.

### 1. Where is it scheduled? (cheap checks first)

* **Live, if you're lucky:** `ps aux | grep -i myscript`: only if it's running right now.
* **cron**: check *all* of these, system **and** per-user:
  ```bash
  cat /etc/crontab; ls /etc/cron.d/ /etc/cron.{hourly,daily,weekly,monthly}/
  crontab -l                        # current user
  sudo crontab -l -u <user>         # another user
  ls /var/spool/cron/crontabs/ 2>/dev/null || ls /var/spool/cron/   # raw spool
  atq                               # one-off `at` jobs
  ```
* **systemd timers:**
  ```bash
  systemctl list-timers --all
  systemctl --user list-timers --all      # user timers
  systemctl cat <unit>                     # what the timer/service actually runs
  ```
  (Also watch for **path units**, which fire on file changes.)
* **Login / shell hooks:** `~/.bashrc`, `~/.profile`, `/etc/profile.d/`, desktop autostart.

### 2. Catch the execution live

> [!TIP] Best tool: `execsnoop` (eBPF)
> Traces **every** `execve` system-wide in real time, with PID, **PPID** and the full command line, so it shows *who* launched it and *how*. Catches `python3 script.py` cleanly.
> ```bash
> sudo apt install bpfcc-tools          # provides execsnoop-bpfcc
> sudo execsnoop-bpfcc | grep -i myscript
> ```

Lighter alternative: **`inotifywait`** (just confirms *when* the file is touched):
```bash
sudo apt install inotify-tools
inotifywait -m -e access /path/to/myscript.py
```
> [!NOTE] inotify's limits
> It only tells you the file was **accessed**, not **by whom**, and only **while it's running**: it captures nothing from the past. For "who/when, over time," use auditd below.

### 3. Log every run with full context: `auditd` (needs root)

The most powerful option: persistent logging of every access, with the caller.
```bash
sudo apt install auditd
# persist a watch (survives reboot); use -p rwxa, NOT just -p x (see warning)
echo '-w /path/to/myscript.py -p rwxa -k script-tracker' | sudo tee /etc/audit/rules.d/script-tracker.rules
sudo augenrules --load
# read it back, interpreted:
sudo ausearch -k script-tracker -i
```

In the output, the fields that answer "who": **`auid`** (the login user: survives `sudo`/`su`), `uid`, `pid` / **`ppid`**, `exe`, `comm` → the parent process and the human behind it.

> [!TIP]
> If `auid` is unset (`4294967295` / `-1`), it was launched by a **system service**, not an interactive user: a clue in itself.

### 4. Find the caller from inside the script

If you can edit it, log the parent (who called it), the user and the time:
```python
import os, time
ppid = os.getppid()
parent = open(f"/proc/{ppid}/cmdline").read().replace("\x00", " ").strip()
with open("/var/log/whoran.log", "a") as f:
    f.write(f"{time.strftime('%F %T')} uid={os.getuid()} ppid={ppid} parent={parent}\n")
```

### 5. Once you catch the PID

Walk up the process tree and inspect `/proc`:
```bash
pstree -ps <pid>
ls -l /proc/<pid>/exe /proc/<pid>/cwd
tr '\0' ' ' < /proc/<pid>/cmdline; echo
```
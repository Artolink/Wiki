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
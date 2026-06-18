---
title: 🐚 Bash
---
## Bash vs Ansible: pick the right tool first

> [!TIP]
> For **configuring many machines** (editing files, restarting services, enforcing a desired state across a fleet...) use **Ansible**, not a Bash loop over SSH that just re-implements Ansible, badly. 
> 
> **Use Bash for** local, single-machine work: setup/bootstrap scripts, CLI glue, wrappers, cron jobs, parsing/transforming data, orchestrating other tools and so on.

## Guidelines for a (single-machine) Bash script

### Skeleton & safety
- Start with `#!/usr/bin/env bash` and **`set -euo pipefail`** (fail fast on errors, unset vars, broken pipes).
- Add a header comment: **what it does, usage, requirements**.
- Keep it **`shellcheck`-clean**: lint every script.
- Wrap logic in **functions** with a `main "$@"` at the bottom, declare variables `local`.

### Arguments & usage
- **Validate required args**; if missing/invalid, print usage and **exit non-zero**.
- Offer a **`--dry-run`** that changes nothing and prints what it *would* do. For destructive scripts, consider making dry-run the **default** and requiring an explicit `--apply`.

### Robustness
- **Quote everything**: `"$var"`, `"${array[@]}"`, never rely on word-splitting.
- Make it **idempotent**: safe to re-run, only change what isn't already in the desired state.
- **Check dependencies up front** (required commands/files), fail with a clear message if missing.

### Files & services
- **Check a file/path exists** before reading or editing it.
- **Back up before overwriting** (timestamped: `file.YYYY-MM-DD_HHMMSS.bak`) and **verify the backup succeeded** before touching the original.
- **Validate config before reload/restart** (`nginx -t`, `sshd -t`, `visudo -cf`…). Prefer **`reload`** over `restart` when supported, and restart **only if something actually changed**.

### Secrets & privileges
- **Never hardcode secrets**: read them at runtime (`read -rs`) or from env / a secret store. Never `echo` them, and never put them on the command line (visible in `ps`).
- If root is required, **check for it early** and exit with a clear message otherwise.

### Output, logging, exit codes
- Send **data to stdout, logs/errors to stderr**, timestamp log lines.
- Give **clear feedback**: what changed, what was skipped, and explicitly say **"no change needed"** when idempotent.
- Use **meaningful exit codes** (0 = success, non-zero on failure): if the script does several things, print a **final summary**.

> [!EXAMPLE]- A minimal script that follows all of the above
> `ensure-setting.sh`: makes sure a `key value` line exists in a config file, backs it up, validates, and reloads the service **only if it changed**. 
> 
> Re-running it does nothing once the setting is in place.
>
> ```bash
> #!/usr/bin/env bash
> #
> # ensure-setting.sh — ensure a "key value" line exists in a config file,
> # then reload a service only if the file actually changed.
> # Idempotent: re-running changes nothing once the setting is in place.
> #
> # Usage:   ensure-setting.sh [--dry-run] <config-file> <key> <value>
> # Example: ensure-setting.sh /etc/ssh/sshd_config MaxAuthTries 3
> # Requires: root, grep, sed
>
> set -euo pipefail                                   # fail fast: errors, unset vars, pipes
>
> SERVICE="sshd"        # service to reload on change ("sshd -t" tests its config)
>
> log() { printf '%s  %s\n'        "$(date '+%F %T')" "$*"; }        # info  -> stdout
> err() { printf '%s  ERROR: %s\n' "$(date '+%F %T')" "$*" >&2; }    # error -> stderr
>
> usage() {
>   cat >&2 <<EOF
> Usage: ${0##*/} [--dry-run] <config-file> <key> <value>
>   --dry-run    show what would change, change nothing
>   -h, --help   show this help
> EOF
> }
>
> main() {
>   # --- arguments ---------------------------------------------------------
>   local dry_run=false
>   case "${1:-}" in
>     -h|--help) usage; exit 0 ;;
>     --dry-run) dry_run=true; shift ;;
>   esac
>   [[ $# -eq 3 ]] || { err "expected 3 arguments"; usage; exit 2; }
>   local file="$1" key="$2" value="$3"
>
>   # --- preconditions -----------------------------------------------------
>   [[ $EUID -eq 0 ]] || { err "must run as root"; exit 1; }            # privilege
>   for cmd in grep sed; do                                             # deps
>     command -v "$cmd" >/dev/null || { err "missing dependency: $cmd"; exit 1; }
>   done
>   [[ -f "$file" ]] || { err "file not found: $file"; exit 1; }        # file exists
>
>   # --- idempotency: already correct? -> nothing to do --------------------
>   if grep -qxF "$key $value" "$file"; then
>     log "no change needed: '$key $value' already set in $file"
>     exit 0
>   fi
>
>   # --- dry-run: describe and stop ----------------------------------------
>   if [[ "$dry_run" == true ]]; then
>     log "[dry-run] would set '$key $value' in $file, back it up and reload $SERVICE"
>     exit 0
>   fi
>
>   # --- backup (timestamped) and verify it --------------------------------
>   local backup="${file}.$(date '+%F_%H%M%S').bak"
>   cp -p -- "$file" "$backup"
>   [[ -s "$backup" ]] || { err "backup failed, aborting"; exit 1; }
>   log "backup: $backup"
>
>   # --- apply the change in place (the backup above is the safety net) -----
>   sed -i "/^${key}[[:space:]]/d" "$file"       # remove any existing line for this key
>   printf '%s %s\n' "$key" "$value" >> "$file"  # append the desired one
>   log "set '$key $value' in $file"
>
>   # --- validate BEFORE reloading; restore backup on failure --------------
>   if "$SERVICE" -t; then                  # e.g. sshd -t / nginx -t
>     systemctl reload "$SERVICE"
>     log "reloaded $SERVICE (changed)"
>   else
>     err "config test failed -> restoring backup, NOT reloading"
>     cp -p -- "$backup" "$file"
>     exit 1
>   fi
>
>   log "done"
> }
>
> main "$@"
> ```
>
> Concepts shown: `set -euo pipefail` · `usage()` + `-h/--help` · arg validation + non-zero exit · `--dry-run` · dependency & file checks · **idempotency** · timestamped **backup** (verified) · in-place edit with the backup as the safety net · quoting · **validate-before-reload** (+ restore on failure) · reload-only-if-changed · stdout vs stderr logging · `main "$@"`. *(No secrets here, if it needed them, read with `read -rs` and never put them on the command line.)*
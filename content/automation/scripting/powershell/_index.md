---
title: 💠 Powershell
---
## When to use PowerShell


**PowerShell** shines on **Windows / .NET** administration and wherever you work with **objects** instead of text streams (services, registry, AD, Azure, M365…).

## Guidelines for a PowerShell script

### Skeleton & safety
* Start with a **comment-based help** block (`<# .SYNOPSIS / .EXAMPLE #>`), it powers `Get-Help`.
* Put logic in functions: add `#Requires -Version 7.0` (and `-Modules` you need).
* `Set-StrictMode -Version Latest` + `$ErrorActionPreference = 'Stop'` (fail fast).
* Lint with **PSScriptAnalyzer**: use approved **Verb-Noun** naming.

### Arguments & usage

* Use `[CmdletBinding(SupportsShouldProcess)]` + `param(...)` with validation attributes → you get the **built-in `-WhatIf`** (native dry-run) and `-Confirm` for free: guard changes with `$PSCmdlet.ShouldProcess(...)`.

### Robustness
* Catch **specific** exceptions (`catch [System.IO.IOException]`), never a bare `catch`: fail with a clear message and a non-zero exit.
* Make it **idempotent**, and check inputs/dependencies up front (`Test-Path`, `Get-Command`).

### Running commands & services
* **Validate config before reload/restart** (`sshd -t`, the service's own test): reload only if something actually changed, and prefer `reload` over `restart`.

### Files
* Check a path exists before reading/editing it (`Test-Path -PathType Leaf`).
* **Back up before overwriting** (timestamped) and **verify the backup** before touching the original.

### Secrets & privileges
* **Never hardcode secrets**: use `Read-Host -AsSecureString` / `Get-Credential` / env vars, never log them.
* If admin/root is required, check early with `WindowsPrincipal.IsInRole(Administrator)` and exit with a clear message otherwise.

### Output, logging, exit codes
* Use `Write-Verbose` / `Write-Error` / `Write-Warning` (not `Write-Host`): reserve the **output pipeline** for real objects/data.
* Return **meaningful exit codes** with `exit <n>` (0 = success, non-zero on failure).

## A minimal script that follows all of the above

> [!EXAMPLE]- A minimal script that follows all of the above
> `Ensure-Setting.ps1`: makes sure a `key value` line exists in a config file, backs it up, validates, and reloads the service **only if it changed**. 
> 
> Re-running it does nothing once the setting is in place.
>
> ```powershell
> #Requires -Version 7.0
> <#
> .SYNOPSIS
>     Ensure a "key value" line exists in a config file, then reload a service
>     only if the file actually changed. Idempotent.
> .EXAMPLE
>     ./Ensure-Setting.ps1 /etc/ssh/sshd_config MaxAuthTries 3
> .EXAMPLE
>     ./Ensure-Setting.ps1 /etc/ssh/sshd_config MaxAuthTries 3 -WhatIf   # dry-run
> #>
> [CmdletBinding(SupportsShouldProcess)]
> param(
>     [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string]$File,
>     [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string]$Key,
>     [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string]$Value
> )
>
> Set-StrictMode -Version Latest
> $ErrorActionPreference = 'Stop'
>
> $Service = 'sshd'                 # service to reload on change ("sshd -t" tests its config)
> $desired = "$Key $Value"
>
> # --- preconditions: privilege + dependency + file checks ---
> if ([int](id -u) -ne 0)                                 { Write-Error 'must run as root'; exit 1 }   # Windows: WindowsPrincipal.IsInRole(Administrator)
> if (-not (Get-Command $Service -ErrorAction Ignore))    { Write-Error "missing dependency: $Service"; exit 1 }
> if (-not (Test-Path -LiteralPath $File -PathType Leaf)) { Write-Error "file not found: $File"; exit 1 }
>
> $lines = Get-Content -LiteralPath $File
>
> # --- idempotency: already correct? ---
> if ($lines -contains $desired) {
>     Write-Verbose "no change needed: '$desired' already set in $File"
>     exit 0
> }
>
> # --- dry-run via native -WhatIf ---
> if (-not $PSCmdlet.ShouldProcess($File, "set '$desired', back up and reload $Service")) {
>     exit 0
> }
>
> # --- backup (timestamped) and verify ---
> $backup = "$File.$((Get-Date).ToString('yyyy-MM-dd_HHmmss')).bak"
> Copy-Item -LiteralPath $File -Destination $backup
> if ((Get-Item -LiteralPath $backup).Length -eq 0) { Write-Error 'backup failed, aborting'; exit 1 }
> Write-Verbose "backup: $backup"
>
> # --- apply: drop any line for this key, append the desired one ---
> $kept = $lines | Where-Object { ($_ -split '\s+', 2)[0] -ne $Key }
> (@($kept) + $desired) | Set-Content -LiteralPath $File
> Write-Verbose "set '$desired' in $File"
>
> # --- validate BEFORE reloading; restore backup on failure ---
> & $Service -t
> if ($LASTEXITCODE -ne 0) {
>     Write-Error 'config test failed -> restoring backup, NOT reloading'
>     Copy-Item -LiteralPath $backup -Destination $File -Force
>     exit 1
> }
> systemctl reload $Service
> Write-Verbose "reloaded $Service (changed)"
> ```
>
> Concepts shown: comment-based help · `Set-StrictMode` + `$ErrorActionPreference='Stop'` · `param()` + validation attributes · native **`-WhatIf`** (`ShouldProcess`) · **idempotency** + input/dependency checks (`Get-Command`, `Test-Path`) · timestamped **backup** (verified) · **validate-before-reload** (+ restore on failure) · reload-only-if-changed · root/admin check · `Write-Verbose`/`Write-Error` · `exit` codes.
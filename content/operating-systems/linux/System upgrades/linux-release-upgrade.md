---
title:
tags:
  - Maintenance
---


| Aspect       | Patch management                                             | Release upgrade                                               |
| ------------ | ------------------------------------------------------------ | ------------------------------------------------------------- |
| Frequency    | weekly / monthly                                             | every 2 years (LTS → LTS)                                     |
| Core command | `apt upgrade`                                                | `do-release-upgrade`                                          |
| Duration     | 10-20 min                                                    | 1-3 hours                                                     |
| Risk         | low                                                          | high                                                          |
| What changes | package versions only, same distro                           | kernel / libc / init / sources.list, many configs rewritten   |
| Procedure    | scriptable                                                   | manual, supervised                                            |
| Rollback     | boot on the previous kernel, `apt install pkg=<old-version>` | snapshot rollback or full rebuild; no official downgrade path |
| Mindset      | "keep it alive"                                              | "migrate it to the next generation"                           |


Always check the release notes first.

- [Ubuntu Server upgrade guide](https://ubuntu.com/server/docs/upgrade) — official version-specific notes.
- [Debian release notes](https://www.debian.org/releases/) — same idea, more important for Debian major upgrades.
- `man apt`, `man dpkg`, `man unattended-upgrade` — the underlying tools, each one slightly different.
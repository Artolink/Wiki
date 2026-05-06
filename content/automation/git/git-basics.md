---
title: " Get fluent with Git: the daily-use commands"
tags:
  - Basics
---
**Git** is a version-control program that runs on the local machine.
The CLI commands below work even with no internet: Git was built that way. 

GitHub (or GitLab, Bitbucket…) only enters the picture when sharing or backing up the repo. Pair this guide with [[github-basics|the GitHub starter]] for understanding that aspect too.

## First-time setup

Before the first commit, tell Git who is making the changes. The values end up baked into every commit's metadata, so use a real email (the same one used on GitHub if there's a plan to push there).

```bash
git config --global user.name  "YOUR NAME"
git config --global user.email "your_email@example.com"
git config --global color.ui   auto          # colored terminal output
git config --global init.defaultBranch main   # modern default for new repos
git config --list                              # check everything stuck
```

The `--global` flag writes into `~/.gitconfig`. Inside a single repo, the same commands without `--global` create a per-repo override (handy when one project needs a different email).

## The three states (the mental model that makes Git click)

Every tracked file lives in one of three places:

1. **Working tree** — the files on disk as they are right now.
2. **Staging area** ("index") — the files marked to be in the next commit.
3. **Repository** — the committed history, immutable once made.

The flow is always *working tree → staging → repo*:

- `git add` moves changes from the working tree into staging.
- `git commit` snapshots staging into a new commit in the repo.

Once this picture is internal, every other command starts to make sense.

## Starting a project

Two ways to get a Git repo on the machine:

```bash
git init                                    # turn the current folder into a repo

git clone git@github.com:user/repo.git      # download an existing one (SSH)
git clone https://github.com/user/repo.git  # …or via HTTPS
```

`git init` creates a hidden `.git/` folder: that's the entire history and metadata. 

Move or delete `.git/` and the folder is no longer a Git repo.

Then, if we want to connect our local repo to our [[github-basics|GitHub]] repo, we can do our first push by setting the remote origin:
```bash
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin git@github.com:user/repo.git # this connects our local and remote repos
git push -u origin main
```
^first-push


## The everyday loop

```bash
git status                  # what's tracked, what's not, what's staged, what branch
git add file.txt            # stage a single file
git add .                   # stage everything in the current folder (recursive)
git commit -m "Add login form validation"
```

Run `git status` constantly — it answers "what's the state?" in plain English and tells what to do next. There's no shame in running it 30 times an hour.

A good commit message is short, in the imperative, and explains the *why* if it isn't obvious from the diff:

```bash
git commit -m "Cache user lookup to avoid N+1 query"
```

Skip the `-m` flag and Git opens an editor for a longer message — first line is the title, blank line, then the body.

## Inspecting history

```bash
git log                          # full commit history, newest first
git log --oneline --graph        # compact + branch topology
git diff                         # unstaged changes (working tree vs staging)
git diff --staged                # staged changes (staging vs last commit)
git show <commit-id>             # full details + diff of a past commit
```

Commit IDs are SHA-1 hashes — the first 7 characters are usually enough (`git show 4e2a1f0`).

## Working with remotes

A "remote" is just a named URL pointing to another copy of the repo (typically on GitHub). The default name is `origin`.

```bash
git remote -v                                       # list configured remotes
git remote add origin git@github.com:user/repo.git  # add one
git remote rm  origin                               # remove if added wrong
git remote set-url origin <new-url>                 # change the URL in place
```

Once a remote exists, push and pull move commits between local and remote:

```bash
git push -u origin main    # first push: -u links the local branch to remote main
git push                    # subsequent pushes (after -u, no args needed)
git pull                    # fetch + merge remote changes into the current branch
git fetch                   # fetch only, no merge — useful to inspect first
```

`origin` is just a label — the URL behind it can be HTTPS or SSH, GitHub or anywhere else. Several remotes are allowed (e.g. `origin` for the personal fork, `upstream` for the original project).

## Branches

A branch is a movable pointer to a commit. The default branch is usually `main` (or `master` on older repos). Creating a branch lets work happen in parallel without touching the stable line.

```bash
git branch -a                  # list all branches (local + remote-tracking)
git branch feature-login       # create branch (doesn't switch to it)
git checkout feature-login     # switch to it
git checkout -b feature-login  # create AND switch in one go
git branch -d feature-login    # delete a fully merged branch
```

Modern alternatives (Git 2.23+) split `checkout`'s overloaded duties into clearer commands:

```bash
git switch feature-login       # switch branch (replaces `checkout <branch>`)
git switch -c feature-login    # create + switch (replaces `checkout -b`)
git restore file.txt           # discard unstaged changes (replaces `checkout file`)
```

Both styles work; `switch`/`restore` are easier to remember once used a couple of times.

## Merge vs Rebase: the question every team ends up arguing about

Two ways to bring the changes from one branch into another. 

They produce a different history, but the **resulting code is the same**.

### Merge

```bash
git checkout main
git merge feature-login
```

Creates a *merge commit* that has two parents. The history visibly forks and rejoins — useful for tracing exactly when a feature was integrated, but the graph gets noisy with many concurrent branches.

### Rebase

```bash
git checkout feature-login
git rebase main
```

Replays the feature commits on top of `main`'s tip, as if they were written from there. The history stays linear and clean. Conflicts may appear during the replay, one commit at a time — easier to resolve in small steps than as one giant blob at merge time.

### When to pick which

- **On shared/published branches**: prefer `merge`. Rebasing rewrites commit hashes; if someone else already pulled those commits, their history will diverge from yours and force-pushes are needed to reconcile. Painful.
- **On personal/local branches before sharing**: rebase liberally. Cleans up the history before the merge request.
- **The "rebase often, merge once" pattern** works well in teams where everyone keeps their own branch up to date with `git rebase main` regularly, then opens a clean PR. Aruba-style workflows live here.

Whichever path is picked, conflicts are inevitable when several people touch the same lines. Git stops the operation, marks the conflicting regions in the file, and waits for a manual fix:

```bash
# edit the file, remove the <<<<<<< / ======= / >>>>>>> markers
git add resolved-file.txt
git rebase --continue           # or `git merge --continue`
```

`git rebase --abort` (or `git merge --abort`) bails out and returns to the pre-rebase state if things go sideways.

## .gitignore

A plain-text file listing patterns of files Git should never track. Place it at the repo root and commit it.

```gitignore
# build artifacts
dist/
*.log

# editor/IDE
.vscode/
.idea/

# environment / secrets
.env
.env.local

# OS
.DS_Store
Thumbs.db
```

Files matched by `.gitignore` are skipped by `git add .`. **Once a file is already tracked, adding it to `.gitignore` does nothing** — remove it from the index first with `git rm --cached <file>`, then commit.

Sensible templates per language: https://github.com/github/gitignore.

## A few habits that pay off

- **Commit small, commit often.** A commit per logical change. Easier to review, easier to revert, easier to bisect when something breaks.
- **`git status` is free.** Run it before every `add`, before every `commit`, before every `push`. Catches mistakes before they become history.
- **Write the message in the imperative, present tense.** `Fix login redirect`, not `Fixed login redirect`: this matches what every Git tool generates automatically (`Merge branch …`, `Revert …`).
- **Branch for anything risky.** `main` stays deployable, experiments live elsewhere.
- **Pull before you push.** A `git pull --rebase` at the start of the day keeps the local branch in sync without merge clutter.
- **Don't commit secrets.** `.env`, API keys, passwords. If it happens, **rotate the secret immediately**: `git rm` doesn't erase it from history!

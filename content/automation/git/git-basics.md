---
title: " Get fluent with Git: the daily-use commands"
tags:
  - Basics
---
**Git** is a version-control program that you can run on the local machine, even with no internet.

To put it simply: Git is a tool that keeps track of changes to files over time.

In this guide you'll learn the basics of Git for working on solo projects: if you want to learn the best practices for working in a team, please move on [to the advanced lesson](git-advanced) when you're ready!

GitHub (or GitLab, Bitbucket…) enters the picture when you need to share or back up your repo. 

Pair this guide with [[github-basics|the GitHub starter]] for understanding that aspect too!

## Initial setup

Before the first commit, tell Git who is making the changes. 

The values end up baked into every commit's metadata, so use a real email (the same one used on GitHub if there's a plan to push there).

```bash
git config --global user.name  "YOUR NAME"
git config --global user.email "your_email@example.com"
git config --global color.ui   auto          # colored terminal output
git config --global init.defaultBranch main   # modern default for new repos
git config --list                              # check everything stuck
```

The `--global` flag writes into `~/.gitconfig`. Inside a single repo, the same commands without `--global` create a per-repo override (handy if one project needs a different email).

## The three states

Every tracked file lives in one of three places:

1. **Working tree**: the files on disk, as they are right now.
2. **Staging area** ("index"): the files marked to be in the next commit.
3. **Repository**: the committed history, immutable once made.

The flow is always *working tree → staging → repo*:

- `git add` moves changes from the working tree into staging.
- `git commit` snapshots staging into a new commit in the repo.


## Starting a project

Two ways to get a Git repo on the machine:

```bash
git init                                    # turn the current folder into a repo

git clone git@github.com:user/repo.git      # download an existing one (SSH)
git clone https://github.com/user/repo.git  # …or via HTTPS
```

`git init` creates a hidden `.git/` folder: that's the entire history and metadata. 

Move or delete `.git/`, and the folder is no longer a Git repo.

If we want to connect our local repo to our [[github-basics|GitHub]] repo, we can push by setting the remote origin:
```bash
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin git@github.com:user/repo.git # this connects our local and remote repos
git push -u origin main
```
^first-push

## Remotes

A "remote" is just a named URL pointing to another copy of the repo (typically on GitHub). 

The default name is `origin`.

`origin` is just a label: the URL behind it can be HTTPS or SSH, GitHub or anywhere else. 

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

> [!DANGER]
>**Don't commit secrets.** `.env`, API keys, passwords. 
>
>If it happens, **rotate the secret immediately**: `git rm` doesn't erase it from history!

## Branches

A branch is a movable pointer to a commit. 

The default branch is usually `main` (or `master` on older repos). 

**Branch for anything risky:** `main` stays deployable, experiments live elsewhere.

```bash
git branch -a                  # list all branches (local + remote-tracking)
git branch feature-login       # create branch (doesn't switch to it)
git checkout feature-login     # switch to it
git checkout -b feature-login  # create AND switch in one go
git branch -d feature-login    # delete a fully merged branch
```

Git 2.23+ changes `checkout` into clearer commands:

```bash
git switch feature-login       # switch branch (replaces `checkout <branch>`)
git switch -c feature-login    # create + switch (replaces `checkout -b`)
git restore file.txt           # discard unstaged changes (replaces `checkout file`)
```

Both styles work, but `switch`/`restore` are easier to remember once used a couple of times.

## The daily operations

```bash
git status                  # what's tracked, what's staged, what branch...
git add file.txt            # stage a single file
git add .                   # stage everything in the current folder (recursive)
git commit -m "Add login form validation"
```

>[!TIP]
>Run `git status` constantly: it answers "what's the state?" and tells you what to do next. There's no shame in running it 30 times an hour.
>
>Also, a good commit message is short, in the imperative, and explains the *why* if it isn't obvious from the diff.

## History

```bash
git log                          # full commit history, newest first
git log --oneline --graph        # compact + branch topology
git diff                         # unstaged changes (working tree vs staging)
git diff --staged                # staged changes (staging vs last commit)
git show <commit-id>             # full details + diff of a past commit
```

> [!TIP]
> To improve git diff readability, install **delta**:
>
> curl -s https://api.github.com/repos/dandavison/delta/releases/latest \\
> | grep browser_download_url \\
> | grep amd64.deb \\
> | cut -d '"' -f 4 \\
> | wget -qi - -O /tmp/git-delta.deb \\
> && dpkg -i /tmp/git-delta.deb \\
> && apt -f install -y \\
> && delta --version
>
> Then configure git accordingly:
>
> git config --global core.pager delta
> git config --global pager.diff delta
> git config --global pager.show delta
> git config --global pager.log delta
> git config --global interactive.diffFilter "delta --color-only"
^delta
## .gitignore

A plain-text file listing patterns of files Git should never track. 

Place it at the repo root and commit it.

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



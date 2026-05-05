---
title: " Get started with GitHub"
tags:
  - StartingTools
---

## What is GitHub?

GitHub is a hosting service for code repositories built on top of Git. Think of it as **Google Drive for code** — except instead of just storing files it tracks every change, lets multiple people work on the same codebase without overwriting each other, and serves as a public showcase of what you've built.

The basics worth knowing before clicking around:
- A **repository** ("repo") is a single project: source files, history, branches, issues.
- A **commit** is a snapshot of the repo at a point in time, with a message describing what changed.
- A **branch** is a parallel line of development; the default one is usually `main`.
- A **push** uploads your local commits to GitHub; a **pull** downloads remote changes.

This guide gets the account ready, creates a first repo, and sets up SSH keys so you don't have to type a password every time you push.

## Create the account

1. Open https://github.com and sign up.
2. Pick a username carefully — it ends up in every URL of every repo (`github.com/<username>/<repo>`) and is hard to change later. Short, lowercase, no special chars is the safe path.
3. Verify the email address. The free plan is enough for everything in this guide: unlimited public **and** private repos.
4. Optional but worth it: in *Settings → Profile* add a short bio, a profile picture, and pin a couple of repos when you have them. The profile page becomes a free portfolio.

## Create your first repository

From the home page, click the green **New** button (or visit https://github.com/new).

Fields that matter:
- **Repository name** — keep it short and descriptive. Hyphens are fine, spaces aren't.
- **Description** — one line, optional but useful.
- **Public vs Private** — see below.
- **Initialize with README** — tick it for a brand-new project; leave it unticked if you already have local files to push (otherwise the first push will conflict).
- **.gitignore template** — pick the one matching the language (Node, Python, …); GitHub adds a sensible default ignore list.
- **License** — only relevant if the repo is public. MIT is the safe default if unsure.

Click **Create repository**. The repo URL is now `https://github.com/<username>/<repo>`.

### Public vs Private — when to use each

**Public** repos are visible to anyone on the internet, indexed by search engines, and can be cloned/forked freely. Pick it for:
- open-source projects meant to be shared
- portfolio code (interviews, personal site, learning projects)
- documentation and wikis

**Private** repos are visible only to you and the collaborators explicitly invited. Pick it for:
- work projects, client code, anything under NDA
- experiments not ready for the world
- notes, drafts, secrets-adjacent stuff

A repo can be flipped from private to public (and vice versa) at any time from *Settings → General → Danger Zone*. Be aware that flipping a private repo to public reveals **the entire history**, including any password committed by mistake — clean up first.

## Set up SSH access (the right way to authenticate)

By default, Git over HTTPS asks for credentials every time. The clean alternative is SSH: generate a key pair once, drop the public key into GitHub, and never type a password again.

### 1. Generate the key pair

```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
```

When prompted:
- **File location** — accept the default (`~/.ssh/id_ed25519`) unless you already have a key there.
- **Passphrase** — empty is fine for a personal laptop; set one for shared machines.

Two files appear:
- `~/.ssh/id_ed25519` — the **private** key. Never share, never push, never paste anywhere.
- `~/.ssh/id_ed25519.pub` — the **public** key. This is the one to give to GitHub.

### 2. Tell the SSH agent about it

```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
```

The agent caches the unlocked key in memory so subsequent Git commands don't ask for the passphrase.

### 3. Add the public key to GitHub

```bash
cat ~/.ssh/id_ed25519.pub
```

Copy the output (starts with `ssh-ed25519 …` and ends with the email). On GitHub:
1. Click the avatar top-right → **Settings**
2. **SSH and GPG keys** → **New SSH key**
3. Title: something like `Personal laptop` or `VPS - farneti`. The title is just a label for you.
4. Key type: **Authentication Key**.
5. Paste the content into the **Key** field, click **Add SSH key**.

### 4. Verify it works

```bash
ssh -T git@github.com
```

Expected response:

```
Hi <username>! You've successfully authenticated, but GitHub does not provide shell access.
```

That message is the success case — GitHub never gives a shell, the `ssh -T` is only checking the handshake.

## First commit, the SSH way

Pick the SSH URL from the repo page (the **Code** button → **SSH** tab). It looks like `git@github.com:<username>/<repo>.git`.

If the repo was created **with** a README on GitHub:

```bash
git clone git@github.com:<username>/<repo>.git
cd <repo>
# edit files, then:
git add .
git commit -m "First real change"
git push
```

If the repo was created **empty** on GitHub and you already have local files:

```bash
cd path/to/local/project
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin git@github.com:<username>/<repo>.git
git push -u origin main
```

The `-u` flag links the local `main` to the remote `main` — after this, `git push` and `git pull` know where to go without arguments.

## Forking — using someone else's repo as a starting point

A **fork** is a server-side copy of a repo under your username. It keeps a link to the original ("upstream") so updates can be pulled in later.

When to fork:
- Customizing a tool/template for personal use (this is what's done with Quartz to build [[create-a-wiki-like-this|a wiki like this]]).
- Contributing back to an open-source project — fork, change, open a *pull request*.

How:
1. On the source repo page, click **Fork** top-right.
2. Pick the destination (your username), optionally rename, **Create fork**.
3. Clone the fork as usual: `git clone git@github.com:<username>/<repo>.git`.

To pull updates from the original later:

```bash
git remote add upstream git@github.com:<original-owner>/<repo>.git
git fetch upstream
git merge upstream/main
```

## Files every repo should have

- `README.md` — what the project does, how to install/run it, basic usage. Renders as the homepage of the repo.
- `.gitignore` — patterns of files Git should never track (build artifacts, `node_modules/`, `.env`, IDE folders). Use the templates from https://github.com/github/gitignore.
- `LICENSE` — only for public repos. No license = nobody legally allowed to use the code, even if it's visible.

## A few habits that pay off

- **Commit often, push when stable.** Small commits with clear messages make the history readable. "Fix typo" beats one giant "WIP" commit per week.
- **Write the message in the imperative.** `Add login form`, not `Added login form` or `Adds login form`. Matches Git's own style.
- **Never commit secrets.** API keys, passwords, `.env` files. If it happens, rotate the key immediately — `git rm` doesn't remove it from history.
- **Branches for anything risky.** Mainline stays clean, experiments live on their own branch, merge when ready.
- **Read the diff before pushing.** `git diff --staged` (or the IDE's diff view) catches accidents that a hasty `git add .` would otherwise ship.

---
title: " Git in a team: the workflows, the rebase rituals, the recoveries"
tags:
  - Basics
---

## Where solo Git ends, team Git begins

[[git-basics|The basics]] cover the local loop: stage, commit, push, branch, pull. 

That's enough when there's only one head writing history. 

Add a second person and a new class of problems shows up: two branches diverging at the same time, "why is my push rejected?", merge conflicts on lines someone else changed five minutes ago, and the eternal question: *should we merge or rebase here?*

This page is the survival guide for that next step: branching strategies, pull-requests, conflict resolution and the recovery commands worth knowing **before** you need them.

## Branching strategies: pick one and stick to it

A team has to agree on **how branches relate to each other**, otherwise main becomes a battleground. 

The two patterns that cover 95% of teams in 2026:

### Feature branches → PR → main

The default for most companies and open source.

- `main` is always deployable. Nobody pushes to it directly.
- Every change starts on a **feature branch** (`feat/login-form`, `fix/cache-bug`).
- When done, open a **pull request** (PR): review, then merge into `main`.
- After merging, delete the feature branch.

### Trunk-based development

For high-velocity teams where merges happen all day.

- Everyone commits to short-lived branches (a few hours, not days) that merge into `main` very frequently.
- Here a CI (Continuous Integration) which automatically builds and tests the code on every change, is mandatory: broken `main` is an emergency.


The principle is the same in both: **`main` is sacred**, every change goes through review, and conflicts get resolved on the *feature side* before merging, not on `main`.

## The pull-request flow, end to end

```bash
# 1. Start from an up-to-date main
git checkout main
git pull

# 2. Branch off
git checkout -b feat/short-description

# 3. Work, commit small steps
git add .
git commit -m "Add validation for empty email field"

# 4. Push the branch
git push -u origin feat/short-description

# 5. Open the PR via the GitHub/GitLab UI
#    Reviewers comment, CI runs.

# 6. Address feedback with new commits (or amend the last if trivial)
git commit -m "Address review: handle whitespace in email check"
git push

# 7. Once approved, merge via the platform UI (or rebase + merge — see below)

# 8. Clean up locally
git checkout main
git pull
git branch -d feat/short-description
```

The merge button in the UI usually offers three options: **Create a merge commit**, **Squash and merge**, **Rebase and merge**. 

The one to pick depends on the team's policy.

## Always pull-rebase before you do anything else

The single habit that prevents the most pain:

```bash
git checkout main
git pull --rebase     # or just `git pull` if pull.rebase is configured globally

git checkout feat/your-branch
git rebase main        # or `git pull --rebase origin main`
```

Why `--rebase` and not plain `pull`?

- Plain `git pull` performs a **merge** of the remote branch into your local one.  
  
  So if new commits were added remotely, Git creates an **automatic merge commit** to combine the two histories, and that generates noise.
```bash
A → B
 \   
  M   (merge commit)
 /   
A → C
```

- `git pull --rebase` instead **replays your local commits on top** of the remote tip, producing a linear history:
```bash
A → C → B'
```

You can set it as the default once and forget about it:

```bash
git config --global pull.rebase true
```

The early-morning `git pull --rebase` keeps your branch in sync **without merge crap**, and any conflict appears now (small, manageable) instead of later when you open the PR (large, scary).

## Merging vs Rebasing: the deeper view

The two operations produce **the same code** but a different history. 

Choosing between them is mostly about **what story you want the log to tell**.

### Merge

```bash
git merge feature                       # default: fast-forward if possible, else merge commit
```

### Rebase

```bash
git checkout feature
git rebase main         # replay feature commits on top of main's tip
```

Linear history. No merge commits. Conflicts surface one commit at a time during the replay.

### When to pick which (the practical heuristics)

- **On personal/local branches before sharing**: rebase liberally. Cleans up before review. Squash trivial "fix typo" commits.
- **On shared branches** (multiple people pushing, others have pulled it): **never rebase**. Hashes change, everyone else's history diverges, force-pushes are needed → broken trees, bad day.
- **Merging `main` into a long-lived feature branch**: usually rebase to keep the feature branch on top of latest `main`. Daily ritual on long PRs.
- **Merging a feature branch into `main`**: depends on team policy. Squash-and-merge is common (clean `main` log), `--no-ff` is the next most common (preserves feature grouping), plain `merge` (with fast-forward when possible) only on tiny/trivial PRs.

### The "rebase often, merge once" pattern

Best of both worlds, and what most healthy teams converge on:

1. While developing on a feature branch: `git pull --rebase origin main` regularly to stay in sync.
2. Before opening / updating the PR: clean up the local commits with `git rebase -i` (squash WIPs, fix messages).
3. Merging the PR into `main`: a single merge — squash, fast-forward, or merge-commit, per team policy.

History stays clean, conflicts get resolved gradually, and `main`'s log reads like a changelog instead of a stream of consciousness.

## Resolving conflicts (without panic)

Conflicts happen when the same lines were changed in both branches. Git stops and asks for a manual decision:

```
<<<<<<< HEAD
const TIMEOUT = 5000;
=======
const TIMEOUT = 10_000;
>>>>>>> feature
```

The block has three parts:

- **`<<<<<<< HEAD`** to **`=======`** — what's currently on the branch you're on (during a rebase, this is the *new* base, i.e. main).
- **`=======`** to **`>>>>>>> feature`** — what's coming in.

Resolution:
1. Edit the file: keep the version you want (or merge them by hand), remove all three marker lines.
2. Re-stage: `git add path/to/file`.
3. Continue the operation:
    - During a rebase: `git rebase --continue`.
    - During a merge: `git commit` (Git pre-fills a merge message).
4. If panicking: `git rebase --abort` or `git merge --abort` returns to the state before the operation.

A trick that helps: configure a **3-way merge tool** so you see *both sides plus the common ancestor* in a UI, instead of just the conflict markers. VS Code, IntelliJ, Meld, Beyond Compare all do this well.

```bash
git config --global merge.tool vscode    # adapt to your tool of choice
git mergetool                            # opens it on the conflicting files
```

## Recovery: undoing things safely

The four commands worth knowing cold:

### `git reset` — move the branch pointer

```bash
git reset --soft HEAD~1     # undo last commit, keep changes staged
git reset --mixed HEAD~1    # undo last commit, keep changes unstaged (default)
git reset --hard HEAD~1     # undo last commit, DISCARD changes (destructive)
```

`--hard` is the dangerous one — files revert on disk too. Don't run it without checking `git status` first.

### `git revert` — undo by adding a new commit

```bash
git revert <commit-id>     # creates a new commit that inverts the given one
```

History stays intact, the bad commit is just neutralized. The right tool when the bad commit is **already on a shared branch** — `reset` would rewrite history, `revert` is safe.

### `git restore` — discard local changes

```bash
git restore file.txt              # discard unstaged changes in this file
git restore --staged file.txt     # unstage (move from staging back to working tree)
git restore --source=HEAD~3 file.txt   # restore file from 3 commits ago
```

The modern replacement for `git checkout -- file.txt`.

### `git reflog` — the "undo button for Git itself"

Every move of `HEAD` is logged for ~90 days. Bad rebase, accidental `reset --hard`, lost branch — the commit is still there.

```bash
git reflog                    # list of every HEAD move with hashes
git reset --hard HEAD@{2}     # rewind to where you were 2 moves ago
```

Knowing reflog exists is what separates "Git ate my work" from "give me 30 seconds to recover".

## Force pushing: only with `--force-with-lease`

After a rebase or amend, the branch's commit hashes have changed; a regular push gets rejected because the remote has commits the local doesn't. Force is needed:

```bash
git push --force-with-lease       # safer
git push --force                  # avoid
```

`--force-with-lease` checks that the remote tip is what you last fetched. If someone else pushed in the meantime, the force is *refused* — preventing the classic "I just nuked Bob's commits". Make it your default for force-pushes.

```bash
git config --global alias.fpush "push --force-with-lease"
```

Then `git fpush` whenever a force is genuinely needed.

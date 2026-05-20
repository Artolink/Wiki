---
title: "SSH on Linux: a complete beginner-friendly guide"
---


This is the only guide you need to understand SSH keys on Linux. 

It covers **every file** (`id_ed25519`, `*.pub`, `authorized_keys`, `known_hosts`, `config`), the **commands** to generate, deploy, and use keys, the **permissions** SSH requires, and how to **troubleshoot** the most common errors.

By the end you'll understand exactly why every step exists, not just how to copy-paste commands.

***

## What SSH actually is

**SSH** stands for **Secure SHell**. 

It's a protocol to **open a shell** (a command line) on a remote machine **over an encrypted connection**.

You'll use it for two main things:
- Log into a remote server interactively: `ssh user@server.example.com`
- Run commands or copy files non-interactively (`scp`, `rsync`, `git push`, deploy scripts...)

The traditional way to authenticate is with a password, but **passwords are weak and annoying**: you have to type them, they can be brute-forced, and they're hard to use from scripts.

SSH **keys** solve all three problems at once.

***

## How asymmetric cryptography works

SSH keys come in **pairs**: one **private**, one **public**. 

As the names suggest, you have to keep your private key secret, while you can show your public key to the world.

They're mathematically linked, but you cannot derive the private key from the public: it's extremely hard computationally (in mathematics, it's a one-way function).

> [!Example] The padlock analogy
> Think of the **public key** as an open padlock you hand out to anyone. 
> The **private key** is the only key that opens it, so anyone can lock a box with your padlock (encrypt something for you), but only you can open it.

This is extremely important, because **anyone** with your public key can verify your identity, if you prove ownership of the corresponding private key.

Not only that, but anyone can encrypt files or messages using your public key, and only you can decrypt them using your private key.

You can also sign a message by first computing its hash and then using your private key to sign it: this is called a **digital signature**. Anyone can then use your public key to verify the signature, confirming that the message was indeed sent by you, and also that it has not been altered in transit.

Public/private key cryptography provides:

1. **Authenticity**
2. **Confidentiality**
3. **Integrity**


## How SSH key authentication works

In SSH, the roles are slightly different but the idea is the same:
- The **server** holds your **public** key (in `~/.ssh/authorized_keys`)
- You keep the **private** key (in `~/.ssh/id_ed25519` or similar) **on your client**
- During login, the server sends a challenge that only the holder of the private key can answer → if you answer correctly, you're authenticated

The private key **never leaves your machine**. 

The server never sees it.
### The SSH handshake

```
You (client)                                Server
     |                                         |
     | --- "Hi, I want to log in as alice" --> |
     |                                         |
     | <-- "Prove it: sign this challenge" --- |
     |                                         |
     | (you sign with your PRIVATE key)        |
     |                                         |
     | ---- signed challenge ----------------> |
     |                                         |
     |          (server verifies with the     )|
     |          (PUBLIC key in authorized_keys)|
     |                                         |
     | <----- "OK, you're in" ---------------- |
     |                                         |
```

No passwords. No secrets crossed the network.

### Client vs Server

> [!info]- On your client (your laptop, where you type `ssh`)
> Everything lives in `~/.ssh/`:
> 
> | File                  | Purpose                                                       |
> | --------------------- | ------------------------------------------------------------- |
> | `id_ed25519`          | Your **private** key. Secret. Never share.                    |
> | `id_ed25519.pub`      | Your **public** key. Safe to share.                           |
> | `config`              | Per-host shortcuts (aliases, default user, port, etc.)        |
> | `known_hosts`         | Fingerprints of servers you've connected to before            |
> 
> You can have **multiple key pairs** (e.g. one for work, one for GitHub, one for connecting to your VPS...), just name them differently: `id_ed25519_work`, `id_ed25519_vps`...

> [!info]- On the server (the remote machine you log into)
> Everything lives in the **target user's** `~/.ssh/`:
> 
> | File                | Purpose                                                          |
> | ------------------- | ---------------------------------------------------------------- |
> | `authorized_keys`   | List of **public** keys that are allowed to log in as this user  |
> 
> That's it. The server only needs your `.pub` key.
>
> > [!tip] One server, many users
> > If you log into a server as `alice`, you need your `.pub` in `/home/alice/.ssh/authorized_keys`.
> > If you also want to log in as `bob`, you also need it in `/home/bob/.ssh/authorized_keys`: each user is independent!
On your **client** (your laptop, where you type `ssh`), everything lives in `~/.ssh/`:

***

## The procedure

Here's just a quick recap of all the things we'll discuss in a second:

1. **Generate a key pair** on your laptop: `ssh-keygen -t ed25519 -C "label"`
2. **Copy the public key** to the server: `ssh-copy-id -i ~/.ssh/key.pub user@host`
3. **Connect**: `ssh user@host` (or use an alias from `~/.ssh/config`)
4. **Verify permissions** are tight: `~/.ssh` is 700, private keys are 600, public keys are 644
5. **Trust on first use** for new servers (you'll see the fingerprint prompt once)

That's SSH on Linux, end to end. Now let's see them in detail.

### Generate a key pair

```bash
ssh-keygen -t ed25519 -C "<COMMENT>" #The comment is simply a label used to identify the key later. Common conventions are `name@machine` or `service/purpose`
```

> [!warning] ed25519 vs RSA
> Always prefer `ed25519` (faster, shorter, safer) over RSA for new keys: RSA still works everywhere but produces much longer keys and is slower. 
> Only use `-t rsa -b 4096` if you have to connect to ancient systems that don't support ed25519 (very rare today).

You'll be asked three things:

1. **File location** (default: `~/.ssh/id_ed25519`). 
   Override if you want a custom name, e.g. `~/.ssh/id_ed25519_vps`
2. **Passphrase** (optional but recommended): encrypts the private key on disk, so a stolen laptop doesn't immediately give attackers access to your servers.
3. **Confirm passphrase**.

Result: two files created.

```
~/.ssh/id_ed25519_vps        <-- private (secret)
~/.ssh/id_ed25519_vps.pub    <-- public (share)
```

> [!tip] About `-C "comment"`
> The `-C` flag adds a human-readable comment to the **end** of the public key. It has no security meaning — it's a label so you remember whose key this is. Common conventions: `name@machine`, an email, or `service-purpose`.


***

### Install your public key on the server's `authorized_keys`

Now we need to tell the server "trust me, this is my public key". 

There are two ways: the easy one, and the manual one.

> [!info]- Easy: `ssh-copy-id`
> ```bash
> ssh-copy-id -i ~/.ssh/id_ed25519_vps.pub user@server.example.com
> ```
> 
> You'll be asked for the user's password (one last time!). After this:
> 
> - The server appends your `.pub` to `~/.ssh/authorized_keys`
> - It creates `~/.ssh` and `authorized_keys` if they don't exist
> - It sets the correct permissions automatically
> 
> Test it:
> 
> ```bash
> ssh -i ~/.ssh/id_ed25519_vps user@server.example.com
> ```
> 
> No password should be requested.

> [!info]- Manual fallback
> If `ssh-copy-id` is not available (some minimal distros, some CI environments), do it by hand:
> 
> ```bash
> cat ~/.ssh/id_ed25519_vps.pub | ssh user@server.example.com \
>   "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys"
> ```
> 
> What it does:
> 
> 1. Reads your `.pub` locally
> 2. Pipes it over SSH to the server
> 3. On the server: creates `~/.ssh/` if missing, appends the key, sets permissions

### Connect

After the public key is on the server:

```bash
ssh user@server.example.com
```

SSH will look in `~/.ssh/` for a matching private key automatically. 

If you have multiple keys and want to force one though, you have to use `-i`:

```bash
ssh -i ~/.ssh/id_ed25519_vps user@server.example.com
```

Or set up an **alias**.

### Aliases: `~/.ssh/config`

Typing `ssh -i ~/.ssh/id_ed25519_vps myuser@123.45.67.89 -p 2222` every time, is painful. 

Just put it in `~/.ssh/config`:

```
Host my-vps
    HostName 123.45.67.89
    User myuser
    IdentityFile ~/.ssh/id_ed25519_vps
    Port 2222
```

Now you can just type:

```bash
ssh my-vps
```

And `scp`, `rsync`, `git` will all use the same alias too:

```bash
scp file.txt my-vps:/tmp/
rsync -av ./folder/ my-vps:~/backup/
git clone git@my-vps:repo.git
```

> [!example] Example: a realistic ~/.ssh/config file
> ```
> # Personal VPS
> Host vps
>     HostName 1.2.3.4
>     User andrea
>     IdentityFile ~/.ssh/id_ed25519_vps
>
> Host work-app1
>     HostName 10.0.1.50
>     User farneti.andrea
>     IdentityFile ~/.ssh/id_ed25519_work
>     ProxyJump work-bastion
>
> # GitHub
> Host github.com
>     User git
>     IdentityFile ~/.ssh/id_ed25519_github
> ```

### `known_hosts` and host key verification

The first time you SSH to a new server, you'll see this:

```
The authenticity of host 'server.example.com (1.2.3.4)' can't be established.
ED25519 key fingerprint is SHA256:abc123...
Are you sure you want to continue connecting (yes/no/[fingerprint])?
```

This is **TOFU** (Trust On First Use): SSH is asking you to confirm the server's identity once, then it remembers it.

When you type `yes`, the server's host key fingerprint is appended to `~/.ssh/known_hosts`. 

From then on, SSH will silently verify it matches on every connection.

 And what if the fingerprint changes?

```
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
```

SSH refuses to connect. **Possible causes**:
1. **The server was reinstalled** (new host key) → expected
2. **The server's hardware changed** → expected
3. **A man-in-the-middle attack** → NOT expected

Always investigate before clearing. 

If you're sure it's legitimate:

```bash
ssh-keygen -R server.example.com   # removes the old entry
```

Then connect again, and accept the new fingerprint.

> [!warning] Don't disable host key checking
> You may see advice online telling you to add `StrictHostKeyChecking no` to your config. **Don't do this** for important servers — it defeats the whole point of TOFU and leaves you wide open to MITM. Only use it for ephemeral throwaway VMs.

***

## File permissions: the critical bit

SSH **refuses to use** files with permissions that are too open. 

This is for your protection: a private key readable by anyone on the system is effectively compromised.

These are the correct permissions for a quick reference:

| Path / File              | `ls -l` output | Octal | Meaning                                |
| ------------------------ | -------------- | :---: | -------------------------------------- |
| `~/.ssh` (the directory) | `drwx------`   |  700  | Owner full access, nobody else         |
| `id_ed25519*` (private)  | `-rw-------`   |  600  | Owner read/write only                  |
| `*.pub` (public keys)    | `-rw-r--r--`   |  644  | Owner read/write, everyone can read    |
| `config`                 | `-rw-------`   |  600  | Owner read/write only                  |
| `known_hosts`            | `-rw-------`   |  600  | Owner read/write only                  |
| `authorized_keys`        | `-rw-------`   |  600  | Owner read/write only (on the server)  |

### Why each one

#### `~/.ssh` directory

`~/.ssh` directory needs to be: **700** (`drwx------`).
- `r` (read) → list contents
- `w` (write) → create / delete files inside
- `x` (execute) → traverse into the directory

Only the owner should be allowed to touch the folder at all.

#### Private keys

Private keys need to be: **600** (`-rw-------`).

These are **secrets**: anyone who reads them can impersonate you. 

SSH will refuse with:

```
Permissions 0644 for 'id_ed25519' are too open.
```

#### Public keys

Public keys need to be: **644** (`-rw-r--r--`).

Public keys are **meant to be shared**: having them world-readable is fine and convenient.

#### `config`, `known_hosts` and `authorized_keys

The files `config`, `known_hosts` and `authorized_keys` need to be: **600** (`-rw-------`).
They contain metadata that should be private: usernames, IPs, host fingerprints, which keys you trust. Keep them owner-only.

### One-shot fix

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/id_* ~/.ssh/config ~/.ssh/known_hosts ~/.ssh/authorized_keys 2>/dev/null
chmod 644 ~/.ssh/*.pub 2>/dev/null
```

The `2>/dev/null` swallows errors for files that don't exist on a given machine.

***

## Troubleshooting: the errors you'll actually see

### `Permission denied (publickey)`

The server rejected your key. 

Possible causes:
- Your `.pub` is **not** in the target user's `authorized_keys` on the server
- Wrong user (`ssh root@...` when you should `ssh alice@...`)
- Wrong key chosen (multiple keys → use `-i` to force the right one)
- Permissions are wrong on the server's `~/.ssh/` or `authorized_keys`

You can debug with `-v` (verbose):

```bash
ssh -v user@server.example.com
```

Read the output: **it tells you which keys it tried and why each one was rejected**.

### `Host key verification failed`

The server's fingerprint changed (see the `known_hosts` section above). 

Investigate, then:

```bash
ssh-keygen -R server.example.com
```

### `Connection refused`

SSH server is **not running** on the target, or you're blocked by a firewall. 

Verify the server's `sshd` is up:

```bash
ssh -p 22 user@server.example.com -v
```

Network layer issue, not authentication.

### `Connection timed out`

You can't even reach the host. 

Firewall, wrong IP, or VPN issue.

***
## EXTRA

### `ssh-agent`: cache the passphrase

If you set a passphrase on your private key, you'd have to type it every time, just like a normal password! 

`ssh-agent` keeps the decrypted key in memory.

Here's how to use it :

```bash
ssh-add -l # if this command answers "The agent has no identities.", you don't need to launch the eval command, you can use ssh-add directly: some environments start an agent automatically on login
eval "$(ssh-agent -s)" # starts an SSH agent in our shell
ssh-add ~/.ssh/id_ed25519_vps # adds the key in RAM, read by the ssh-agent
```

Now subsequent `ssh` commands use the cached key without prompting (you need to do this again everytime you close the shell). 

### Configuration files: where to set what

SSH has **four configuration layers**: 

- two on the client side (for the ssh-client)
- two on the server side (for the sshd-server service)

Knowing which file to touch saves you a lot of confusion.

> [!info]- Client-side configs (where you type `ssh`)
> | File                            | Scope                  | When you'd touch it                                                                                                |
> | ------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
> | `~/.ssh/config`                 | **Per-user**           | Aliases, default user/port/key for a specific host. Most-used.                                                     |
> | `/etc/ssh/ssh_config`           | **System-wide**        | Defaults applied to **every** user on the machine. Set once, applies to all.                                       |
> | `/etc/ssh/ssh_config.d/*.conf`  | **System-wide drop-ins** | Modular fragments included automatically (e.g. distro provides defaults, you add overrides as `99-local.conf`). |
> 
> Precedence: **per-user wins over system-wide**, more specific blocks (`Host my-vps`) win over generic ones (`Host *`).

> [!info]- Server-side configs (the machine running `sshd`)
> | File                            | Scope               | When you'd touch it                                                                                       |
> | ------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------- |
> | `/etc/ssh/sshd_config`          | **The SSH daemon**  | Disable password auth, change port, allow/deny users, MFA, banner, etc. **The hardening file.**          |
> | `/etc/ssh/sshd_config.d/*.conf` | **Drop-ins**        | Same as above but modular. On Ubuntu 22.04+ this is the preferred place: leaves the main file untouched.  |

> [!warning] After editing `sshd_config`, you must reload the daemon
> Changes don't take effect until you reload (or restart) `sshd`:
> 
> ```bash
> sudo systemctl reload ssh    # Debian/Ubuntu (`ssh` is the service name)
> sudo systemctl reload sshd   # RHEL/Fedora/Arch (`sshd` is the service name)
> ```
> 
> **Always test the new config BEFORE closing your current SSH session.** Open a second terminal and `ssh user@host` again — if it fails, you still have the first session to fix things. Locking yourself out of a remote box is a classic mistake.

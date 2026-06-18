---
title: "Self-hosted GitLab: your personal inventories, playbooks + CI/CD pipelines locally"
tags:
  - Projects
---
![[Pasted image 20260604181937.png]]
https://https://gitlab.farnetiandrea.it

What are the advantages of having a self-hosted GitLab?

1) You can store your Ansible Playbooks there
2) You can use them directly in Ansible AWX
3) You can create your own CI/CD pipelines
4) It's free 
5) it's open-source

This is a walkthrough for deploying a **self-hosted GitLab Community Edition** instance on a Debian/Ubuntu server.

The goal is a lab environment designed for learning and hands-on practice, providing an easy way to gain experience with GitLab and CI/CD workflows.

It is not intended to be a highly available or scalable production deployment. 

Scaling beyond ~100 users with HA requires moving to Kubernetes (or a complex multi-node setup).

We'll use:
- Docker-based deploy with `gitlab-ce`
- Nginx reverse-proxy with HTTPS
- A CI/CD runner ready to execute pipelines

***

## System requirements

GitLab packages PostgreSQL, Redis, Sidekiq, Puma, Nginx, Gitaly, and a dozen other services into a single container. 

| Users | vCPU | RAM   | Storage |
|------:|:----:|:-----:|:-------:|
| Up to 20 | 2 | 4 GB  | 20 GB SSD |
| Up to 100 | 4 | 8 GB  | 100 GB SSD |
| Up to 500 | 8 | 16 GB | 200+ GB SSD |

This guide assumes **4 vCPU / 8 GB RAM / 100 GB SSD**, which is the sweet spot for personal / small-team use.

***

## 1. Prerequisites

| Requirement                                                         | Why                                                        |
| ------------------------------------------------------------------- | ---------------------------------------------------------- |
| Debian 11/12 or Ubuntu 22.04/24.04                                  | The Docker image officially supports these                 |
| Docker + Docker Compose v2                                          | The whole deploy is containerised                          |
| A public DNS name pointed at the VPS (e.g. `gitlab.yourdomain.com`) | For HTTPS via Let's Encrypt                                |
| Ports 80, 443 reachable from internet                               | Cert validation + UI                                       |
| Ports 22, 80, 443 free **on the host** (or moved aside)             | GitLab will use SSH on its own port; see §4                |
| `sudo` access                                                       | To write under `/opt/`, `/etc/nginx/`, `/etc/letsencrypt/` |

***

## 2. Install Docker

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
    https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

***

## 3. Decide the SSH port

GitLab exposes SSH for `git push`/`git pull` over SSH. 

By default Git tries port 22, but the host's `sshd` is **already on 22** for sysadmin access. 

Three options, pick one:

| Option                                        | Pro                                                  | Contro                                                                     |
| --------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------- |
| GitLab on `2222`, host SSH on `22`            | Simplest: nothing changes for system administrators  | Users must write `git clone ssh://git@gitlab.yourdomain.com:2222/…` (ugly) |
| Host SSH moved to e.g. `2200`, GitLab on `22` | Clean URLs (`git clone git@gitlab.yourdomain.com:…`) | Requires updating every existing SSH client config                         |
| GitLab SSH disabled, HTTPS-only push          | No port conflict                                     | Loses the convenience of key-based push for users                          |

This guide uses **option 2** (host SSH moved aside), the cleanest user experience (very good option if you keep GitLab in a dedicated VPS) (see also [[SSH-Linux#How the SSH server runs sshd service vs socket activation|the dedicated SSH expalnation]]).

```bash
# 1. Move host sshd to port 2200 BEFORE bringing GitLab up
sudo sed -i 's/^#\?Port .*/Port 2200/' /etc/ssh/sshd_config
sudo systemctl restart ssh
# 2. Open the new port on the firewall (see also linux-server-hardening §5)
sudo ufw allow 2200/tcp
# 3. Reconnect via the new port BEFORE closing the current session, to verify
ssh -p 2200 user@vps
```

> [!CAUTION]
> **Don't close your current SSH session** until you've successfully reconnected on port 2200: If something goes wrong with the new config you'll be locked out.

***

## 4. Create the directory layout

```bash
sudo mkdir -p /opt/gitlab/{config,logs,data}
```

This gives GitLab three persistent volumes:

| Path | Holds |
|---|---|
| `/opt/gitlab/config` | `gitlab.rb` config file, certs, secrets |
| `/opt/gitlab/logs` | Application + service logs |
| `/opt/gitlab/data` | Everything else: repos, attachments, CI artifacts, container registry, DB |

The `data` directory is the one that grows: repositories and CI artifacts accumulate. 

***
## 5. docker-compose.yml

`/opt/gitlab/docker-compose.yml`:

```yaml
services:
  gitlab:
    image: gitlab/gitlab-ce:latest
    container_name: gitlab
    restart: unless-stopped
    hostname: gitlab.yourdomain.com
    environment:
      GITLAB_OMNIBUS_CONFIG: |
        # Public URL — must match the DNS name and the nginx reverse-proxy below
        external_url 'https://gitlab.yourdomain.com'

        # GitLab listens on 127.0.0.1:8929 (HTTP) inside the container.
        # nginx on the host proxies HTTPS:443 -> here.
        nginx['listen_port'] = 80
        nginx['listen_https'] = false
        gitlab_rails['trusted_proxies'] = ['127.0.0.1']

        # SSH port for git push/pull — published as :22 on the host
        gitlab_rails['gitlab_shell_ssh_port'] = 22

        # Disable some heavy services if you don't use them
        prometheus_monitoring['enable'] = false

        # Sane defaults for a small instance
        puma['worker_processes'] = 2
        sidekiq['max_concurrency'] = 10
        postgresql['shared_buffers'] = "256MB"
    ports:
      - "127.0.0.1:8929:80"          # HTTP — only reachable from localhost (nginx)
      - "22:22"                      # SSH for git — public
    volumes:
      - /opt/gitlab/config:/etc/gitlab
      - /opt/gitlab/logs:/var/log/gitlab
      - /opt/gitlab/data:/var/opt/gitlab
    shm_size: '256m'
```

A few notes on the choices:

- **`127.0.0.1:8929:80`** → bind HTTP to localhost only. The internet talks to nginx, nginx talks to localhost. GitLab is never directly exposed.
- **`nginx['listen_https'] = false`** → GitLab's internal nginx serves plain HTTP, TLS termination happens on the host's nginx.
- **`shm_size: '256m'`** → Postgres needs more shared memory than Docker's 64 MB default.

---

## 6. Start GitLab

```bash
cd /opt/gitlab
sudo docker compose up -d
```

The first start is **slow**: 5-10 minutes while GitLab Omnibus initializes the database, generates the initial config, and starts every service. 

Watch the logs:

```bash
sudo docker compose logs -f gitlab
```

Wait for:

```
gitlab Reconfigured!
ok: run: nginx: ...
ok: run: puma: ...
ok: run: sidekiq: ...
```

When you see `Reconfigured!`, GitLab is up.

### Get the initial root password

GitLab generates a random `root` password on first boot. 

Read it from inside the container:

```bash
sudo docker exec gitlab cat /etc/gitlab/initial_root_password
```

The file is auto-deleted after 24 hours, so copy the password to your password manager **immediately** (see [[bitwarden-setup|Bitwarden]] / [[keepass-setup|KeePass]]).

---

## 7. nginx reverse-proxy + HTTPS

Same usual pattern as [[nginx-web-server-setup|the nginx setup guide]].

### 1. Write the vhost HTTP only (Certbot adds the TLS)

Don't hand-write the `listen 443 ssl` block. 

A `listen 443 ssl` directive with no certificate yet makes `nginx -t` fail, obviously (`no "ssl_certificate" is defined`). 

Start **HTTP-only** and let Certbot inject the HTTPS server + redirect.

`/etc/nginx/sites-available/gitlab.yourdomain.com`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name gitlab.yourdomain.com;

    # GitLab pushes can be large — bump body size
    client_max_body_size 1G;

    location / {
        proxy_pass http://127.0.0.1:8929;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Long polling for CI job streaming
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

Enable the site, test, reload:

```bash
sudo ln -s /etc/nginx/sites-available/gitlab.yourdomain.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Confirm the plain-HTTP proxy works **before** adding TLS:

```bash
curl -sI http://gitlab.yourdomain.com | head -n 5   # expect: 302 → /users/sign_in
```

Of course port 80 needs to be open, also for the Certbot verification.

If it's not, enable it:

```bash
sudo ufw allow 80/tcp
```

And of course, 443/tcp too.

### 2. Issue the TLS certificate

```bash
sudo certbot --nginx -d gitlab.yourdomain.com
```

[[certbot-setup-guide|Certbot]] patches the vhost above: it adds the `listen 443 ssl` server, the `ssl_certificate` / `ssl_certificate_key` lines, an **80 → 443 redirect**, and schedules auto-renewal via `certbot.timer`. 

Pick **Redirect** when/if prompted then verify renewal works:

```bash
sudo certbot renew --dry-run
```

---

## 8. Verify

Open `https://gitlab.yourdomain.com` in a browser:

- The Welcome to GitLab login screen appears.
- Log in as `root` with the password from §6.
- Change the root password immediately (User → Edit Profile → Password).

---

## 9. CI/CD runners

A bare GitLab instance can host pipelines (`.gitlab-ci.yml`), but doesn't execute them: it needs at least one **GitLab Runner** to pick up jobs. 

Why are they separate from GitLab? So you can scale workers independently, run each job in a clean environment, and place runners close to where the work needs to happen.

Two patterns:

| Pattern                                         | Where the runner runs           | When to choose                                    |
| ----------------------------------------------- | ------------------------------- | ------------------------------------------------- |
| **Shared runner**, in the same host with GitLab | Docker container next to GitLab | Personal use, small team, no isolation concerns   |
| **Project runners on separate hosts**           | Dedicated VMs / nodes           | Multi-tenant, isolation between projects, scaling |

For the simplest single-host setup, deploy the runner as another container in the same `docker-compose.yml`:

```yaml
  gitlab-runner:
    image: gitlab/gitlab-runner:latest
    container_name: gitlab-runner
    restart: unless-stopped
    extra_hosts:
     - "gitlab.farnetiandrea.it:host-gateway"
    volumes:
      - /opt/gitlab-runner/config:/etc/gitlab-runner
      - /var/run/docker.sock:/var/run/docker.sock     # so the runner can spawn Docker jobs
```

> [!NOTE]- Why `extra_hosts: host-gateway`
> `host-gateway` writes the domain into the runner's `/etc/hosts`, resolving it to the **host's gateway**: this way the runner reaches **nginx on the host (`:443`)** with the correct SNI and certificate, instead of the GitLab container. Entries in `/etc/hosts` take precedence over Docker's internal DNS, so the name is no longer hijacked to the container's internal IP (where `:443` has no TLS listener).

Register the runner:

1. In GitLab UI: _Admin Area → CI/CD → Runners → New instance runner_, copy the registration token.
   ![[Pasted image 20260604112814.png]]
2. On the host:
    ```bash
    sudo docker exec -it gitlab-runner gitlab-runner register \  --url https://gitlab.yourdomain.com \  --registration-token <token> \  --executor docker \  --docker-image alpine:latest \  --description "shared-runner-host" \  --non-interactive
    ```
    
3. The runner appears in the GitLab UI as "online".

The job containers need the same "host-gateway" mapping: when a pipeline runs, the **job containers** the runner spawns must also reach `gitlab.yourdomain.com` to clone the repo, and they **don't inherit** the runner's `extra_hosts`. 

To achieve that, after registering, edit `config.toml` (in `/opt/gitlab-runner/config/`) and add it under the `[runners.docker]` section:

```toml
[runners.docker]
extra_hosts = ["gitlab.yourdomain.com:host-gateway"]
```

Then restart the runner so it reloads the config:

```bash

docker restart gitlab-runner

```
From now on, any `.gitlab-ci.yml` you push will be picked up by the runner.

---

## 10. Backup and restore

GitLab ships a built-in backup command that snapshots the database, repos, and config into a single tarball.

### Schedule a daily backup

```bash
sudo tee /etc/cron.d/gitlab-backup > /dev/null <<'EOF'
0 3 * * *  root  docker exec -t gitlab gitlab-backup create CRON=1
EOF
```

The backup lands in `/opt/gitlab/data/backups/` inside the container, which maps to `/opt/gitlab/data/backups/` on the host (because of the volume mount).

### Restore

```bash
# Stop services that touch data
sudo docker exec -it gitlab gitlab-ctl stop puma
sudo docker exec -it gitlab gitlab-ctl stop sidekiq

# Restore (replace TIMESTAMP with the file in /opt/gitlab/data/backups/)
sudo docker exec -it gitlab gitlab-backup restore BACKUP=TIMESTAMP

# Reconfigure + restart
sudo docker exec -it gitlab gitlab-ctl reconfigure
sudo docker exec -it gitlab gitlab-ctl restart
```

> [!IMPORTANT]
> The backup tarball does **not** include `/etc/gitlab/gitlab-secrets.json` and `/etc/gitlab/gitlab.rb`. 
> 
> Restoring a backup onto a fresh install without copying those files first will lose access to encrypted secrets (CI variables, 2FA backup codes, OAuth tokens). Back them up separately:
> 
> ```bash
> sudo cp /opt/gitlab/config/gitlab.rb /opt/gitlab/config/gitlab-secrets.json /safe/place/
> ```

---

## 11. Upgrades

GitLab releases a major version every month, security patches more often. 

The Docker image tag `latest` always points to the current GA. 

To upgrade (of course make a backup/snapshot first!):

```bash
cd /opt/gitlab
sudo docker compose pull
sudo docker compose up -d
```

GitLab runs DB migrations automatically on container start. 

First start after an upgrade can take 5-15 minutes, be patient and watch `docker compose logs -f gitlab` until you see `Reconfigured!`.

> [!WARNING] Don't skip major versions!
>  GitLab requires you to upgrade one major version at a time (e.g. 15.x → 16.0 → 16.x → 17.0), not 15.x → 17.0 directly. Pin the version tag (e.g. `gitlab/gitlab-ce:16.11.0-ce.0`) when stepping through majors, then move back to `:latest`. 
>  
>  The [official upgrade path tool](https://docs.gitlab.com/ee/update/) shows the required sequence.

---

## Where to go next

Have you deployed [[my-awx-stack|AWX]] yet?

If the answer is no, go ahead, so that you can later:

- [[awx-gitlab-wiring|Connect GitLab and AWX together]]: that way you can store inventories and playbooks in GitLab, and run them directly via Ansible AWX with a great UI!
 
- **Create CI/CD pipelines in GitLab** (`.gitlab-ci.yml`): build, test, deploy on every push. 
  A good starting point could be: build the [[create-a-wiki-like-this|wiki Quartz site]] in CI and deploy via SSH to the VPS instead of running `deploy.sh`.

This is a real production-grade interconnected stack, a professional base for professional automation!
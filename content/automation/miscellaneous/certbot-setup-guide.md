---
title: Stop thinking about certificate renewals! - Certbot guide
tags:
  - WebsiteCreation
---

## What is Certbot?

Certbot is the official **Let's Encrypt client**: a single command issues a free, auto-renewing TLS certificate for your domain. It can edit your [Nginx](nginx-web-server-setup) config in-place to enable HTTPS, install proper TLS settings, and handle the 90-day auto-renewal in the background.

***

## Prerequisites

| Requirement                                                    | Why                                          |
| -------------------------------------------------------------- | -------------------------------------------- |
| **A public domain**                                            | DNS A/AAAA record must point to the VPS      |
| **Port 80 reachable**                                          | Let's Encrypt validates ownership over HTTP  |
| **[Nginx](nginx-web-server-setup) already serving the domain** | Certbot patches the existing vhost           |
| **Root / sudo on the VPS**                                     | Writes to `/etc/nginx/`, `/etc/letsencrypt/` |

***

## Installation (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install -y certbot python3-certbot-nginx
certbot --version   # -> certbot 1.21.x or newer
```

The `python3-certbot-nginx` package is what enables the `--nginx` plugin used below.

***

## Obtain a certificate

For a single domain served by Nginx:

```bash
sudo certbot --nginx -d wiki.example.com
```

For multiple aliases on the same cert:

```bash
sudo certbot --nginx -d example.com -d www.example.com
```

Certbot will:
1. Confirm your email + ToS (first run only).
2. Solve the **HTTP-01 challenge** by serving a token over port 80.
3. Issue the certificate into `/etc/letsencrypt/live/<domain>/`.
4. Patch your existing Nginx vhost: add the `listen 443 ssl`, `ssl_certificate`, `ssl_certificate_key` directives, and an HTTP→HTTPS redirect.
5. Reload Nginx.

***

## ⚠️ Wildcard certificates

> [!WARNING]
> **`certbot --nginx` cannot issue wildcard certificates** (e.g. `*.example.com`).
> The Nginx plugin uses the **HTTP-01 challenge**, which validates only the exact hostname being requested. Wildcards require the **DNS-01 challenge**, which proves control of the entire DNS zone by writing a TXT record.

For a wildcard you need a DNS plugin matching your provider (Cloudflare, Route53, DigitalOcean, OVH, …):

```bash
# Cloudflare example
sudo apt install -y python3-certbot-dns-cloudflare

# Credentials file (chmod 600!) with a scoped API token
cat > ~/.secrets/cloudflare.ini <<'EOF'
dns_cloudflare_api_token = <your-zone-edit-token>
EOF
chmod 600 ~/.secrets/cloudflare.ini

sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials ~/.secrets/cloudflare.ini \
  -d example.com -d '*.example.com'
```

Note the `certonly`: with wildcards Certbot only issues the cert, it won't auto-edit the Nginx vhost. You wire the `ssl_certificate` paths into Nginx yourself. Renewal still works automatically through `certbot.timer` because the credentials and challenge are saved in the renewal config.

If your DNS provider isn't in the official plugin list, the alternatives are `--manual --preferred-challenges dns` (no auto-renewal) or `acme.sh` with a custom DNS hook.

***

## What Certbot adds to the vhost

After `certbot --nginx`, your vhost looks roughly like this:

```nginx
server {
    server_name wiki.example.com;
    root /var/www/wiki;
    index index.html;
    location / { try_files $uri $uri.html $uri/ =404; }

    # ── added by Certbot ──
    listen [::]:443 ssl;
    listen 443 ssl;
    ssl_certificate     /etc/letsencrypt/live/wiki.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/wiki.example.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

# also added: HTTP -> HTTPS redirect
server {
    if ($host = wiki.example.com) {
        return 301 https://$host$request_uri;
    }
    listen 80;
    listen [::]:80;
    server_name wiki.example.com;
    return 404;
}
```

The lines with `# managed by Certbot` are owned by Certbot — touch them only if you know what you're doing.

***

## Auto-renewal

On systemd-based distros (Ubuntu 16.04+, Debian 9+) the package installs a `certbot.timer` that runs **twice a day** and renews any cert within 30 days of expiry. Verify with:

```bash
systemctl list-timers | grep certbot
# certbot.timer ... certbot.service

systemctl status certbot.timer
```

Test the renewal flow without actually renewing:

```bash
sudo certbot renew --dry-run
```

If something looks off, the renewal config for each domain lives in `/etc/letsencrypt/renewal/<domain>.conf`:

```ini
[renewalparams]
authenticator = nginx
installer = nginx
server = https://acme-v02.api.letsencrypt.org/directory
```

***

## Useful commands

| Command | What it does |
|---|---|
| `sudo certbot certificates` | List installed certs + expiry dates |
| `sudo certbot renew` | Force a renewal pass (only if within 30 days) |
| `sudo certbot renew --force-renewal` | Renew even if not yet due (dev/debug only) |
| `sudo certbot delete --cert-name <domain>` | Remove a cert |
| `sudo certbot --nginx -d new.example.com` | Add HTTPS to a new domain |
| `sudo certbot --nginx --expand -d a.com -d b.com` | Add another domain to an existing cert |

***

## Real-world example: this wiki

The wiki you're reading runs the exact setup described above. The vhost lives in `/etc/nginx/conf.d/wiki.farnetiandrea.it.conf`:

```nginx
server {
    server_name wiki.farnetiandrea.it;
    root ~/wiki/public;
    index index.html;
    location / { try_files $uri $uri.html $uri/ =404; }

    listen [::]:443 ssl;            # managed by Certbot
    listen 443 ssl;                 # managed by Certbot
    ssl_certificate     /etc/letsencrypt/live/wiki.farnetiandrea.it/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/wiki.farnetiandrea.it/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

server {
    if ($host = wiki.farnetiandrea.it) {
        return 301 https://$host$request_uri;
    }
    listen 80;
    listen [::]:80;
    server_name wiki.farnetiandrea.it;
    return 404;
}
```

The renewal config in `/etc/letsencrypt/renewal/wiki.farnetiandrea.it.conf` declares `authenticator = nginx, installer = nginx`, so Certbot reuses the Nginx plugin both to validate and to install renewed certs directly in Nginx.


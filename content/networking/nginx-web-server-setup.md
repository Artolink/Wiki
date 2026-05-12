---
title: NGINX Made Easy - Simple, Secure Web Server Setup
tags:
  - WebsiteCreation
---

## What is Nginx?

Nginx is a high-performance **web server** and **reverse proxy** that powers a huge slice of the internet. It excels at three things:

1. **Serving static files** (HTML, images, generated sites) extremely fast.
2. **Reverse-proxying** requests to application servers (Node, Python, Go, Java) listening on local ports.
3. **TLS termination**: handle HTTPS once, talk plain HTTP to your backends behind the scenes.

It's event-driven, single-threaded per worker, and uses very little RAM compared to Apache.

***

## Installation (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install -y nginx
sudo systemctl enable --now nginx
nginx -v   # -> nginx/1.18.x or newer
```

Verify it's serving the default page:

```bash
curl -I http://localhost
# HTTP/1.1 200 OK
# Server: nginx/1.18.0 (Ubuntu)
```

***

## Directory layout

| Path | Purpose |
|---|---|
| `/etc/nginx/nginx.conf` | Master config — `events {}`, `http {}`, includes |
| `/etc/nginx/conf.d/*.conf` | Drop-in vhosts auto-loaded by `nginx.conf` |
| `/etc/nginx/sites-available/` | Vhosts you write but may not enable |
| `/etc/nginx/sites-enabled/` | Symlinks → `sites-available/` (only enabled ones) |
| `/etc/nginx/snippets/` | Reusable config fragments (TLS hardening, etc.) |
| `/var/log/nginx/access.log` | Request log |
| `/var/log/nginx/error.log` | Errors — first place to look when something breaks |

`conf.d/` and `sites-enabled/` are equivalent — pick one and stick with it. Personally I prefer `conf.d/` for a flatter layout (no symlink dance).

***

## Anatomy of a vhost

A *server block* (vhost) tells Nginx how to handle requests for a given domain.

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;

    root /var/www/example;     # filesystem root for static files
    index index.html;

    location / {
        try_files $uri $uri.html $uri/ =404;
    }
}
```
^basic-conf

Key directives:

| Directive | What it does |
|---|---|
| `listen` | Port + protocol (add `ssl` for HTTPS, `http2` for HTTP/2) |
| `server_name` | Domain(s) this block answers for |
| `root` | Directory mapped to `/` of the URL |
| `index` | Default file when the URL is a directory |
| `location <pattern> { … }` | Matches request paths; can nest |
| `try_files` | Try each path in order, fall back to last |
| `return 301 $url` | Permanent redirect |
| `proxy_pass <upstream>` | Reverse proxy to a backend |

***

## Common patterns

### 1. Static site

```nginx
server {
    listen 80;
    server_name docs.example.com;

    root /var/www/docs;
    index index.html;

    location / {
        try_files $uri $uri.html $uri/ =404;
    }
}
```

### 2. Reverse proxy to a Node app on `127.0.0.1:3000`

```nginx
server {
    listen 80;
    server_name app.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 4. Hardening headers (one-liner per header)

```nginx
add_header X-Content-Type-Options nosniff always;
add_header X-Frame-Options DENY always;
add_header Referrer-Policy no-referrer-when-downgrade always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

***

## Test + reload — every time you edit a config

```bash
sudo nginx -t            # syntax check
sudo systemctl reload nginx
```

`reload` is a graceful restart — no dropped connections. Use `restart` only when you change `nginx.conf` itself.

***

## HTTPS

Nginx doesn't issue certificates on its own. Pair it with [Certbot](certbot-setup-guide): a single `sudo certbot --nginx -d your-domain.com` adds `listen 443 ssl`, the cert paths, and an HTTP→HTTPS redirect to the existing vhost, plus auto-renewal via `certbot.timer`.

***

## Useful commands

| Command | What it does |
|---|---|
| `sudo nginx -t` | Validate the entire config |
| `sudo nginx -T` | Validate **and dump** the merged config (great for debugging) |
| `sudo systemctl reload nginx` | Apply changes without dropping connections |
| `sudo systemctl status nginx` | Service state + last log lines |
| `sudo journalctl -u nginx -f` | Tail the service journal |
| `sudo tail -f /var/log/nginx/error.log` | Tail the error log |
| `curl -I https://your-domain.com` | Quick header / status check |

***

## Real-world example: this wiki

This wiki is a **static site** (Quartz output) served by Nginx with HTTPS issued by Certbot. The vhost lives in `/etc/nginx/conf.d/wiki.farnetiandrea.it.conf`:

```nginx
# HTTP -> HTTPS redirect (added by Certbot)
server {
    if ($host = wiki.farnetiandrea.it) {
        return 301 https://$host$request_uri;
    }
    listen 80;
    listen [::]:80;
    server_name wiki.farnetiandrea.it;
    return 404;
}

# HTTPS: serve the static Quartz output
server {
    server_name wiki.farnetiandrea.it;

    root ~/wiki/public;       # Quartz build output
    index index.html;

    location / {
        try_files $uri $uri.html $uri/ =404;
    }

    listen [::]:443 ssl;      # managed by Certbot
    listen 443 ssl;           # managed by Certbot
    ssl_certificate     /etc/letsencrypt/live/wiki.farnetiandrea.it/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/wiki.farnetiandrea.it/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}
```

> [!NOTE]
> Nginx does **not** expand `~` to the user's home directory — that's a shell convention, not an Nginx one. In a real config use the absolute path (e.g. `/var/www/wiki` or the full home path). `~/wiki/public` is shown here only to keep the example free of personal account details.

The same VPS also hosts `farnetiandrea.it` (a small landing page + a reverse-proxied Node app called *OfficeGamble*). One file per domain in `conf.d/`!

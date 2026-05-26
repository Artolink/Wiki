---
title: "Kibana: Our web UI for the ELK Stack"
---
Read [[observability/logs/kibana/_index|this Kibana overview]] for a quick theory lesson.

## Overview

This page covers the **base deploy** of Kibana: Docker container on the VPS, talking to the local Elasticsearch, served under the sub-path `/logs/` of `farnetiandrea.it` via nginx. 

Public access stays behind a login form: anyone hitting `farnetiandrea.it/logs` gets the basic auth screen.

The follow-up page [[observability/logs/kibana/kibana-viewer-mode|"Kibana viewer-mode"]] layers an anonymous provider on top, so visitors land directly on Discover without a login. 

Get the base deploy working first, then layer the viewer mode if you want.

This is what will be exposed, and to whom:

| Address                              | Reached from              | Behind auth?              |
| ------------------------------------ | ------------------------- | ------------------------- |
| `https://farnetiandrea.it/logs`      | Public internet via nginx | Yes, login form           |
| `http://127.0.0.1:5601` (on the VPS) | Same host only            | Yes, Kibana requires auth |

## Prerequisites

- Elasticsearch already up (see [[observability/logs/elasticsearch/elasticsearch-setup|its dedicated page]]).
- Nginx already running on your VPS.


## Installation
### 1. Generate Kibana credentials

Two values needed:

- **`kibana_system` password**: Kibana authenticates to ES with this built-in service user. It exists in ElasticSearch from day one, but starts with an empty / random password.
- **Encryption key**: Kibana encrypts certain saved objects (alerts, reports, connectors). If you don't set a persistent key, Kibana picks a random one at every restart and previously-encrypted saved objects become unreadable.

```bash
echo "KIBANA_SYSTEM=$(openssl rand -hex 24)"
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)"
```

Copy both [[keepass-setup|into your password manager]], then append them to `/opt/observability-logs/.env`:

```bash
sudo tee -a /opt/observability-logs/.env > /dev/null <<'EOF'
KIBANA_SYSTEM_PASSWORD=<paste hex value here>
KIBANA_ENCRYPTION_KEY=<paste hex value here>
EOF
```

### 2. Add the password of `kibana_system` user in ElasticSearch

```bash
cd /opt/observability-logs
ELASTIC=$(grep '^ELASTIC_PASSWORD=' .env | cut -d= -f2-)
KS=$(grep '^KIBANA_SYSTEM_PASSWORD=' .env | cut -d= -f2-)

curl -sX POST -u "elastic:$ELASTIC" \
  -H "Content-Type: application/json" \
  http://localhost:9200/_security/user/kibana_system/_password \
  -d "{\"password\":\"$KS\"}"
echo

# Verify
curl -s -o /dev/null -w "kibana_system auth: HTTP %{http_code}\n" \
  -u "kibana_system:$KS" http://localhost:9200/_cluster/health
# kibana_system auth: HTTP 200
```

### 3. Add the Kibana service in docker-compose

Append the Kibana service to `/opt/observability-logs/docker-compose.yml`, next to the existing Elasticsearch service:

> [!example]- Example: my docker-compose (kibana service)
> ```yaml
>   kibana:
>     image: docker.elastic.co/kibana/kibana:8.15.0
>     container_name: kibana
>     user: "1000:1000"
>     depends_on:
>       elasticsearch:
>         condition: service_healthy
>     environment:
>       - ELASTICSEARCH_HOSTS=http://elasticsearch:9200
>       # Kibana authenticates to ES with the built-in kibana_system user
>       - ELASTICSEARCH_USERNAME=kibana_system
>       - ELASTICSEARCH_PASSWORD=${KIBANA_SYSTEM_PASSWORD}
>       # Sub-path config — Kibana is served under farnetiandrea.it/logs
>       - SERVER_BASEPATH=/logs
>       - SERVER_REWRITEBASEPATH=true
>       - SERVER_PUBLICBASEURL=https://farnetiandrea.it/logs
>       - TELEMETRY_OPTIN=false
>       # Persistent key for saved-object encryption (no random key per restart)
>       - XPACK_ENCRYPTEDSAVEDOBJECTS_ENCRYPTIONKEY=${KIBANA_ENCRYPTION_KEY}
>     volumes:
>       - /opt/observability-logs/kibana-data:/usr/share/kibana/data
>     ports:
>       # Localhost only — nginx proxies to this port
>       - "127.0.0.1:5601:5601"
>     networks:
>       - elk-net
>     restart: unless-stopped
>     healthcheck:
>       test: ["CMD-SHELL", "curl -fsS http://localhost:5601/logs/api/status || exit 1"]
>       interval: 30s
>       timeout: 5s
>       retries: 5
> ```

A few notes on the choices:

- **`SERVER_BASEPATH=/logs`** + **`SERVER_REWRITEBASEPATH=true`**: Kibana itself handles the `/logs` prefix on every URL it emits and accepts. The reverse-proxy does not strip the prefix, it passes the path through unchanged.
- **`SERVER_PUBLICBASEURL=https://farnetiandrea.it/logs`**: used when generating absolute URLs (sharing links, email reports, etc.). Must match the public URL exactly.
- **`127.0.0.1:5601`** binding: Kibana is reachable only from the same host, then the internet talks to nginx, and nginx talks to localhost.
- **`depends_on: elasticsearch: condition: service_healthy`**: Kibana refuses to start cleanly if ES isn't ready. Waiting for `service_healthy` (not just `service_started`) avoids the restart loop.

Create the data dir:

```bash
sudo mkdir -p /opt/observability-logs/kibana-data
sudo chown -R 1000:1000 /opt/observability-logs/kibana-data
```

### 4. Start Kibana

```bash
cd /opt/observability-logs
sudo docker compose up -d kibana
sudo docker compose logs -f kibana
```

First start takes ~90 seconds (plugin setup + migrations). 

Wait for:

```
[INFO ][status] Kibana is now available
```

Verify locally:

```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:5601/logs/api/status
# HTTP 200
```

### 5. Nginx reverse-proxy at `/logs/`

Add a `location /logs/` block to your existing virtual host in Nginx. 

My config file lives at `/etc/nginx/sites-available/farnetiandrea.it`:

> [!example]- Example: my nginx config (Kibana location block)
> ```nginx
> # Kibana (ELK Stack) at /logs/
> location /logs/ {
>     # No trailing slash on proxy_pass: keep /logs in the request.
>     # Kibana strips it internally because SERVER_REWRITEBASEPATH=true.
>     proxy_pass http://127.0.0.1:5601;
>
>     proxy_set_header Host              $host;
>     proxy_set_header X-Real-IP         $remote_addr;
>     proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
>     proxy_set_header X-Forwarded-Proto $scheme;
>
>     # Kibana uses WebSockets for live updates and Discover tail
>     proxy_http_version 1.1;
>     proxy_set_header Upgrade    $http_upgrade;
>     proxy_set_header Connection "upgrade";
>
>     # Discover queries and dashboard panels can be slow on big indices
>     proxy_read_timeout 90s;
>     proxy_send_timeout 90s;
> }
> ```

> [!INFO]
> **No trailing slash on `proxy_pass`** (`http://127.0.0.1:5601;`, not `http://127.0.0.1:5601/;`). 
> 
> With a trailing slash, nginx strips the matched prefix `/logs/` before forwarding, but Kibana expects to see `/logs/` because we set `SERVER_REWRITEBASEPATH=true`. 
> 
> Without the trailing slash, nginx passes the full URI through and Kibana handles the prefix itself.

Reload nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 6. Verify public access

Open the URL in a browser. You should see the **Welcome to Elastic** login form. 

Log in with `elastic` + the password from `/opt/observability-logs/.env`. 

After login you land on the Kibana home.

If you see a 502, check `sudo docker compose ps` (Kibana healthy?) and `sudo docker compose logs kibana` (any error?).

### 7. Create a Data View

A Data View tells Kibana which Elasticsearch indices to expose to "Discover", "Dashboard", and the rest of the UI. 

Without it, Discover stays empty even when data exists. 

Create one as soon as you have an index pattern to point at (typically once a log producer is shipping events).

1. Log in as `elastic`.
2. **Stack Management → Data Views → Create data view**.
3. **Name**: `logs`. **Index pattern**: `logs-*`. **Timestamp field**: `@timestamp`.
4. **Save data view to Kibana**.

Of course if you are following this guide step-by-step, you won't see anything, for now.



## Where to go next

Go on and check out how to assemble the next piece of the puzzle: [[logstash-setup|the Logstash workers setup]]!
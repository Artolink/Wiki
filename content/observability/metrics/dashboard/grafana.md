---
title: "Grafana: query and isualize metrics via GUI"
tags:
---

##  What it is

**Grafana** is the visualization frontend of the stack. 

You log into a web UI, configure one or more **datasources** and build **dashboards** made of graphs, gauges, tables and much more.
Each of them runs a PromQL query against the datasource and plots the result.

For us:

- Runs as a **Docker container on the VPS** (in the same compose file as VictoriaMetrics).
- Reaches VictoriaMetrics via the Docker network using the service name `victoriametrics:8428` (no port exposure needed on the host).
- Exposed publicly at `https://farnetiandrea.it/metrics/` via my existing nginx + certbot stack as a reverse-proxy. 

## 1. Setup:

### 1. Create the directory

```bash
mkdir -p ~/observability/grafana-data
cd ~/observability
```

### 2. Set ownership to UID 472

> [!WARNING]
> **Not optional.** Grafana inside the container runs as **UID 472** (a Grafana-specific user, *not* 1000 like VictoriaMetrics). Without this chown, the container crashes with messages like `mkdir: cannot create directory '/var/lib/grafana/plugins': Permission denied`.

```bash
sudo chown -R 472:472 grafana-data
```

###  3. Pick a free host port

Grafana inside the container listens on `3000`, but on the host you can map it to any port you want. **First check that the chosen host port is free**, because `3000` is one of the most common defaults on Linux servers (Node.js apps, other dashboards, ...):

```bash
ss -tlnp | grep -E ':(3000|3001)\s'
```

- If you get **no output**, port `3000` is free → use `3000` in the compose file.
- If something is listening on `3000`, pick the next free one (`3001`, `3030`, whatever). Make sure you adjust **both** the compose `ports:` line **and** the nginx `proxy_pass` accordingly.

For the rest of this page I'll use **`3001`** because in my setup `3000` is taken by another app.

### 4. Add Grafana to the existing `docker-compose.yml`

Edit `~/observability/docker-compose.yml` and **add the `grafana:` service** to the existing `services:` block. 

Your full compose file should look like this:

```yaml
services:
  victoriametrics:
    image: victoriametrics/victoria-metrics:v1.107.0
    container_name: victoriametrics
    restart: unless-stopped
    user: "1000:1000"
    ports:
      - "<VPS_PRIVATE_IP>:8428:8428"
    volumes:
      - ./victoriametrics-data:/storage
    command:
      - "-storageDataPath=/storage"
      - "-retentionPeriod=1"
      - "-httpListenAddr=:8428"

  grafana:
    image: grafana/grafana-oss:11.3.0
    container_name: grafana
    restart: unless-stopped
    user: "472:472"
    depends_on:
      - victoriametrics
    ports:
      - "127.0.0.1:3001:3000"           # host 3001 → container 3000
    volumes:
      - ./grafana-data:/var/lib/grafana
    environment:
      - GF_SERVER_ROOT_URL=https://farnetiandrea.it/metrics/
      - GF_SERVER_SERVE_FROM_SUB_PATH=true
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=changeme-please
      - GF_USERS_ALLOW_SIGN_UP=false
      - GF_USERS_DEFAULT_THEME=dark

networks:
  default:
    name: observability
```

The points to notice:

- **`127.0.0.1:3001:3000`** — Grafana listens *only* on the VPS's loopback interface. Nginx will proxy to it.
- **`GF_SERVER_ROOT_URL`** and **`GF_SERVER_SERVE_FROM_SUB_PATH=true`** — together, they tell Grafana "you live at the path `/metrics`, generate all internal URLs and redirects accordingly". Without these, the login form, API calls and static assets all break.
- **`GF_SECURITY_ADMIN_PASSWORD`** is a placeholder. Change it before starting, or change it via web UI on first login.

### 5. Start Grafana

```bash
docker compose up -d
docker compose ps
```

Expected: both `victoriametrics` and `grafana` in `running` state.

If not, you can check logs as always:

```bash
docker compose logs grafana --tail=30
```

Quick test from the **VPS itself** (Grafana is on localhost:3001):

```bash
curl -s http://localhost:3001/api/health
# Expected: {"commit":"...","database":"ok","version":"11.3.0"}
```

##  2. Nginx configuration

I'm editing the existing nginx server block for `farnetiandrea.it`:

```bash
sudo nano /etc/nginx/sites-available/farnetiandrea.it
```

And I **add this `location` directive** (alongside the other locations I have):

```nginx
location /metrics/ {
    proxy_pass http://localhost:3001;        # NO trailing slash — see note below
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Grafana uses WebSockets for live tail, alerts, etc.
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

> [!IMPORTANT]
> **No trailing slash** on `proxy_pass http://localhost:3001`. This is *the* detail that determines whether Grafana works or gets stuck in a redirect loop.

Test the config and reload nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Verification

Open: `https://farnetiandrea.it/metrics/`

Expected: Grafana login screen.

If so, log in with `admin` / the password from `GF_SECURITY_ADMIN_PASSWORD`.

##  3. Grafana configuration
### Configure the VictoriaMetrics datasource

In the Grafana UI:

1. Left sidebar → **Connections** → **Data sources** → **Add data source**.
2. Search and pick **Prometheus** (yes, Prometheus: I'll explain why in a minute).
3. Fill in:
   - **Name**: `prometheus` (or `VictoriaMetrics`, whatever you prefer, it's just a label).
   - **URL**: `http://victoriametrics:8428` (Docker DNS: both containers are on the `observability` network, they resolve each other by service name).
   - **Access**: leave as `Server (default)`.
   - Everything else: defaults.
4. Click **Save & test** at the bottom.

Expected: green banner *"Successfully queried the Prometheus API"*.

> [!INFO]
> **Why "Prometheus" and not the dedicated "VictoriaMetrics" datasource plugin?**
> 
> VictoriaMetrics is **API-compatible** with Prometheus: Grafana's built-in Prometheus connector speaks to it natively, no plugin needed. There exists a separate **VictoriaMetrics datasource plugin** that adds VM-specific features, but for standard observability with PromQL, the built-in Prometheus datasource is:
> 
> - **More portable**: if you swap DB tomorrow, dashboards probably will keep working.
> - **The community standard**: every pre-made dashboard on `grafana.com/dashboards` expects the `Prometheus` datasource type as a parameter.
>   

### Our first query

Left sidebar → **Explore** → make sure the datasource at the top is the one you configured.

Type:

```promql
up
```

And click **Run query**. It should answer.

Great! we've finished! Time to build real dashboards now! 

If you want to take your first steps, check out [[create-dashboards-views|the dedicated page]].

### EXTRA: Anonymous viewer mode

By default Grafana requires a login. 

If you want to **share your dashboards publicly** as a read-only showcase (just like my `https://farnetiandrea.it/metrics/`, anybody can see them without an account), Grafana has a native **anonymous viewer** mode.

The anonymous user gets the **Viewer** role: can browse and zoom into any panel, but cannot edit, delete, change datasources, or access admin pages. 

You (the real admin) can still log in via the "Sign in" button in the top-right corner.

You just need to add these four env vars to the `grafana:` service in your `docker-compose.yml`:

```yaml
    environment:
      # ... your existing vars ...
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_NAME=Main Org.
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Viewer
      - GF_AUTH_ANONYMOUS_HIDE_VERSION=true
```

And to restart Grafana:

```bash
docker compose up -d grafana
```

You can test in an **incognito browser window** (no cookies), and you should land directly on the Grafana home dashboard without login prompt.

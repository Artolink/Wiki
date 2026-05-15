---
title: "4. Grafana: visualize metrics"
tags:
---

##  What it is

**Grafana** is the visualization frontend of the stack. You log into a web UI, configure one or more **datasources** (in our case, VictoriaMetrics), and build **dashboards** made of panels (graphs, gauges, tables) — each panel runs a PromQL query against the datasource and plots the result.

For us:

- Runs as a **Docker container on the VPS** (in the same compose file as VictoriaMetrics).
- Reaches VictoriaMetrics via the Docker network using the service name `victoriametrics:8428` — no port exposure needed on host.
- Exposed publicly at `https://farnetiandrea.it/metrics/` via the existing nginx + certbot stack as a reverse-proxy. No new certificate, no new DNS record.

##  Prepare the persistent storage

> [!IMPORTANT]
> Run this on the **VPS**, inside `~/observability/`. Grafana needs a UID-matched bind-mount or the container crashes at startup with `permission denied`.

### Step 1 — Create the directory

```bash
mkdir -p ~/observability/grafana-data
cd ~/observability
```

### Step 2 — Set ownership to UID 472

> [!WARNING]
> **Not optional.** Grafana inside the container runs as **UID 472** (a Grafana-specific user, *not* 1000 like VictoriaMetrics). Without this chown, the container crashes with messages like `mkdir: cannot create directory '/var/lib/grafana/plugins': Permission denied`.

```bash
sudo chown -R 472:472 grafana-data
```

### Step 3 — Verify

```bash
ls -ld grafana-data
# Expected: drwxr-xr-x ... 472 472 ...
```

##  Pick a free host port

Grafana inside the container listens on `3000`, but on the host you can map it to any port you want. **First check that the chosen host port is free**, because `3000` is one of the most common defaults on Linux servers (Node.js apps, other dashboards, ...):

```bash
ss -tlnp | grep -E ':(3000|3001)\s'
```

- If you get **no output**, port `3000` is free → use `3000` in the compose file.
- If something is listening on `3000`, pick the next free one (`3001`, `3030`, whatever). Make sure you adjust **both** the compose `ports:` line **and** the nginx `proxy_pass` accordingly.

For the rest of this page I'll use **`3001`** because in my setup `3000` is taken by another app. Replace with what you picked.

##  Add Grafana to the existing `docker-compose.yml`

Edit `~/observability/docker-compose.yml` and **add the `grafana:` service** to the existing `services:` block. Your full compose file should look like this:

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

- **`127.0.0.1:3001:3000`** — Grafana listens *only* on the VPS's loopback interface. Nginx will proxy to it. No public port, no Tailscale port, nothing to firewall.
- **`GF_SERVER_ROOT_URL`** and **`GF_SERVER_SERVE_FROM_SUB_PATH=true`** — together, they tell Grafana "you live at the path `/metrics`, generate all internal URLs and redirects accordingly". Without these, the login form, API calls and static assets all break.
- **`GF_SECURITY_ADMIN_PASSWORD`** — a placeholder. Change it before starting, or change it via web UI on first login (Grafana *forces* a password change at first login regardless).
- **No `healthcheck:`** on `victoriametrics`. The official VM image is `scratch`-based and contains *only* the Go binary — no `wget`, no `curl`, no shell. Any healthcheck command would fail. Grafana's `depends_on: - victoriametrics` (without `condition: service_healthy`) is enough: Grafana waits for VM to be created, then retries the datasource at first connection. If the VM image you use has its own embedded HEALTHCHECK that's getting in the way, add `healthcheck: { disable: true }` under `victoriametrics:` to override it.

##  Start Grafana

```bash
docker compose up -d
docker compose ps
```

Expected: both `victoriametrics` and `grafana` in `running` state.

Check logs:

```bash
docker compose logs grafana --tail=30
```

You should see lines like `Grafana migrations started`, then `HTTP Server Listen ... address=:3000`. No errors about permissions or missing files.

Quick test from the **VPS itself** (Grafana is on localhost:3001):

```bash
curl -s http://localhost:3001/api/health
# Expected: {"commit":"...","database":"ok","version":"11.3.0"}
```

##  Expose via nginx reverse-proxy at `/metrics`

Edit the existing nginx server block for `farnetiandrea.it`:

```bash
sudo nano /etc/nginx/sites-available/farnetiandrea.it
```

Inside the existing `server { ... }` block for HTTPS, **add this `location` directive** (alongside the other locations you have):

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
> **No trailing slash** on `proxy_pass http://localhost:3001`. This is *the* detail that determines whether Grafana works or gets stuck in a redirect loop. See [proxy_pass and the trailing slash](#proxypass-and-the-trailing-slash) below.

Test the config and reload nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

##  First contact via browser

Open: `https://farnetiandrea.it/metrics/`

Expected: Grafana login screen.

Log in with `admin` / the password from `GF_SECURITY_ADMIN_PASSWORD`. Grafana will *force* you to change the admin password at first login — use a real one, save it in your password manager.

##  Configure the VictoriaMetrics datasource

In the Grafana UI:

1. Left sidebar → **Connections** → **Data sources** → **Add data source**.
2. Search and pick **Prometheus** (yes, Prometheus — VictoriaMetrics is API-compatible, this is how Grafana talks to it).
3. Fill in:
   - **Name**: `prometheus` (or `VictoriaMetrics`, whatever you prefer — it's just a label).
   - **URL**: `http://victoriametrics:8428` (Docker DNS — both containers are on the `observability` network, they resolve each other by service name).
   - **Access**: leave as `Server (default)`.
   - Everything else: defaults.
4. Click **Save & test** at the bottom.

Expected: green banner *"Successfully queried the Prometheus API"*.

>  [!TIP]
> **Why "Prometheus" and not the dedicated "VictoriaMetrics" datasource plugin?**
> 
> VictoriaMetrics is **API-compatible** with Prometheus — Grafana's built-in Prometheus connector speaks to it natively, no plugin needed. There exists a separate **VictoriaMetrics datasource plugin** that adds VM-specific features (MetricsQL — a superset of PromQL with extra functions like `histogram_quantiles()` and `keep_last_value()`, server-side query limits, deep-links to VMUI from queries). It's useful **only if** you actively want those features. For standard observability with PromQL, the built-in Prometheus datasource is:
> 
> - **More portable**: dashboards written against it work unchanged on Prometheus, Mimir, Thanos, or any other PromQL-compatible backend. If you swap the backend tomorrow, dashboards keep working.
> - **The community standard**: every pre-made dashboard on `grafana.com/dashboards` expects the `Prometheus` datasource type as a parameter.
> - **One less moving piece**: no plugin install, no version compatibility to track.
> 
> Choose the dedicated VM plugin only when you have a specific use case that needs MetricsQL.

##  First query

Left sidebar → **Explore** → make sure the datasource at the top is the one you configured.

Type:

```promql
up
```

Click **Run query**. Expected: a row with labels `host=vps-personaldomain`, `instance=100.114.84.48:9100`, `job=node`, `cluster=home`, value `1`.

Time to build real dashboards — see [Dashboards](create-dashboards-views.md).

##  Anonymous viewer mode (public read-only access)

By default Grafana requires a login. If you want to **share your dashboards publicly** as a read-only showcase (so anyone visiting `https://farnetiandrea.it/metrics/` can see them without an account), Grafana has a native **anonymous viewer** mode.

The anonymous user gets the **Viewer** role: can browse and zoom into any panel, but cannot edit, delete, change datasources, or access admin pages. You (the real admin) can still log in via the "Sign in" button in the top-right corner.

### Configuration

Add these four env vars to the `grafana:` service in your `docker-compose.yml`:

```yaml
    environment:
      # ... your existing vars ...
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_NAME=Main Org.
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Viewer
      - GF_AUTH_ANONYMOUS_HIDE_VERSION=true
```

| Variable | Effect |
|---|---|
| `GF_AUTH_ANONYMOUS_ENABLED=true` | Grants Viewer access to anonymous visitors. |
| `GF_AUTH_ANONYMOUS_ORG_NAME=Main Org.` | Which Grafana organization the anonymous user belongs to. `Main Org.` is the default. |
| `GF_AUTH_ANONYMOUS_ORG_ROLE=Viewer` | Role assigned. **Always Viewer** — never `Editor` or `Admin` for public access. |
| `GF_AUTH_ANONYMOUS_HIDE_VERSION=true` | Hides the Grafana version in the UI for anonymous users (anti-fingerprinting hygiene). |

Restart Grafana:

```bash
docker compose up -d grafana
```

Test in an **incognito browser window** (no cookies): `https://farnetiandrea.it/metrics/` should land you directly on the home dashboard, no login prompt.

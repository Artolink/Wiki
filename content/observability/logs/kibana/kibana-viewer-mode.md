---
title: Kibana — Public Read-Only Viewer Mode
---

The base Kibana deploy ([[observability/logs/kibana/kibana-setup|kibana-setup]]) puts the UI behind a login form. That's the right default — but for a site whose explicit goal is sharing dashboards with the public, we want visitors to **land directly on Discover** without entering any credentials, while still keeping a basic-auth path for the admin who actually edits things.

This page is about adding that public read-only experience on top of the existing deploy. Three moving parts:

1. A **least-privilege role** in Elasticsearch that allows reading log indices and using Discover / Dashboard / Visualize, and nothing else.
2. An **Elasticsearch user** (`anonymous`) bound to that role.
3. An **anonymous authentication provider** in Kibana that auto-logs the visitor in as that user.

## Why "role-level" read-only, not "HTTP-level"

A tempting first reaction is to put a guard in nginx: "only allow `GET` and `HEAD` on `/logs/`". This **does not work** for Kibana:

- Kibana issues `POST` requests for ordinary **read** operations. Every Discover query is a `POST /api/console/proxy` with a JSON body. Every Dashboard refresh is a `POST` against `_search`. Block `POST` and the UI breaks immediately.
- The HTTP verb is not a reliable signal of write intent in any modern app — REST-ish backends route writes via verb, but Kibana's API is closer to RPC-over-HTTP.

The correct layer to enforce read-only is the **Elasticsearch role**: grant `read` on the data indices and the right Kibana application privileges, withhold `write` / `manage`. The user can then click anywhere, and the ones that try to write fail with `403 Forbidden` at the data layer.

## Step 1 — generate the anonymous user's password

```bash
echo "ANONYMOUS=$(openssl rand -hex 24)"
```

Copy the hex value into your password manager, then append it to `/opt/observability-logs/.env`:

```bash
sudo tee -a /opt/observability-logs/.env > /dev/null <<'EOF'
ANONYMOUS_PASSWORD=<paste hex value here>
EOF
```

## Step 2 — create the `log_viewer` role

Read-only, scoped to log indices, with the minimum Kibana application privileges needed to use Discover, Dashboard, and Visualize on the default space.

```bash
cd /opt/observability-logs
ELASTIC=$(grep '^ELASTIC_PASSWORD=' .env | cut -d= -f2-)

curl -sX PUT -u "elastic:$ELASTIC" \
  -H "Content-Type: application/json" \
  http://localhost:9200/_security/role/log_viewer \
  -d '{
    "cluster": ["monitor"],
    "indices": [{
      "names": ["filebeat-*", "logstash-*", "logs-*"],
      "privileges": ["read", "view_index_metadata"]
    }],
    "applications": [{
      "application": "kibana-.kibana",
      "privileges": [
        "feature_discover.read",
        "feature_dashboard.read",
        "feature_visualize.read"
      ],
      "resources": ["space:default"]
    }]
  }' && echo
```

A few notes on the role definition:

- **`cluster: ["monitor"]`** is the minimum cluster-level privilege a logged-in Kibana session needs to call `_cluster/health`, `_nodes`, etc.
- **Indices `read` + `view_index_metadata`** lets Discover list fields and query documents, but never write, delete, or alter mappings.
- **`applications.application: "kibana-.kibana"`**: the registered name of the Kibana application in ES's security model. `feature_<name>.read` privileges follow the Kibana feature taxonomy — each major area of the UI has its own.
- **`resources: ["space:default"]`** scopes the privileges to the default Kibana space only. If you create more spaces later, the role does not see them.

> [!TIP]
> Defining Kibana feature privileges via the **Elasticsearch security API** (the `applications` field above) avoids having to talk to the Kibana role API, which requires the basePath prefix and is awkward to script.

## Step 3 — create the `anonymous` user

```bash
ANON=$(grep '^ANONYMOUS_PASSWORD=' .env | cut -d= -f2-)

curl -sX PUT -u "elastic:$ELASTIC" \
  -H "Content-Type: application/json" \
  http://localhost:9200/_security/user/anonymous \
  -d "{
    \"password\": \"$ANON\",
    \"roles\": [\"log_viewer\"],
    \"full_name\": \"Public anonymous viewer\"
  }" && echo

# Verify
curl -s -o /dev/null -w "anonymous auth: HTTP %{http_code}\n" \
  -u "anonymous:$ANON" http://localhost:9200/_cluster/health
# anonymous auth: HTTP 200
```

> [!IMPORTANT]
> The user is literally named `anonymous`, but it is still an ES user with a real password. Kibana will log itself in as this user on behalf of the visitor — the visitor never sees the credential. "Anonymous" describes the visitor's experience, not the ES backend.

## Step 4 — Kibana auth providers in `config/kibana.yml`

The provider configuration cannot be expressed through environment variables in Kibana 8.x. The `XPACK_SECURITY_AUTHC_PROVIDERS_<TYPE>_<NAME>_*` env-var flattening does not handle the nested custom provider names (`anonymous1`, `basic1`) correctly — Kibana sees them as flat keys and marks them as "not enabled" at startup. The canonical fix is a mounted `kibana.yml`.

Create `/opt/observability-logs/config/kibana.yml`:

```yaml
# /opt/observability-logs/config/kibana.yml

# Bind on all interfaces. We *must* set this explicitly because the volume mount
# below replaces the official image's default kibana.yml, which had server.host
# set to 0.0.0.0. Without it, Kibana binds to localhost inside the container
# and Docker's port-mapping can't reach it — the container would appear healthy
# (the internal healthcheck on localhost works) but unreachable from outside.
server.host: "0.0.0.0"

# Authentication providers — native YAML structure.
# In Kibana 8.x the XPACK_SECURITY_AUTHC_PROVIDERS_<TYPE>_<NAME>_* environment
# variables are not interpreted correctly for custom nested provider names
# (e.g. "anonymous1", "basic1") — the provider is marked as "not enabled" at
# startup. The canonical solution is to declare providers in kibana.yml.
xpack.security.authc.providers:
  anonymous.anonymous1:
    order: 0
    description: "Public anonymous viewer"
    credentials:
      username: "anonymous"
      password: "${ANONYMOUS_PASSWORD}"
  basic.basic1:
    order: 1
    description: "Login with credentials"
```

```bash
sudo mkdir -p /opt/observability-logs/config
sudo tee /opt/observability-logs/config/kibana.yml > /dev/null <<'EOF'
<paste the YAML above here>
EOF
sudo chmod 644 /opt/observability-logs/config/kibana.yml
```

A few details:

- **`order: 0`** wins over **`order: 1`**: when a visitor hits `/logs/`, Kibana tries the anonymous provider first. If that succeeds, the visitor is logged in without seeing any form.
- **`basic.basic1`** stays on as a fallback at order 1. The Kibana login screen offers it as a "Login with credentials" option — used by the admin to log in as `elastic` for write access.
- **`${ANONYMOUS_PASSWORD}`** is interpolated by Kibana itself at startup from its container environment. We'll inject that variable through the compose file in the next step.

> [!WARNING]
> Whenever you mount a file at `/usr/share/kibana/config/kibana.yml`, you **replace** the official image's default kibana.yml. The default ships with sensible bindings (`server.host: "0.0.0.0"`, ES host pointing at `elasticsearch:9200`, etc.) that disappear the moment the mount takes over. Always include at least `server.host: "0.0.0.0"` in your custom file, or the container becomes unreachable from outside (and the symptom is misleading: Docker still reports the container as "healthy", because the in-container healthcheck on `localhost:5601` works).

## Step 5 — wire the password into the container, mount the YAML

Two changes to the `kibana` service in `/opt/observability-logs/docker-compose.yml`:

1. Add `ANONYMOUS_PASSWORD` to the `environment:` block so Kibana can interpolate `${ANONYMOUS_PASSWORD}` in `kibana.yml`.
2. Mount `kibana.yml` into the container.

The relevant lines look like this:

```yaml
  kibana:
    # ... unchanged image / depends_on / user / ports / healthcheck ...
    environment:
      - ELASTICSEARCH_HOSTS=http://elasticsearch:9200
      - ELASTICSEARCH_USERNAME=kibana_system
      - ELASTICSEARCH_PASSWORD=${KIBANA_SYSTEM_PASSWORD}
      - SERVER_BASEPATH=/logs
      - SERVER_REWRITEBASEPATH=true
      - SERVER_PUBLICBASEURL=https://farnetiandrea.it/logs
      - TELEMETRY_OPTIN=false
      - XPACK_ENCRYPTEDSAVEDOBJECTS_ENCRYPTIONKEY=${KIBANA_ENCRYPTION_KEY}
      # NEW — passthrough so kibana.yml can interpolate it
      - ANONYMOUS_PASSWORD=${ANONYMOUS_PASSWORD}
    volumes:
      - /opt/observability-logs/kibana-data:/usr/share/kibana/data
      # NEW — mount the custom config
      - /opt/observability-logs/config/kibana.yml:/usr/share/kibana/config/kibana.yml:ro
```

> [!IMPORTANT]
> **No `XPACK_SECURITY_AUTHC_PROVIDERS_*` env vars.** If you had any from a previous attempt, remove them — env vars override the YAML and would silently re-introduce the "not enabled" problem.

## Step 6 — restart

A simple `restart` is not enough — the new env var requires a recreation:

```bash
cd /opt/observability-logs
sudo docker compose down
sudo docker compose up -d
```

Wait ~90 s, then watch the logs:

```bash
sudo docker compose logs -f kibana
# Expect: [INFO ][status] Kibana is now available
```

## Step 7 — verify the providers are active

Check from inside the container that the YAML is mounted and the provider is enabled:

```bash
sudo docker compose exec kibana cat /usr/share/kibana/config/kibana.yml
```

Then test from a fresh browser (incognito + hard reload) at `https://farnetiandrea.it/logs`:

- Expected: the **Welcome to Elastic** chooser appears with two options — **Public anonymous viewer** and **Login with credentials**. Click the first; you land on Discover with no login form.
- If the anonymous option is missing and you only see the basic login form, the provider didn't load. Check `docker compose logs kibana | grep -i "provider\|authenticator"` — a `Login attempt for provider with name basic1 is detected, but it isn't enabled` line means the YAML mount didn't take effect (most often because the env vars are still set and overriding it).

## Step 8 — confirm read-only enforcement

Worth proving directly that the role does its job:

```bash
ANON=$(grep '^ANONYMOUS_PASSWORD=' /opt/observability-logs/.env | cut -d= -f2-)
curl -sX DELETE -u "anonymous:$ANON" \
  -o /dev/null -w "delete-index: HTTP %{http_code}\n" \
  http://localhost:9200/logs-2026.01.01
# delete-index: HTTP 403
```

ES refuses the write because the `log_viewer` role does not grant any of the `manage` / `delete` / `write` privileges. The visitor in the browser hits the same wall the moment they try anything destructive.

## What the visitor experiences vs what the admin experiences

| Path                                | What happens                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| Visitor opens `farnetiandrea.it/logs` | Lands on the provider chooser, picks "Public anonymous viewer", goes straight to Discover.    |
| Admin opens `farnetiandrea.it/logs`   | Same chooser. Picks "Login with credentials", enters `elastic` + the password, gets full UI.  |
| Visitor tries to save a search        | UI surfaces a 403 from ES; the action fails clearly with no data loss.                        |
| Admin saves a search                  | Works normally — `elastic` has `superuser` and can write to `.kibana_*`.                      |
## Step 9 — Hardening: redact at the Logstash layer

The anonymous role only restricts *what fields exist in Kibana terms* (e.g. only Discover/Dashboard/Visualize, no management). It does **not** redact the *content* of the fields. If your raw events contain client IPs, JWT tokens, email addresses, or app-internal stack traces, the anonymous user can see them all by clicking into any document in Discover.

Two ways to deal with this on a Basic license (Field-Level Security would solve it elegantly but needs Platinum):

1. **Redact at ingest** — Logstash strips and anonymizes sensitive patterns before events ever reach Elasticsearch. Simple, low-overhead, applies to all consumers uniformly.
2. **Dual-index split** — Logstash writes to `logs-internal-*` (full data, admin-only) and `logs-public-*` (sanitized, anonymous-readable). More flexible but doubles the storage and adds pipeline complexity.

This page walks through option 1.

### What the redaction does

A `filter {}` block on each Logstash worker, applied to every event in flight:

1. **`gsub` regex on `event.original` and `message`** — replaces:
   - IPv4 addresses with their `/24` form (`1.2.3.42` → `1.2.3.0`). Enough to keep geographic / netblock context, not enough to identify a single visitor.
   - JWTs (the `eyJ...` prefix is unmistakable) → `[JWT]`.
   - Email addresses → `[EMAIL]`.
   - `Bearer <anything>` headers → `Bearer [TOKEN]`.
   - AWS access key IDs (`AKIA<16chars>`) → `[AWS_KEY]`.
2. **`remove_field`** — drops fields that have no value for a public viewer but reveal infrastructure:
   - `host.ip`, `host.mac`, `host.id`, `host.architecture`, `host.containerized`, `host.os.kernel`
   - `agent.id`, `agent.ephemeral_id`
   - `log.file.device_id`, `log.file.inode`, `log.file.path`

### The filter block

Add this between the `input {}` and `output {}` blocks in `/opt/observability-logs/pipeline/main.conf` on **every** Logstash worker:

```ruby
filter {
  # 1) Anonymize patterns in the raw event text
  if [event][original] {
    mutate {
      gsub => [
        "[event][original]", "\b(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}\b", "\1.0",
        "[event][original]", "eyJ[A-Za-z0-9_=-]+\.[A-Za-z0-9_=-]+\.[A-Za-z0-9_=-]+", "[JWT]",
        "[event][original]", "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "[EMAIL]",
        "[event][original]", "(?i)bearer\s+[A-Za-z0-9._=-]+", "Bearer [TOKEN]",
        "[event][original]", "AKIA[0-9A-Z]{16}", "[AWS_KEY]"
      ]
    }
  }

  if [message] {
    mutate {
      gsub => [
        "message", "\b(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}\b", "\1.0",
        "message", "eyJ[A-Za-z0-9_=-]+\.[A-Za-z0-9_=-]+\.[A-Za-z0-9_=-]+", "[JWT]",
        "message", "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "[EMAIL]",
        "message", "(?i)bearer\s+[A-Za-z0-9._=-]+", "Bearer [TOKEN]",
        "message", "AKIA[0-9A-Z]{16}", "[AWS_KEY]"
      ]
    }
  }

  # 2) Drop topology / fleet-revealing fields
  mutate {
    remove_field => [
      "[host][ip]",
      "[host][mac]",
      "[host][id]",
      "[host][architecture]",
      "[host][containerized]",
      "[host][os][kernel]",
      "[agent][ephemeral_id]",
      "[agent][id]",
      "[log][file][device_id]",
      "[log][file][inode]",
      "[log][file][path]"
    ]
  }
}
```

### Restart

Apply on each worker with `down + up -d`, not `restart`. The Beats input on `:5044` doesn't release the socket within the default 10-second grace, so `docker compose restart` consistently fails with `Address already in use` on the second startup:

```bash
cd /opt/observability-logs
sudo docker compose down
sudo docker compose up -d

# Wait ~60s, then verify
sleep 60
sudo docker compose logs --tail=20 logstash | grep -iE "pipeline|started"
```

You want to see `Pipeline started {"pipeline.id"=>"main"}` and `Starting input listener {:address=>"0.0.0.0:5044"}` with no errors.

### Verify on Elasticsearch

From the VPS:

```bash
ELASTIC=$(sudo grep '^ELASTIC_PASSWORD=' /opt/observability-logs/.env | cut -d= -f2-)

# Sneak peek of a recent event
curl -s -u "elastic:$ELASTIC" \
  "http://localhost:9200/logs-*/_search?size=1&sort=@timestamp:desc" \
  -H "Content-Type: application/json" \
  -d '{"query":{"range":{"@timestamp":{"gte":"now-2m"}}}}' \
  | python3 -m json.tool | head -50
```

Check that the dropped fields (`host.ip`, `log.file.path`, ...) are absent and that any IPs in `event.original` end in `.0`.

### Wipe pre-redaction history (optional)

The redaction only affects events ingested *after* the restart. Older indices still contain the un-redacted versions. If you want a clean slate:

```bash
ELASTIC=$(sudo grep '^ELASTIC_PASSWORD=' /opt/observability-logs/.env | cut -d= -f2-)
curl -sX POST -u "elastic:$ELASTIC" \
  "http://localhost:9200/logs-*/_delete_by_query?conflicts=proceed" \
  -H "Content-Type: application/json" \
  -d '{"query": {"match_all": {}}}' | python3 -m json.tool
```

New events will repopulate the index pattern within seconds.

### Trade-offs

| Aspect                    | This approach (Logstash redact)                       | Alternative: dual-index split                                                        |
| ------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Admin sees raw data?      | **No** — same redacted view everyone else gets        | Yes — `logs-internal-*` is admin-only with full data                                  |
| Storage                   | 1× (just one index per day)                            | 2× (two indices per day, raw + sanitized)                                            |
| Pipeline complexity       | One `filter {}` block, easy to reason about          | Two `output {}` blocks with conditionals, more moving parts                          |
| Public viewer trust       | Implicit — what's in ES is already safe              | Implicit — role only grants `read` on `logs-public-*`                                |
| Forensics on raw events   | Source files on the VPS (`tail`, `journalctl`)        | `logs-internal-*` via admin login                                                    |
## Where to go next

- Once Filebeat is shipping events ([[observability/logs/filebeat/filebeat-setup|filebeat-setup]]), the `logs-*` data view created in [[observability/logs/kibana/kibana-setup#Step 7 — create a Data View|kibana-setup]] will show live data to the anonymous viewer.
- Build a public dashboard and pin it in the navigation. The visitor will see it the moment they enter — no further auth.
- (Optional) tighten the role further: grant `feature_dashboard.read` only and drop `feature_discover.read` if you want the public to consume curated dashboards only, not free-text search across indices.
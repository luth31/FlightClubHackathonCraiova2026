# FlyLeaf: Craiova and Sibiu over Tailscale

Craiova is the main airport and owns the demonstration corpus. Sibiu is the partner airport. Airport names are real; the people, contracts and operational scenarios remain synthetic demonstration data.

The opt-in `compose.tailscale.yaml` overlay uses project **`flyleaf-presentation`**, separate databases/identity volumes, and separate loopback ports. The normal `./scripts/start-demo.sh`, `./scripts/dev.sh`, root `.env`, and local login flow remain unchanged apart from the airport names. Both deployments can run simultaneously. Presentation fixtures start with `FlyLeaf2026!`; existing local passwords stay unchanged.

| Development path | Command | Application URLs | Identity URLs / ports |
|---|---|---|---|
| Native local development | `./scripts/dev.sh` | Vite on `http://127.0.0.1:5173`, API on port 8000 | Existing local demo login |
| Local Docker development | `./scripts/start-demo.sh` | `http://127.0.0.1:8080` and `:8081` | Local Keycloak on ports 8180 / 8181 |
| Optional presentation | `./scripts/start-tailscale.sh` | Tailscale HTTPS service origins; upstream ports 18080 / 18081 | Same HTTPS origin under `/auth`; maintenance ports 18180 / 18181 |

Neither normal development path requires Tailscale. Both local and presentation deployments use `GOOGLE_MAPS_API_KEY` from the root `.env` for photorealistic maps when configured; without a key they use the bundled model. Presentation origins belong in `.env.tailscale`; do not replace developers' root `.env` with that file.

In the presentation deployment, each airport has one HTTPS origin for its website, API, PDFs, and Keycloak login. Tailscale terminates HTTPS and forwards to the airport's loopback web port. Nginx routes `/api/` to FastAPI and `/auth/realms/<airport>/` plus `/auth/resources/` to Keycloak. Administration and `/api/exchange/` remain unavailable through the web entry point. The two gateways continue their separate mutually authenticated Docker connection.

## 1. Define the Services

Use these entries in the **Define a Service** form from the screenshot:

| Field | Main airport | Partner airport |
|---|---|---|
| Service name | `aeroport-craiova` | `aeroport-sibiu` |
| Display name | `FlyLeaf · Craiova` | `FlyLeaf · Sibiu` |
| Description | `FlyLeaf Craiova: documente, API si autentificare` | `FlyLeaf Sibiu: documente, API si autentificare` |
| Ports | **`tcp:443`** | **`tcp:443`** |
| Service tags | Optional; may be left blank | Optional; may be left blank |
| Local forwarding target | `http://127.0.0.1:18080` | `http://127.0.0.1:18081` |

The port in this form is the port clients connect to. The local upstream port belongs in the Serve command. See [Tailscale Services](https://tailscale.com/docs/features/tailscale-services).

## 2. Permit and approve the host

Keep the existing Mac's Tailscale identity unchanged. The inspected Mac is user-owned and untagged. Assigning a tag replaces its user identity, so `autogroup:self` SSH rules no longer cover it and its user-based permissions no longer apply. Defining a tag under `tagOwners` alone does not tag the Mac. See [Tailscale tag behavior](https://tailscale.com/docs/features/tags) and [policy identity selectors](https://tailscale.com/docs/reference/syntax/policy-file).

For the two named Services, use **one dedicated tagged Tailscale instance**—for example a container on this same physical Docker host—with `tag:flyleaf-host`. That one instance can advertise both `svc:aeroport-craiova` and `svc:aeroport-sibiu`. Keep the personal Mac client separate; two physical hosts or airport-specific host tags are unnecessary. Tailscale Services requires the advertising instance to use a tag-based identity. [Service host requirements](https://tailscale.com/docs/features/tailscale-services).

`deploy/tailscale-policy.hujson` is a review copy of the policy supplied by the user, with the existing member grant, SSH check rule and both tag owners preserved. Its only additions are an explicit HTTPS grant for the two Services and their `autoApprovers.services` entries. If editing the live policy, merge only those additions; preserve any other entries that have since been added. No extra broad outbound grant or SSH rule is needed for a dedicated relay that proxies to apps through Docker networking.

The dedicated instance is a proposed deployment topology, not provisioned by `start-tailscale.sh`. It needs its own Tailscale state and authentication, plus connectivity to both presentation web upstreams. If using a container, proxy to the web containers over their Docker networks; `127.0.0.1` inside a container is not the Mac. Do not run the host-tagging step on the personal Mac to work around missing relay setup.

Enable MagicDNS and HTTPS certificates in tailnet DNS settings. With the auto-approval entries, the dedicated instance can advertise both Services without individual host approval; otherwise approve it manually on each Service page. No live policy, tag or SSH changes are applied by the application launchers.

## 3. Configure the application origins

Keep presentation settings in **`.env.tailscale`**, separate from the existing root `.env`:

```bash
cp deploy/tailscale.env.example .env.tailscale
```

```dotenv
FLYLEAF_CRAIOVA_PUBLIC_URL=https://aeroport-craiova.taileceb7a.ts.net
FLYLEAF_SIBIU_PUBLIC_URL=https://aeroport-sibiu.taileceb7a.ts.net
```

Do not add trailing slashes. The suffix above comes from the provided screenshot and connected host. The overlay enables Secure cookies and the exact HTTPS origins automatically. Local Compose does not read `.env.tailscale`.

Start the separate presentation deployment:

```bash
./scripts/start-tailscale.sh
```

The launcher reads existing secrets from `.env` and the presentation origins from `.env.tailscale`, builds the app and starts **`flyleaf-presentation`**. It pins that project name explicitly, so a developer's `COMPOSE_PROJECT_NAME` cannot redirect the launcher into their local stack. It does not advertise Tailscale Services or modify tailnet policy. It creates its own fresh corpus and identity state. Local developer ports 8080/8081 and login ports 8180/8181 remain available; the presentation upstream ports are **18080/18081**, with loopback identity maintenance ports 18180/18181.

Application and Keycloak volumes use separate `flyleaf_…` and `flyleaf-presentation_…` prefixes. The launchers reuse host-generated exchange certificates/tokens under `.runtime/exchange` and optional model-provider credentials from `.env`; those shared inputs do not merge airport documents, sessions or identity databases.

For Google Photorealistic 3D mode in both environments, set `GOOGLE_MAPS_API_KEY` in the ignored root `.env`. Native development reads that file, local Compose injects the key into both airport APIs, and the presentation launcher inherits it. An optional nonempty value in `.env.tailscale` can use a different presentation key; an explicitly blank override disables Google only there. Restrict the browser key to Map Tiles API and all intended local and presentation web origins, including `http://localhost:5173/*`, `http://127.0.0.1:5173/*`, `http://127.0.0.1:8080/*`, `http://127.0.0.1:8081/*`, and both Tailscale HTTPS hostnames. Availability depends on the Google project and local coverage; see [3D sources and content handling](AIRPORT_3D_SOURCES.md).

If you later change presentation hostnames, reconcile the existing presentation realms:

```bash
backend/.venv/bin/python scripts/configure_identity.py --tailscale
```

This stops only the selected presentation project, backs up its four volumes, updates exact callback/logout URLs and matching persisted issuer links, retains account IDs/passwords, removes temporary configuration access, and restarts. A plain Compose restart does not update an existing imported Keycloak realm. The default invocation without `--tailscale` targets local development only and is not part of presentation setup.

An existing local installation still named Dunărea/Carpați should run `backend/.venv/bin/python scripts/migrate_airports.py` once to rename it. Original volumes and immutable signed/stored PDF versions remain available. This migration is separate from the presentation launcher.

Derived settings (already wired in Compose):

| Setting | Craiova | Sibiu |
|---|---|---|
| Tenant / realm | `craiova` | `sibiu` |
| Public issuer | `https://aeroport-craiova.taileceb7a.ts.net/auth/realms/craiova` | `https://aeroport-sibiu.taileceb7a.ts.net/auth/realms/sibiu` |
| Internal issuer transport | `http://craiova-identity:8080/auth/realms/craiova` | `http://sibiu-identity:8080/auth/realms/sibiu` |
| Callback | `https://aeroport-craiova.taileceb7a.ts.net/api/auth/oidc/callback` | `https://aeroport-sibiu.taileceb7a.ts.net/api/auth/oidc/callback` |
| Logout return | `https://aeroport-craiova.taileceb7a.ts.net/` | `https://aeroport-sibiu.taileceb7a.ts.net/` |

The web client remains `flyleaf-web`, with PKCE S256 and exact redirect URIs. Cookies are HttpOnly and Secure in HTTPS mode: the temporary OIDC cookie uses SameSite=Lax, while the application session uses SameSite=Strict. Application cookies are host-only and include the airport ID in their names, separating the airport sessions; the presentation HTTPS hosts also separate them from localhost sessions. The backend uses each configured public origin in its CORS/Origin allowlist, while provider token traffic stays inside Docker. Proxy headers come from the configured origin. See [Keycloak reverse proxy configuration](https://www.keycloak.org/server/reverseproxy).

## 4. Advertise both Services

Run on the **dedicated tagged Tailscale instance**, not the personal Mac client. These loopback targets apply only when the instance can reach the presentation upstreams at those local addresses. For a Docker relay, use its Docker-reachable web targets instead (for example `http://craiova-web:80` and `http://sibiu-web:80` on attached presentation web networks):

```bash
tailscale serve --bg --service=svc:aeroport-craiova --https=443 http://127.0.0.1:18080
tailscale serve --bg --service=svc:aeroport-sibiu --https=443 http://127.0.0.1:18081
tailscale serve status
```

These use Tailscale Serve inside the tailnet. No Funnel, public port forwarding, database exposure, or separate service for the API/identity maintenance ports is needed. The server must remain awake with Docker and Tailscale running. See the [Serve CLI reference](https://tailscale.com/docs/reference/tailscale-cli/serve).

## 5. Verify from another permitted tailnet device

```bash
curl --fail https://aeroport-craiova.taileceb7a.ts.net/api/health
curl --fail https://aeroport-sibiu.taileceb7a.ts.net/api/health
```

Expected airport IDs are `craiova` and `sibiu`. Open both URLs in a browser, sign in, open a PDF, use a normal authenticated action, and sign out. Login must remain on that airport's HTTPS hostname throughout; it must never send a remote browser to `127.0.0.1`. Verify a shared copy from Sibiu to exercise the unchanged gateway trust boundary.

App API routes live under `/api/` and require the normal airport session/roles. Tailscale access does not bypass application authorization. `/api/health` is a basic unauthenticated liveness check. The API's raw OpenAPI and Swagger routes are not exposed by this web proxy.

Local development always uses its existing localhost URLs. To stop the presentation stack without touching local development:

```bash
docker compose --project-name flyleaf-presentation -f compose.yaml -f compose.tailscale.yaml --env-file .env.tailscale stop
```

Disable each advertised endpoint with `tailscale serve --service=svc:aeroport-craiova --https=443 off` (and the equivalent for Sibiu). Do not remove persistent volumes to switch deployments.

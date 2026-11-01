# FlyLeaf over Tailscale: the same application and data

Tailscale is an additional entrance to the **`flyleaf`** Docker installation. For each airport, local and HTTPS access use the **same API, database, documents, Keycloak realm and user accounts**. Craiova and Sibiu still have their own airport databases and permissions. No database synchronization or duplicate corpus is involved.

| Access | Command | Addresses |
|---|---|---|
| Native development | `./scripts/dev.sh` | Existing Vite/API and local login; unchanged |
| Local Docker | `./scripts/start-demo.sh` | Applications 8080/8081, Keycloak 8180/8181 |
| Local Docker + Tailscale | `./scripts/start-tailscale.sh` | All local addresses above, plus HTTPS entrances via 18080/18081 |

## Enable both entrances

Keep provider keys (including `GOOGLE_MAPS_API_KEY` and `OPENAI_API_KEY`) in the root `.env`. Both entrances use the same API configuration. Only the two HTTPS origins belong in `.env.tailscale`. The launcher extracts these into `.runtime/tailscale.origins.env`; any legacy API-key entries in `.env.tailscale` are ignored so they cannot change the shared API configuration:

```bash
cp deploy/tailscale.env.example .env.tailscale
```

```dotenv
FLYLEAF_CRAIOVA_PUBLIC_URL=https://aeroport-craiova.taileceb7a.ts.net
FLYLEAF_SIBIU_PUBLIC_URL=https://aeroport-sibiu.taileceb7a.ts.net
```

Use your tailnet's actual Service hostnames, without trailing slashes. Then run:

```bash
./scripts/start-tailscale.sh
```

The launcher pins project `flyleaf`, keeps its existing state/identity volumes, and adds `craiova-tailweb` and `sibiu-tailweb`. It registers local and remote callbacks on the **existing** browser clients. Configuration briefly stops the shared stack, backs up its four persistent volumes, updates callback/logout origins, removes temporary bootstrap credentials and restarts. User IDs, passwords, documents and canonical identity issuers are retained. It does not regenerate PDFs.

Use this same launcher for future rebuilds while you want both entrances enabled. Running `start-demo.sh` applies the local-only configuration again. Native development remains independent and does not need Tailscale; this change shares the existing Docker databases, not a native developer's SQLite checkout.

If an older `flyleaf-presentation` project exists, stop it first so it releases ports 18080/18081:

```bash
docker stop $(docker ps -q --filter label=com.docker.compose.project=flyleaf-presentation)
```

Skip that command when no such containers are running. Its volumes are left intact as historical data; they are **not** merged into the canonical `flyleaf` databases or deleted. Preserve/export any unique records before retiring those volumes.

## One Tailscale host for both airports

One dedicated Tailscale instance tagged `tag:flyleaf-host` can advertise both `svc:aeroport-craiova` and `svc:aeroport-sibiu`. Keep the personal Mac client's ownership/SSH configuration as it is. The launcher does not change tailnet policies, tags, SSH access or Serve configuration.

Existing unrestricted member access can remain. The supplied `deploy/tailscale-policy.hujson` preserves the original member grant, SSH check rule and tag owners; only merge the Service-specific additions if needed. See [Tailscale Services](https://tailscale.com/docs/features/tailscale-services).

Enable MagicDNS and HTTPS certificates, then run on the dedicated instance that can reach both upstream ports:

```bash
tailscale serve --bg --service=svc:aeroport-craiova --https=443 http://127.0.0.1:18080
tailscale serve --bg --service=svc:aeroport-sibiu --https=443 http://127.0.0.1:18081
tailscale serve status
```

For a relay container, loopback is that container, not the host. Attach it to the corresponding FlyLeaf web networks and target `http://craiova-tailweb:80` / `http://sibiu-tailweb:80`. Both Services can use the same relay. No Funnel or public port forwarding is required.

## Login and data consistency

Local browser identity stays on `http://127.0.0.1:8180/realms/craiova` (8181/Sibiu). Remote identity stays on its airport's HTTPS hostname at `/realms/craiova` or `/realms/sibiu`, with the callback at `/api/auth/oidc/callback`.

The API accepts only explicitly configured origins. Each login transaction pins its issuer, callback, PKCE verifier and browser cookie; tokens from another origin cannot complete it. Alternate issuers resolve to the same canonical local account identity. Internal token traffic still reaches the same Keycloak container. Remote cookies are Secure and HttpOnly; local HTTP cookies retain their existing behavior. Cookies are host-only, so users sign in separately at each entrance, while their data and permissions are shared.

Keycloak resolves browser URLs from forwarding headers only when this overlay is enabled. The remote proxy supplies those headers from configuration, never incoming client headers; administration, other realms and the exchange endpoint remain blocked. See [Keycloak hostname configuration](https://www.keycloak.org/server/hostname) and [reverse proxy configuration](https://www.keycloak.org/server/reverseproxy).

Google browser-key restrictions must permit local addresses and both HTTPS hostnames. The key itself is shared through `.env`; see [map sources and usage](AIRPORT_3D_SOURCES.md).

## Verify or disable remote access

From another permitted tailnet device:

```bash
curl --fail https://aeroport-craiova.taileceb7a.ts.net/api/health
curl --fail https://aeroport-sibiu.taileceb7a.ts.net/api/health
```

Sign in locally and remotely as the same user, compare document IDs/counts, and confirm a change made through one entrance appears through the other. Login and logout must stay on the selected entrance. Airport boundaries remain enforced.

To disable remote access without stopping the shared app, disable only the Serve endpoints:

```bash
tailscale serve --service=svc:aeroport-craiova --https=443 off
tailscale serve --service=svc:aeroport-sibiu --https=443 off
```

Do not run `compose down` to disable Tailscale: the stack is shared. Never remove volumes to switch access methods.

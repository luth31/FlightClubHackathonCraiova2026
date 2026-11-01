# FlyLeaf branding upgrade

The product is **FlyLeaf**, built by **Flight Club**. The current logo artwork is intentionally retained.

## Configuration

All application environment variables now use `FLYLEAF_`. Keep the values from the previous configuration when renaming keys in ignored `.env` files. The standard `OPENAI_API_KEY` variable remains supported. New default SQLite files are named `flyleaf.db`, and the Compose project is `flyleaf`.

Before upgrading a populated installation, stop its services and back up both application state volumes and both Keycloak identity volumes. Keep the previous volumes for rollback. Either retain the existing Compose project and explicitly configure its database path, or copy all four volumes to the new project and migrate each SQLite file to its new basename. Do not start against empty replacement volumes or delete volumes to apply branding. Preserve storage paths, document hashes, account IDs, signing keys, and identity subjects.

## Identity provider

Keycloak's startup realm importer skips realms that already exist. Apply the configuration to each existing realm through its administrator interface/API before restarting the backend:

1. Change the realm display name to FlyLeaf and select the `flyleaf` login theme.
2. Rename the existing browser client to `flyleaf-web` and its provisioning client to `flyleaf-provisioner`. Preserve their internal IDs, service-account identity, role grants, exact redirect/logout URIs, and PKCE requirements. Configure the provisioning secret to match that airport's `FLYLEAF_*_PROVISIONING_SECRET`.
3. Add the admin-only profile attributes `flyleaf_user_id` and `flyleaf_airport_id`. Copy existing ownership-marker values to these keys before removing their previous names. Preserve other user attributes and credentials.
4. Confirm the provisioning service account still has only the required `realm-management/manage-users` grant and client scope mapping. See [user management](USER_MANAGEMENT.md).

The six demo subject UUIDs per airport are fixed in `backend/app/identity/service.py` and match the realm fixtures. They do not change with the brand. Persisted employee identity links continue to use the same issuer and subject.

Existing provider passwords are preserved. Fresh fixtures use `FlyLeaf2026!`. The application cookies and browser state keys now use `flyleaf`, so users sign in again after the upgrade.

## Documents and verification

The generator and all 148 checked-in synthetic PDFs use FlyLeaf. Regenerate them with `backend/.venv/bin/python scripts/generate_corpus.py`. Stored document versions, signed PDFs, issued certificates, and audit evidence remain historical records; do not rewrite them to change branding. Newly generated exports and certificates use FlyLeaf.

After restarting, verify both airport login flows, workspace labels, the assistant, CSV downloads, and inter-airport access. A repository text scan should find no previous product name in tracked source, configuration, or documentation. Keep the existing logo SVG and inline artwork unchanged.

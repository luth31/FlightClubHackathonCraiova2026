# Employee accounts and authority

The demo groups work into four departments under the director. See [the hierarchy and access matrix](DEMO_ACCESS.md). Department heads report to the director; ordinary employee coordinators belong to the employee's department. The launcher adds the new technical-head identity to existing realms without resetting existing accounts.

HR enters **Prenume**, optional **Al doilea prenume**, and **Nume de familie**, then selects a department, function and optional coordinator. The name parts are stored separately and combined for display. **Generează emailul** suggests `<first-name initial>.<surname>@arm.ro` (for example, `Ștefan` / `Mihai` / `Ionescu` → `s.ionescu@arm.ro`). Middle names do not affect the suggestion; surname spaces become hyphens, existing hyphens are preserved and diacritics removed. HR can edit the suggested address or enter one directly to avoid duplicates or inappropriate wording. Name changes do not overwrite the entered email; clicking the button again replaces it with a new suggestion. The backend validates the submitted address and reports duplicates for HR to resolve. Existing account emails stay unchanged when profiles are renamed.

Legacy name parts are initialized from the first and last words, with intervening words as middle names; existing display names remain unchanged during migration. HR can correct inferred boundaries when editing a profile. Keycloak receives first and middle names together as `firstName` and the complete surname as `lastName` during provisioning.

Function choices appear below the department and include the department's catalog and existing positions. A function title does not grant head or signer permissions. Coordinators must be active colleagues in the same department. Department changes reset the coordinator; moving a coordinator also clears reporting links in the old department. The migration removes legacy links between different departments.

HR uses **Echipă → Adaugă angajat** to create an employee with a primary department, job title, reporting manager and ordinary employee/technician access. Every employee can submit leave requests. HR cannot grant admin, director, finance, HR, reviewer or signer roles through onboarding. Existing privileged demo accounts remain available.

In Docker, FlyLeaf creates the Keycloak account and links its stable issuer/subject identity to the local profile. A failed creation remains visible as **Activare de reîncercat**; **Gestionează angajatul → Reîncearcă activarea** retries without duplicating the identity. After an interrupted request, wait two minutes before retrying a processing account.

Keycloak login usernames use the normalized email local part: `d.voicu@arm.ro` → `d.voicu`. Email and login username collisions are rejected within an airport, including equal local parts on different email domains. Renaming an existing Keycloak username preserves its stable identity and password.

When upgrading an existing realm to email-based usernames, run `docker compose exec -T craiova-api python -m app.identity.sync_usernames` and the corresponding command for `sibiu-api` after rebuilding and configuring provisioning. The idempotent command verifies every bound identity, renames legacy usernames, records changes, and reports collisions for resolution. It preserves passwords, identity subjects and permissions. Provisioning retries also reconcile legacy usernames before preparing credentials.

For an active Keycloak account, HR can use **Gestionează angajatul → Copiază linkul de conectare**. The same link appears after onboarding. It opens the application's OIDC login route with the username prefilled; the employee must still enter their password and complete any required first-login actions. The link is reusable, contains no password or authentication token, and requires no SMTP. Creating a login link does not reset credentials. Its configured host must be reachable from the employee's computer; `127.0.0.1` links work only on the machine running the local demo.

Without SMTP, HR receives the username and a random temporary password once, for secure handoff. Keycloak requires password change at first login. With `FLYLEAF_KEYCLOAK_ACTIVATION_EMAIL=true` and realm SMTP configured, Keycloak emails activation actions instead. Email failures preserve the account and allow **Retrimite instrucțiunile**. This action resets initial credentials in the demo-password mode; previous passwords stop working. Local demo login shows a password field for newly created employees.

Resetting credentials for privileged accounts requires an administrator. The local login password field also accepts replacement passwords for seeded accounts; leaving it blank uses the documented seed password only for those presets. The sidebar's demonstration quick switch lists seed presets; newly created employees sign in through the password login page.

HR selects **Propune șef** on an active employee in the desired department. A different director reviews the request in **Aprobări → Numiri în departamente**, or **Echipă → Numiri**. The previous head remains responsible until the approved effective date. Appointments use FlyLeaf's configured reference date and activate on authenticated application access. A transferred/inactive candidate cannot receive the appointment. Each department accepts one pending/scheduled proposal at a time.

While a department has a pending or approved scheduled appointment, **Propune șef** is hidden on its employees' cards. HR, admin and director viewers see **Numire în aprobare** or **Numire aprobată · din [date]** on the proposed employee until activation; the active head shows **Șef de departament**. Scheduled appointment data remains private to those management roles. Rejected or cancelled proposals allow HR to propose again. The **Numiri** list retains decisions for history.

New document approval tasks prefer the appointed head. Outstanding approvals assigned to the previous head require explicit reassignment; completed decisions retain their authors. Review delegation never grants signing rights.

The director separately uses **Autoritate de semnare**, with a reason, to grant/revoke signing for another employee. Signing still requires document access and an assigned signature task. Certificates remain demonstration certificates. HR profile changes never edit permission roles; specialist access outside onboarding remains an administrator deployment responsibility.

HR/admin can edit profiles and deactivate/reactivate accounts. A head must be replaced before transfer. Deactivation blocks FlyLeaf immediately, removes sessions, revokes delegations and flags outstanding tasks. Failed Keycloak synchronization can be retried. No one can deactivate themselves or the final active director/admin.

## Keycloak configuration

Each realm includes a confidential `flyleaf-provisioner` client with `realm-management/manage-users` only. The browser client remains public and receives no service credentials. Compose passes a separate provisioning secret to each airport's backend and realm import. Defaults are fictional local-demo secrets; configure unique secrets in `.env` for a real installation.

Keycloak's startup importer skips existing realms. Repository JSON changes do **not** update already-imported realms. For an existing installation, use its Keycloak administrator console:

1. Create an OpenID Connect client `flyleaf-provisioner`, with client authentication and service-account roles enabled; disable interactive login flows.
2. Set its secret to that airport's `FLYLEAF_*_PROVISIONING_SECRET`, or its documented Compose demo default.
3. Give the service account `realm-management/manage-users`; disable full scope and ensure the `roles` default client scope is present. Its scope mapping must include `realm-management/manage-users` so the role appears in service tokens.
4. Enable **Realm settings → Login → Edit username**. In **Realm settings → User profile**, keep `username` visible to Admin/User but editable only by Admin, so the provisioning service can rename legacy accounts while employees cannot change their login independently. Add `flyleaf_user_id` and `flyleaf_airport_id` as optional, single-valued attributes. Give **Admin** permission to view/edit each attribute, with no user view/edit permission. Keycloak's default profile otherwise discards these ownership markers, preventing safe provisioning retries.
5. Rebuild/recreate API and web services to load this feature and backend configuration. Preserve existing database and identity volumes.

Fresh realms import the client automatically. Do not delete identity volumes to apply configuration. SMTP and delivery verification are separate setup steps. Seeded identities use their exact configured subject mappings; new users use persistent database identity links.

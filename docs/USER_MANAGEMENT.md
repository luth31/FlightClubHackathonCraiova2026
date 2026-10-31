# Employee accounts and authority

HR enters the employee's full name and selects a department, function and optional coordinator. The work email is generated automatically as `<first-name initial>.<surname>@arm.ro` (for example, `Ștefan Mihai Ionescu` → `s.ionescu@arm.ro`). The last word supplies the surname; hyphens are preserved and diacritics removed. Duplicate addresses are reported for HR to resolve. Existing account emails stay unchanged when profiles are renamed.

Function choices appear below the department and include the department's catalog and existing positions. A function title does not grant head or signer permissions. Coordinators must be active colleagues in the same department. Department changes reset the coordinator; moving a coordinator also clears reporting links in the old department. The migration removes legacy links between different departments.

HR uses **Echipă → Adaugă angajat** to create an employee with a primary department, job title, reporting manager and ordinary employee/technician access. Every employee can submit leave requests. HR cannot grant admin, director, finance, HR, reviewer or signer roles through onboarding. Existing privileged demo accounts remain available.

In Docker, AeroDesk creates the Keycloak account and links its stable issuer/subject identity to the local profile. A failed creation remains visible as **Activare de reîncercat**; **Gestionează angajatul → Reîncearcă activarea** retries without duplicating the identity. After an interrupted request, wait two minutes before retrying a processing account.

Without SMTP, HR receives the username and a random temporary password once, for secure handoff. Keycloak requires password change at first login. With `AERODESK_KEYCLOAK_ACTIVATION_EMAIL=true` and realm SMTP configured, Keycloak emails activation actions instead. Email failures preserve the account and allow **Retrimite instrucțiunile**. This action resets initial credentials in the demo-password mode; previous passwords stop working. Local demo login shows a password field for newly created employees.

Resetting credentials for privileged accounts requires an administrator. The local login password field also accepts replacement passwords for seeded accounts; leaving it blank uses the documented seed password only for those presets. The sidebar's demonstration quick switch lists seed presets; newly created employees sign in through the password login page.

HR selects **Propune șef** on an active employee in the desired department. A different director reviews the request in **Aprobări → Numiri în departamente**, or **Echipă → Numiri**. The previous head remains responsible until the approved effective date. Appointments use AeroDesk's configured reference date and activate on authenticated application access. A transferred/inactive candidate cannot receive the appointment. Each department accepts one pending/scheduled proposal at a time.

New document approval tasks prefer the appointed head. Outstanding approvals assigned to the previous head require explicit reassignment; completed decisions retain their authors. Review delegation never grants signing rights.

The director separately uses **Autoritate de semnare**, with a reason, to grant/revoke signing for another employee. Signing still requires document access and an assigned signature task. Certificates remain demonstration certificates. HR profile changes never edit permission roles; specialist access outside onboarding remains an administrator deployment responsibility.

HR/admin can edit profiles and deactivate/reactivate accounts. A head must be replaced before transfer. Deactivation blocks AeroDesk immediately, removes sessions, revokes delegations and flags outstanding tasks. Failed Keycloak synchronization can be retried. No one can deactivate themselves or the final active director/admin.

## Keycloak configuration

Each realm includes a confidential `aerodesk-provisioner` client with `realm-management/manage-users` only. The browser client remains public and receives no service credentials. Compose passes a separate provisioning secret to each airport's backend and realm import. Defaults are fictional local-demo secrets; configure unique secrets in `.env` for a real installation.

Keycloak's startup importer skips existing realms. Repository JSON changes do **not** update already-imported realms. For an existing installation, use its Keycloak administrator console:

1. Create an OpenID Connect client `aerodesk-provisioner`, with client authentication and service-account roles enabled; disable interactive login flows.
2. Set its secret to that airport's `AERODESK_*_PROVISIONING_SECRET`, or its documented Compose demo default.
3. Give the service account `realm-management/manage-users`; disable full scope and ensure the `roles` default client scope is present. Its scope mapping must include `realm-management/manage-users` so the role appears in service tokens.
4. In **Realm settings → User profile**, add `aerodesk_user_id` and `aerodesk_airport_id` as optional, single-valued attributes. Give **Admin** permission to view/edit each attribute, with no user view/edit permission. Keycloak's default profile otherwise discards these ownership markers, preventing safe provisioning retries.
5. Rebuild/recreate API and web services to load this feature and backend configuration. Preserve existing database and identity volumes.

Fresh realms import the client automatically. Do not delete identity volumes to apply configuration. SMTP and delivery verification are separate setup steps. Seeded identities use their exact configured subject mappings; new users use persistent database identity links.

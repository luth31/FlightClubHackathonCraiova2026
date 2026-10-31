# Demo organization and access

FlyLeaf has four functional departments below the airport director. This is a simplified fictional demonstration inspired by the [CNAB organization page](https://bucharestairports.ro/cnab/prezentare/organizare/), not CNAB's actual organization or staff.

| Department | Head | Team / specialist |
|---|---|---|
| Technical and Operations | Sorin Pavel (`technical-head`) | Andrei Neagu (`technician`) |
| Procurement and Finance | Mihai Dumitrescu (`manager`) | Radu Marinescu (`finance`) |
| Human Resources | Ioana Stancu (`hr`) | Employees added through onboarding |
| Compliance and Control | Elena Popa (`reviewer`) | Employees added through onboarding |

Ana Ionescu (`admin`) is the director above the four departments. The director is not a fifth functional department. All names and accounts are fictional.

Open **Echipă → Organigramă** to see the connected director, four departments, their heads and active employees. The chart uses `react-organizational-chart`; support staff outside those departments attach to their coordinator. Daniel Ilie Voicu appears directly below Ana Ionescu. Every active user appears once. Missing or inactive coordinators preserve known department membership; the chart identifies unavailable coordinators. The complete demo tree fits a 1440 px desktop viewport and scrolls within its panel on smaller screens, with keyboard access. Every signed-in airport user, including technicians, can view the chart. It contains basic organizational information and is read-only. HR/admin manage employees and reporting lines through the colleague directory; department-head appointments require the director's approval. The chart does not expose account roles, login links, leave reasons or additional document access.

Existing core department IDs remain stable. Historical document/PDF business areas such as Financiar and Operațiuni remain unchanged in storage; user-facing records and filters group them into four departments. Original files, immutable versions and earlier approvals are preserved. Retired department proposals remain in cancelled history. Existing Financial/Operations area heads retain authority only over their original area under the merged department head; neither silently replaces the other. Repeated startup preserves edited heads, reporting links, passwords and identity subjects.

## Menus and record visibility

| Account | Menu | Record scope |
|---|---|---|
| Director | Home, Operations, Documents, Contracts, Suppliers, Approvals, Team, Sharing, Audit | Organizational business records; no blanket personnel-file access |
| Technical head | Home, Operations, Documents, Contracts, Approvals, Team, Audit | Technical/operations records and approvals; no automatic signing or banking rights |
| Technician | Home, Operations, Documents, My tasks, Team | Published nonsensitive technical evidence and own technical drafts; basic directory and own leave |
| Procurement head | Home, Operations, Documents, Contracts, Suppliers, Approvals, Team, Audit | Procurement/finance records; supplier business profiles without bank history or banking workflows |
| Finance specialist | Home, Operations, Documents, Contracts, Suppliers, Approvals, Team | Financial records, published nonsensitive contracts, explicitly assigned work and supplier verification |
| HR | Home, Operations, Documents, Approvals, Team, Audit | Personnel records, onboarding and leave management; cannot self-grant privileged roles |
| Compliance head | Home, Operations, Documents, Contracts, Approvals, Team, Sharing, Audit | Compliance records, own cases, current assigned/delegated cases and authorized publishing |

Server-issued capabilities govern menus and direct navigation. Record access is checked for documents, downloads, versions, related records, search, dashboard counts, register exports, assistant sources, tasks and supplier associations. Completing or expiring an assignment does not create permanent access to another department's documents. Delegation does not grant signing or bank-approval authority. An explicitly appointed HR head has HR departmental authority; director and technical heads do not inherit it.

Bank history and review actions are limited to finance/director accounts. Procurement reads source contracts needed for procurement; information embedded in those PDFs remains part of the contract. Ordinary directory viewers receive basic contact, job and reporting information without other users' roles, provisioning links or unrelated leave reasons.

**Propune șef** appoints the head of a functional department. The candidate must already be active in one of the four departments. Users in Conducere, such as Daniel, have no functional department ID and cannot be proposed through this workflow. If the intended appointment is a functional department head, HR/admin first assign that department through **Gestionează angajatul**. A deputy or acting director belongs in Conducere; this workflow does not appoint that position or grant director authority. The interface explains the department-head prerequisite and prevents a null-department proposal. HR/admin propose appointments, and an independent director approves them.

## Start or upgrade

Run `./scripts/start-demo.sh`. It rebuilds the application, waits for both airports and checks the new account in both existing realms. Database and identity volumes are preserved.

Fresh realms use password `FlyLeaf2026!` for all seven demo accounts. When upgrading a previously imported realm, the launcher creates only the missing technical-head identity and displays its initial temporary password once; change it at first login. Repeated runs verify the identity without resetting its password.

For an already rebuilt stack:

```sh
docker compose exec -T craiova-api python -m app.people.sync_demo_organization
docker compose exec -T sibiu-api python -m app.people.sync_demo_organization
```

Keycloak startup import does not update existing realms. Do not delete identity volumes to apply the fixture. Existing provisioning-client configuration must be in place; see [user management](USER_MANAGEMENT.md).

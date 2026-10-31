# Application navigation contract

This contract applies to new features and changes to the AeroDesk shell. A user opening a supplier contract must be able to return to **Furnizori**, with the same tab, search, filters and page. The same rule applies to every document entry point.

## Routes and return destinations

The application uses hash routes. `frontend/src/services/navigation.ts` owns parsing, document URLs, page labels and browser history. `App.tsx` owns the shell and supplies feature callbacks.

| Route | Behavior |
|---|---|
| `#suppliers` and other known section hashes | Open the selected workspace section |
| `#document/doc-123?from=suppliers` | Open the document; both return controls lead to Furnizori |
| `#document/doc-123?from=contracts` | Open the document; both return controls lead to Contracte |
| `#document/doc-123` | Legacy link; return to Documente |
| Missing, invalid or external `from` value | Return to Documente |
| Supplier origin without director/finance access | Use Documente as the workspace and return destination |
| Empty document ID or invalid percent encoding | Recover to Documente without crashing |
| Unknown section | Recover to Acasă |

Allowed origins are `home`, `documents`, `contracts`, `suppliers`, `approvals`, `people`, `sharing` and `audit`. Return metadata never grants document or supplier access; backend permission checks still apply.

## Required behavior

1. Open documents through the shell's `onOpen` callback. For document anchors, use `documentHref(id, origin)` and intercept only an ordinary primary click. Preserve Ctrl/Cmd/Shift/Alt and middle-click behavior so a new tab receives the same return destination. Do not build bare `#document/...` links in new features.
2. The document's **Înapoi la …** button and parent breadcrumb must return to its origin. Keep the return control available during loading and errors. The originating sidebar section stays selected while the document is open.
3. Related documents and assistant sources opened from document detail retain the original section. A document opened after selecting another sidebar section belongs to that new section.
4. Retain the originating workspace while showing detail. Its wrapper must be `hidden` and `inert`, and use `ViewActiveContext` to dismiss its dialogs. Opening a document must preserve local list state; changing section or user may reset it. The main workspace remains keyed by user identity.
5. Browser Back/Forward must update the visible route. Listen to both `popstate` and `hashchange`: `pushState` does not emit `hashchange`, whereas ordinary section anchors do. Do not push another history entry when handling either event.
6. The explicit return controls skip a known document chain back to its list. `history.state.aerodeskNavigation` records the origin, user and chain depth. Use that history only for the matching user and origin. Direct/copied links without that state replace the document route with the origin section; they must not call an unconditional `history.back()` that could leave the application.
7. Save list scroll before opening detail and restore it after React reveals the list. Document visits, including Forward, start at the top. Move keyboard focus into detail and back to the retained list trigger, or the main landmark when that trigger is unavailable.
8. Close mobile navigation, user menus, upload and assistant overlays when routing. Feature dialogs must use the shared `Modal`, which releases keyboard handlers and body scroll locks when their retained view becomes inactive. Modal cleanup must not focus a hidden or removed trigger.
9. Async completion callbacks must respect their view's lifetime. A dismissed upload may still finish on the server, but its late response must not open a document, replace the current section's history entry or use a previous account's navigation context. Cover dismissal, browser Back and account changes with delayed-response regressions. Starting a new visit through an assistant/upload overlay must also clear any saved trigger from an earlier list visit.

Filters, tabs, pagination and trigger references are in-memory state. They survive a document visit in the same mounted workspace; they are not persisted through reloads, another section or another account. Copied/reloaded links preserve the URL's return destination, with a freshly loaded list.

## Entry points to check when changing navigation

| Entry point | Expected return |
|---|---|
| Furnizori: source contract, supplier profile contract, review/registration evidence | Furnizori |
| Documente: document row | Documente |
| Contracte: contract row | Contracte |
| Aprobări: task's document | Aprobări |
| Partajate cu aeroporturi: sent share's source document | Partajate cu aeroporturi |
| Jurnal de activitate: linked document | Jurnal de activitate |
| Acasă: recent document or attention item | Acasă |
| Assistant from a workspace section | That section |
| Assistant or related link from document detail | The document's original section |
| Newly uploaded document | The section where upload started |
| Document workflow link to team tasks | Opens Aprobări; subsequent documents return there |
| Received partner PDF preview | Remains a received-share modal; do not substitute a local document route |

## Regression gate

Run from the repository root before committing routing changes:

```powershell
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix frontend run lint
```

`npm --prefix frontend run test:navigation` runs the targeted suite. `frontend/tests/navigation.test.mjs` mounts the real application in jsdom with fixture responses at the fetch boundary. It checks origin returns, supplier state/scroll, Back/Forward, related chains, direct/legacy/malformed links, role fallback, sidebar/mobile navigation, breadcrumbs, modifier clicks, dialog cleanup, workflow anchors, account changes, focus and delayed upload callbacks. Existing supplier render checks remain in `test:suppliers` and run in the combined gate.

When adding a new document entry point, add a DOM interaction regression that opens it and exercises its return control. A rendered link assertion alone does not prove the flow works. When adding a section, update `Page`, navigation labels/allowlist, shell rendering and this matrix together.

### Check the application actually being served

Compose serves frontend files baked into its web images. `npm run build` updates the local `frontend/dist` directory; running containers require their own rebuild and recreation. For the local two-airport demonstration, apply frontend changes with:

```powershell
docker compose build dunarea-web carpati-web
docker compose up -d --no-deps dunarea-web carpati-web
```

Check that both `http://127.0.0.1:8080/` and `http://127.0.0.1:8081/` serve the new JavaScript asset. Reload the browser and reopen a contract **from Furnizori**; its URL must include `?from=suppliers` and its button must say **Înapoi la Furnizori**. A document URL left open by an older build may lack origin metadata and uses the documented Documente fallback after reload.

If a frontend change depends on new API routes or migrations, rebuild and recreate the API containers as well:

```powershell
docker compose build dunarea-api carpati-api
docker compose up -d --no-deps --wait dunarea-api carpati-api
```

Retain the state volumes and check migration/startup logs and health before testing the frontend. A frontend-only rebuild can leave `/supplier-reviews` counts working while an older API lacks `/suppliers` and `/supplier-registrations`. Check the running API's OpenAPI schema inside each API container at `http://127.0.0.1:8000/openapi.json`, then verify the catalog response under an authorized account. Registry counts must come from the catalog, since review choices exclude suspended or otherwise ineligible suppliers. Until the catalog responds, show loading; a failed catalog request must keep its own visible error and retry control even after a successful review request. An empty-state message applies only after a successful catalog load.

Before release, also check a real browser at desktop and about 390 px width:

- Start with a filtered/paginated supplier list, open a contract through each supplier flow, then return through both controls and browser Back/Forward. Check state and scroll.
- Follow two related documents, return to the list, then use Forward. Reload/copy the document URL and check its return destination.
- Navigate using the sidebar, brand, workflow link, quick search, assistant and upload. Repeat with an open modal and the mobile drawer. Check that no invisible dialog locks scrolling or traps focus.
- Use Tab/Enter to open and return, and open related links in a new tab. Repeat direct supplier-origin URLs under a role without supplier access and with a document load error.
- Check header wrapping, visible return controls, focus visibility and overflow. jsdom does not establish real layout, PDF rendering, native scrolling limits or browser accessibility behavior.

Record actual results and any unavailable checks in [VERIFICATION.md](VERIFICATION.md).

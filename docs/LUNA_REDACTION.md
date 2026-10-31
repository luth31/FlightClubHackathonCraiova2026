# Luna redaction studio

Branch: `codex/luna-redaction-studio`. The original document and its signature remain unchanged; the editor creates a separate, reviewed sharing copy.

## Run with OpenAI

1. Copy `.env.example` to `.env` in the repository root and set `OPENAI_API_KEY` locally. The real file is ignored by Git and excluded from Docker build contexts.
2. `AERODESK_OPENAI_MODEL=gpt-6-luna` is the shared default. `AERODESK_OPENAI_REDACTION_MODEL` optionally overrides this one task.
3. Run `./scripts/start-demo.sh` for the two-airport OIDC demonstration, or `./scripts/dev.sh` for local development. Restart the backend after changing credentials/configuration.
4. Open an approved document → **Partajează**. This opens **Atelier de redactare**.

The key stays on the backend. Each API container has a separate outbound network for OpenAI; airport databases and the authenticated exchange gateway network remain separate. This enables outbound access, not a domain-filtering firewall. Existing local certificate and signing-key generation is unchanged.

## Editor behavior

- Click a PDF word; use **Redactează doar aici** for that occurrence. Shift-click selects a contiguous range on the page.
- Search a word or phrase, inspect each matching occurrence/page, then select one or **Redactează toate**. Search compares normalized whole words; it is not substring matching. Punctuation is ignored when finding a phrase.
- **Mod text** provides larger, keyboard/touch-friendly targets using the same underlying PDF word IDs. PDF mode preserves page positioning; small printed words necessarily have small exact-position targets. The text mode is the accessible alternative.
- Undo or clear selections before generating a derivative. Page markers show where selections exist.
- Optionally select the copy's purpose and describe its recipient/context, then **Analizează cu Luna**. No analysis request runs automatically on opening the editor.
- Inspect each suggestion's exact fragment, explanation, legal references and qualification. Apply or ignore it explicitly. Applying a suggestion does not publish a document.
- **Verifică copia** creates the actual redacted PDF. Navigate every page and compare the rendered copy against the original; download/open the PDF if desired. Confirm human review, recipient department and expiry before sharing.

Selections are kept in the open editor, not saved as resumable drafts. Closing the editor loses the selection plan; already generated preview PDFs and shares remain stored. Editing after a preview invalidates its review confirmation and requires generating a new copy.

## OpenAI integration

`backend/app/llm/service.py` is a shared server-side adapter for the [Responses API and structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs). The default is [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), as requested. It uses the existing pinned HTTP client dependency rather than introducing a second transport stack.

Requests set `store: false`, specify a strict JSON schema, cap output at 8,000 tokens, and have a 45-second timeout. Four concurrent calls per application process are allowed. There is no automatic retry or model substitution. Missing credentials, refusal, rate limits, incomplete/malformed output and provider failures have explicit UI errors. Manual selection remains available without an API key.

Only the authorized document's extracted word IDs/text, the selected purpose, optional context and the curated reference catalog are sent. The application does not upload the raw PDF, other documents, sessions or signing keys to OpenAI. `store: false` does not itself establish a zero-data-retention agreement; deployment owners must configure provider data handling as appropriate.

The current integrated LLM task is redaction advice. The existing general register assistant and metadata extraction remain deterministic. Other tasks can use the shared adapter and default model in later work.

## Legal references and boundaries

The reference catalog was reviewed on 31 October 2026 against these official sources:

- [Regulation (EU) 2016/679](https://eur-lex.europa.eu/eli/reg/2016/679/oj): Article 5(1)(c), minimization; Article 6, lawful processing; Article 9, special categories; Article 86, reconciling official-document access with data protection.
- [Romanian Law 544/2001](https://legislatie.just.ro/Public/DetaliiDocument/31413): Article 12(1)(c)/(d), conditional commercial and personal-data exceptions, and Article 14, public-function context.

These are reference points for a human assessment, not universal instructions to remove data. A corporate name, price, tax ID or corporate IBAN is not automatically personal data or a trade secret. Public disclosure, an internal operational purpose and a controlled transfer between airports can justify different decisions. No automatic finding of legal compliance is made. The application restricts citation IDs to this reviewed catalog; the model cannot invent a link or cite an unapproved statute. The catalog is versioned in source, not automatically refreshed from the web.

## Integrity and access

The server derives word rectangles from the source PDF. A selection carries its source version and SHA-256, and only existing word IDs are accepted. Stale versions, tampered sources, unknown words and unauthorized users are rejected before redaction. AI groups must reference contiguous existing words on one page and known legal provisions; invalid output is rejected in full. Permissions and source integrity are checked again after an external model call.

Document text and user context are treated as untrusted input in the model instructions. The model has no tools or authority to change files, permissions, approvals or shares. React escapes model text; legal links come from the server catalog. The audit records the analysis count/model, not the document text, context, API key or provider response.

PyMuPDF removes selected content and rebuilds a sanitized derivative without the original catalog, annotations, links or widgets. Selected terms are also removed from derivative metadata and the recipient-facing title. A self-signed original signature is not transferred to changed bytes. Preview downloads/page rendering enforce ownership, document access and the derivative hash; existing expiry, department scope and revocation checks still apply to sharing.

## Limits and verification

The editor accepts up to 100 pages / 40,000 extracted words. AI analysis accepts up to 12,000 words / 120,000 text characters. Large documents fail explicitly rather than being silently truncated. Scanned/image-only content has no selectable words; OCR and region-drawing redaction are not implemented. Images and any non-text sensitive content still require visual review.

Regression coverage includes exact single versus repeated redaction across pages, original-file preservation, rendered preview access/integrity, stale versions and edits during an API call, role boundaries, optional context, grounded word IDs/citations, strict Responses request shape, refusal, malformed output and provider errors. Tests use mock provider responses and do not spend API credits. Real Luna calls were also exercised separately on the fictional corpus with the locally supplied key.

The text-mode editor passed desktop and mobile Lighthouse accessibility/best-practice checks at 100. The precise PDF word overlays have small touch targets; use text mode for larger targets. This distinction is intentional and is not presented as a perfect score for every PDF-mode state.

The final branch suite has **99 passing tests**, plus passing frontend lint/build. Live verification covered both local development and the Docker OIDC deployment. In Docker, Luna suggested `Mihai Dumitrescu` in `doc-145` with RGPD references and a qualification about fictional data. Applying the suggestion removed word IDs `p2-w10` and `p2-w11` from the actual derivative; extracted PDF text and SHA-256 checks confirmed the removal and preservation of the original. The source/copy comparison and both review pages were inspected in Chrome.

The retained reviewed copy is preview `d6d63cb2035e4ae582710e5658807345`, shared through grant `share-bd30526b3158` to Carpați / Conformitate. After Keycloak login as the recipient reviewer, the received list and the 67,935-byte PDF returned 200. These are local demonstration records, not seeded IDs for a fresh checkout. A separate 390 px mobile run verified text selection, preview rendering, no horizontal overflow, no console errors and a review-screen accessibility/best-practices score of 100.

A second live Docker analysis used contract `doc-115` with the optional context omitted. Luna returned 200 with two grounded recommendations (the example person's name and contact address), explicit qualifications about fictional data, and no automatic claim that the corporate name, contract value or test IBAN required removal.

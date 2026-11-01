# FlyLeaf product presentation

A Romanian product pitch for **Flight Club**, built around the working FlyLeaf application. The main sequence takes five minutes, including a 75-second live demonstration. Two appendix slides support questions about reports, the broader workspace and technology.

- [Editable PowerPoint](FlyLeaf-Product-Presentation-RO.pptx)
- [PDF for upload and reading](FlyLeaf-Product-Presentation-RO.pdf)
- [Speaker script and demo timing](SPEAKER_NOTES_RO.md)
- [Slide copy and embedded notes](content.json)

The story connects an operational delay to its evidence, a proposed SOP improvement and a controlled document exchange with a partner airport. Document management, approvals, local OCR, redaction and audit explain how the platform reduces administrative friction. Benefits such as shorter approval times are pilot objectives, not invented results.

## Contents

| Slide | Subject |
| --- | --- |
| 1 | FlyLeaf and Flight Club |
| 2 | An 18-minute delay and the need for evidence |
| 3 | Connected document dossiers and assigned approvals |
| 4 | Atomic operations and inspectable entities |
| 5 | SOP library and local approval |
| 6 | Luna's proposals and human decisions |
| 7 | Redaction and controlled copies |
| 8 | Collaboration between independent airports |
| 9 | Live demonstration |
| 10 | Differentiation and the first measurable pilot |
| 11–12 | Optional reports, team, supplier and technology appendices |

## Before presenting

Prepare a completed ledger case, an existing saved Luna analysis and its draft, and an approved sharing grant/message visible in the receiving airport. Keep both authorized sessions ready. Show a saved AI result as a saved result. There is no need to wait for an LLM request during the pitch.

The screenshot case is **FL634, 27 October**, from the stored synthetic history. It is independent of the current shift. Use **Tot registrul**, search `FL634`, expand the flight and open **Poartă deschisă**. A live NFC clock-in belongs to the current run and does not rewrite this historical example. If using NFC in the introduction, prepare the authenticated station in advance.

The source airport and recipient must both enable collaboration. A named contact conversation and the audience of the attached document grant are separate permissions. Do not present a private tailnet address as a publicly accessible judge demo URL.

## Assets and provenance

`assets/` contains unaltered browser captures from an isolated local FlyLeaf fixture using the actual frontend/API. They show synthetic data and contain no real API keys or private airport records. Counts reflect the account and filters in that session; they are not service-wide performance statistics. No screenshots fabricate LLM output. Source/code references live in each slide's notes.

The navy, mint and pale background direction follows the earlier FlyLeaf presentation in `deliverables/submission/FlyLeaf-Presentation-v2.pptx`. That historical file is optional reference material and is not needed to build this deck. All required current assets are in this directory.

## Editing and rebuilding

Edit the PPTX directly in PowerPoint, Keynote or LibreOffice. Text remains editable; application screenshots are embedded images. The PDF is a separate upload copy and should be re-exported after edits.

For source-based rebuilding, `build.mjs` reads `content.json` and `assets/`, creates the PPTX and speaker script, and renders slide previews into ignored `.runtime/presentation-v3/`. It uses the **Codex bundled `@oai/artifact-tool` runtime and Presentations skill finalizer**; these authoring tools are not application dependencies. In a Codex environment, use `load_workspace_dependencies` to locate its Node, module and Python paths, then supply:

```bash
export ARTIFACT_NODE_MODULES=/absolute/path/to/bundled/node_modules
export ARTIFACT_PYTHON=/absolute/path/to/bundled/python3
export PRESENTATIONS_SKILL_DIR=/absolute/path/to/presentations/skill
# Use a new filename: the finalizer deliberately refuses to overwrite outputs.
export FLYLEAF_DECK_FILENAME=FlyLeaf-Product-Presentation-RO-revision.pptx
/absolute/path/to/bundled/node docs/presentation/build.mjs
```

No runtime paths or private environment files are required to open the delivered PPTX/PDF. For an ordinary LibreOffice installation, export a rebuilt deck using:

```bash
soffice --headless --convert-to pdf --outdir docs/presentation \
  docs/presentation/FlyLeaf-Product-Presentation-RO-revision.pptx
```

Render and inspect every slide after changing copy or layout. The presentation does not require changes to source PDFs, application data or deployment configuration.

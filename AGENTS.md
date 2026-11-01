# Browser verification

- Use Playwright with an isolated, disposable browser context for application checks and screenshots.
- Do not use, attach to, or control the user's real browser, existing browser tabs, or personal browser profile unless the user explicitly requests it.
- Do not use computer-use tools to control a browser without that explicit request.
- Keep browser test sessions and artifacts separate from the user's browsing session; store temporary artifacts in `.work/` or `.runtime/`.

# Security policy

## Model

Desktop automation exposes private information and causes real-world side effects. DeskBridge's controls:

- **Consent**: the bundle ships disabled and the plugin registers nothing unless `enabled: true`.
- **Least privilege**: only the eleven documented tools; no `batch`, no `launch`/`close-app`, no clipboard, no coordinate mouse input, no `--headed` physical mode, no arbitrary shell or command execution — the tool surface accepts only validated refs, names, enums, and text.
- **Safe subprocess use**: argv arrays only (never shell-interpolated), spawned via DSH's subprocess seam with a scrubbed environment; all inputs validated before spawn; dash-leading values rejected (no flag injection); NUL rejected.
- **Approval gates**: every mutating call goes through DSH's native approval seam (fail-closed without a channel); optional `allowedApps` allowlist for app-scoped observation.
- **No auto-retries**: actions that may have been delivered are never repeated by the plugin; `retry: "unsafe"` outcomes tell the model to observe first.
- **Privacy**: no logging of typed text, snapshot trees, window titles, or image bytes by default; screenshots go to plugin-chosen paths; the model never chooses filesystem paths.
- **Bounds**: outer timeouts per command class, inner CLI timeouts, output-size caps with spill, abort-driven process termination.

## Reporting a vulnerability

Open a private security advisory on GitHub (Security → Report a vulnerability) or contact the maintainer directly. Do not open public issues for vulnerabilities.

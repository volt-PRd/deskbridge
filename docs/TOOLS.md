# Tool reference

All tools return one canonical JSON value: `{ok, command, data?}` on success, `{ok:false, command, error:{code,message,suggestion,retry,delivery,requiresFreshSnapshot}}` for CLI-reported failures (which are successful tool calls — the model acts on them), and `isError` results only for infrastructure failures (missing CLI, invalid output, timeout, abort).

## Observation (no approval, parallel-safe)

- **desktop_status** — CLI version, platform, OS permission report, supported surfaces, latest snapshot ids. Use first when things fail.
- **desktop_list_apps** — running GUI apps `{name,pid,bundle_id?}`. Feeds `app` parameters.
- **desktop_list_windows**(app) — windows `{id,title,app_name,is_focused}`; `id` feeds `windowId` parameters.
- **desktop_snapshot**(app, windowId?, interactiveOnly?=true, compact?=true, skeleton?, maxDepth?, root?) — the accessibility tree with refs `@<snapshot_id>:e<N>`. Use `skeleton` for dense apps, `root` to drill into one element's subtree.
- **desktop_find**(app, role?/name?/value?/text?/description?, exact?, root?, first?|limit?|count?) — scoped search; matches carry `ref_id` (matches without one are readable text, not targets). Cheaper than a snapshot when you know the target.
- **desktop_get**(ref, property ∈ text|value|title|bounds|role|states) — one element property. Use it to verify after acting.
- **desktop_screenshot**(app|windowId — exactly one) — writes a PNG to a plugin-chosen path, returns `{path,format,width,height,scale_factor}`; view it with the harness image-reading tool.

## Interaction (approval-gated, exclusive)

- **desktop_click**(ref, button ∈ left|right) — `click`/`right-click` by ref.
- **desktop_type**(ref, text, intervalMs? 1–2000) — typing semantics; on Windows headless this is refused (`POLICY_DENIED`) — use set_value there.
- **desktop_set_value**(ref, mode ∈ set-value|select|clear, value?) — atomic value write; preferred for form fields.
- **desktop_press**(combo, app?, windowId?) — key combo (`return`, `cmd+c`, `ctrl+shift+t`...). Dangerous system shortcuts are blocked by the CLI itself (POLICY_DENIED).

## Rules the model should follow

Refs belong to the snapshot that issued them; `STALE_REF`/`AMBIGUOUS_TARGET`/`SNAPSHOT_NOT_FOUND` → take a fresh snapshot, never repeat the ref. `error.retry !== "safe"` → the action may have partially happened; observe before anything else. The plugin never auto-retries.

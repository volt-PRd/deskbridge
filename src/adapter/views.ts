/**
 * Per-command zod views over the `data` payload of agent-desktop success
 * envelopes. Field-by-field sources: the serde structs in
 * `crates/core/src/{commands,system,tree,actions,locator}/*.rs` of
 * agent-desktop v1.0.2. Only fields this bridge reads are declared; every
 * view uses `.passthrough()` so additive upstream fields are not rejections.
 *
 * @module dsh-deskbridge/adapter/views
 */

import { z } from 'zod'

const rectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
}).passthrough()

/** `version` — `crates/core/src/commands/version.rs`: {version, target, os}. */
export const versionData = z.object({
  version: z.string(),
  target: z.string(),
  os: z.string(),
}).passthrough()

/** `status` — `crates/core/src/commands/status.rs`; nullable optional fields. */
export const statusData = z.object({
  platform: z.string(),
  version: z.string(),
  permissions: z.record(z.string(), z.object({
    state: z.enum(['granted', 'denied', 'not_required', 'unknown']),
    suggestion: z.string().optional(),
  }).passthrough()),
  snapshot_id: z.string().nullable(),
  ref_count: z.number().nullable(),
  session_id: z.string().nullable(),
  tracing: z.boolean(),
  supported_surfaces: z.array(z.string()),
  state_root: z.string().optional(),
}).passthrough()

/** `list-apps` — `crates/core/src/commands/list_apps.rs` over `AppInfo`. */
export const listAppsData = z.object({
  apps: z.array(z.object({
    name: z.string(),
    pid: z.number(),
    bundle_id: z.string().optional(),
    process_instance: z.string().optional(),
    presentation: z.string().optional(),
  }).passthrough()),
  complete: z.boolean().optional(),
  skipped: z.array(z.string()).optional(),
}).passthrough()

/** `list-windows` — data is a bare array of `WindowInfo`. */
export const listWindowsData = z.array(z.object({
  id: z.string(),
  title: z.string(),
  app_name: z.string(),
  pid: z.number(),
  process_instance: z.string().optional(),
  bounds: rectSchema.optional(),
  is_focused: z.boolean(),
  accessible: z.boolean(),
  minimized: z.boolean().optional(),
  visible: z.boolean().optional(),
}).passthrough())

/** `snapshot` tree node — `crates/core/src/tree/node.rs` (only `role` required). */
export const snapshotNode = z.object({
  ref_id: z.string().optional(),
  role: z.string(),
  name: z.string().optional(),
  value: z.string().optional(),
  description: z.string().optional(),
  native_id: z.union([z.string(), z.number()]).optional(),
  hint: z.string().optional(),
  states: z.array(z.string()).optional(),
  available_actions: z.array(z.string()).optional(),
  bounds: rectSchema.optional(),
  children_count: z.number().optional(),
  subtree_truncated: z.boolean().optional(),
}).passthrough()

/** `snapshot` — `crates/core/src/commands/snapshot.rs`. */
export const snapshotData = z.object({
  app: z.string(),
  window: z.object({ id: z.string(), title: z.string() }).passthrough(),
  snapshot_id: z.string(),
  ref_count: z.number(),
  complete: z.boolean(),
  tree: snapshotNode,
  truncated: z.boolean().optional(),
  nodes_observed: z.number().optional(),
  identity_unproven: z.boolean().optional(),
  elapsed_ms: z.number().optional(),
}).passthrough()

/** `find` — `crates/core/src/commands/find_live.rs` (modes: matches | match | count). */
export const findData = z.union([
  z.object({
    matches: z.array(z.object({
      ref_id: z.string().optional(),
      role: z.string(),
      name: z.string().optional(),
      value: z.string().nullable().optional(),
      states: z.array(z.string()).optional(),
      interactive: z.boolean().optional(),
      path: z.array(z.string()).optional(),
      bounds: rectSchema.optional(),
    }).passthrough()),
    total_matches: z.number(),
    truncated: z.boolean().optional(),
    snapshot_id: z.string().optional(),
    roles_present: z.array(z.string()).optional(),
  }).passthrough(),
  z.object({
    match: z.union([
      z.object({
        ref_id: z.string().optional(),
        role: z.string(),
        name: z.string().optional(),
        value: z.string().nullable().optional(),
        states: z.array(z.string()).optional(),
        interactive: z.boolean().optional(),
        path: z.array(z.string()).optional(),
        bounds: rectSchema.optional(),
      }).passthrough(),
      z.null(),
    ]),
    snapshot_id: z.string().optional(),
    roles_present: z.array(z.string()).optional(),
  }).passthrough(),
  z.object({
    count: z.number(),
  }).passthrough(),
])

/** `get` — `crates/core/src/commands/get.rs`: {property, ref, value, live?}. */
export const getData = z.object({
  property: z.string(),
  ref: z.string(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())]),
  live: z.boolean().optional(),
}).passthrough()

/** Ref-action result — `crates/core/src/actions/action_result.rs`. */
export const actionData = z.object({
  action: z.string(),
  disposition: z.object({
    delivery: z.string(),
    retry: z.string(),
  }),
  post_state: z.object({
    role: z.string(),
    states: z.array(z.string()).optional(),
    value: z.string().optional(),
    enabled: z.boolean().optional(),
    hidden: z.boolean().optional(),
    offscreen: z.boolean().optional(),
  }).passthrough().optional(),
  steps: z.array(z.object({
    label: z.string(),
    outcome: z.string(),
    mechanism: z.string().optional(),
    verified: z.boolean().optional(),
  }).passthrough()).optional(),
  details: z.unknown().optional(),
}).passthrough()

/** `screenshot` with a PATH positional — `crates/core/src/commands/screenshot.rs`. */
export const screenshotData = z.object({
  path: z.string(),
  format: z.string(),
  width: z.number(),
  height: z.number(),
  scale_factor: z.number(),
}).passthrough()

export type VersionData = z.infer<typeof versionData>
export type StatusData = z.infer<typeof statusData>
export type ListAppsData = z.infer<typeof listAppsData>
export type ListWindowsData = z.infer<typeof listWindowsData>
export type SnapshotData = z.infer<typeof snapshotData>
export type SnapshotNode = z.infer<typeof snapshotNode>
export type FindData = z.infer<typeof findData>
export type GetData = z.infer<typeof getData>
export type ActionData = z.infer<typeof actionData>
export type ScreenshotData = z.infer<typeof screenshotData>

/**
 * features/assistant/tools.ts - the assistant's tool surface.
 *
 * The names, arguments, read/write classification and error semantics are a
 * deliberate COPY of CoreC's cmd/corec-mcp/tools.go. The assistant is just
 * another client of the same control plane; inventing a second vocabulary
 * would mean the same operation is called one thing in the UI and another in
 * Claude Desktop, and the two would drift. If the MCP tool list changes,
 * change this file in the same change.
 *
 * Execution is not reimplemented either: every tool calls the existing
 * @/api/endpoints wrapper, so the engine-side guarantees (per-tag write
 * protection, write pacing -> 429, config validation chain) apply unchanged
 * and a failure carries the engine's own words in toolError.
 *
 * Write tools are only REGISTERED when allowWrite is true. With writes off
 * they are absent from the list the model sees - not present-and-refused.
 */
import { ApiError, extractApiError } from '@/api/client'
import {
  ackAlert,
  getAlerts,
  getConfigsRaw,
  getDriver,
  getDrivers,
  getDriverTags,
  getPausedDrivers,
  getTags,
  pauseDriver,
  resumeDriver,
  validateConfigs,
  writeTag,
} from '@/api/endpoints'
import type { AssistantToolSpec, ToolResult } from '@/features/assistant/types'
import { clip } from '@/lib/clipText'
import type { WriteCommand } from '@/types/models'

/**
 * Ceiling for one tool payload handed to the model. A large /tags snapshot or
 * a full /configs/raw document can exceed a comfortable context on its own;
 * truncate and SAY SO rather than letting the model reason confidently from
 * half a document.
 */
/** Points listed per call; more is a flood, and the UI has filters for it. */
const MAX_LISTED_TAGS = 50

/**
 * The engine's own reason text, verbatim - never paraphrased or swallowed.
 *
 * ApiError.message is the transport's summary ("API request failed: 429 Too Many
 * Requests"); the engine's sentence is in .body, and for a refused write that
 * sentence is the whole answer: "is read-only (protect: read-only)" says the
 * point is guarded, "accepts a write every 200ms (retry in 187ms)" says back off
 * and by how much. Both come back as a 4xx whose status line is identical, so a
 * model that only ever sees the status has to guess which happened -- and the
 * guess it makes is "retry", which is exactly wrong for a read-only point.
 *
 * extractApiError is what the rest of this repo already uses to read that
 * body (WriteControlPage, useAutoLoadConfig); this module having been the one
 * place that read .message instead was the drift, not the fix.
 */
function reasonOf(err: unknown): string {
  if (err instanceof ApiError) {
    return err.body ? extractApiError(err.body, err.message) : err.message || `HTTP ${err.status}`
  }
  return err instanceof Error ? err.message : String(err)
}

async function run(fn: () => Promise<{ content: string; summary: string }>): Promise<ToolResult> {
  try {
    const r = await fn()
    return { content: clip(r.content), summary: r.summary }
  } catch (err) {
    // Failed calls still return something to the model, with the engine's
    // words intact: "is read-only (protect: read-only)" and "429 ... retry in"
    // are actionable, "tool failed" is not.
    const reason = reasonOf(err)
    return { content: JSON.stringify({ error: reason }), failed: true, toolError: reason }
  }
}

function argStr(args: Record<string, unknown>, key: string): string {
  const v = args[key]
  return typeof v === 'string' ? v : ''
}

/**
 * filterPoints narrows a /tags snapshot to the names a query asked for.
 *
 * `exact` is corec-mcp's read_tag folded into list_tags: that verb returns ONE
 * point, while a substring filter is the only thing this tool had, and
 * "filter=sp" would hand back sp, sp1, sp_2 and speed alike. Exact mode returns
 * just the named point, and an empty list on a miss -- a wrong neighbour is
 * worse than nothing when the caller is about to read or write it.
 *
 * Empty needle = no filter (the whole snapshot), in both modes.
 */
export function filterPoints(
  entries: [string, unknown][],
  needle: string,
  exact: boolean,
): [string, unknown][] {
  if (!needle) return entries
  return entries.filter(([name]) => (exact ? name === needle : name.includes(needle)))
}

const readTools: AssistantToolSpec[] = [
  {
    name: 'list_drivers',
    description:
      'List every configured southbound driver with its type, connection state and tag count.',
    schema: { type: 'object', properties: {}, required: [] },
    toolClass: 'read',
    execute: () =>
      run(async () => {
        const res = await getDrivers()
        const drivers = (res.drivers ?? []).map((d) => ({
          name: d.name,
          type: d.type,
          state: d.state,
          last_error: d.last_error,
          tag_count: d.tag_count,
        }))
        return {
          content: JSON.stringify({ drivers }),
          summary: `${drivers.length} driver(s)`,
        }
      }),
  },
  {
    name: 'driver_status',
    description:
      "Report one driver's status, including whether collection is paused and its scheduler health.",
    schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'driver name' } },
      required: ['name'],
    },
    toolClass: 'read',
    execute: (args) =>
      run(async () => {
        const name = argStr(args, 'name')
        if (!name.trim()) throw new Error('driver_status requires a non-empty name')
        const d = await getDriver(name)
        return {
          content: JSON.stringify({
            name: d.name,
            type: d.type,
            state: d.state,
            last_read: d.last_read,
            last_error: d.last_error,
            tag_count: d.tag_count,
            error_count: d.error_count,
            reconnect_count: d.reconnect_count,
          }),
          summary: `${name}: state ${d.state}`,
        }
      }),
  },
  {
    name: 'list_tags',
    description:
      'List the latest collected values (value, quality, timestamp) of configured points, optionally filtered by driver or tag name substring. Large results are capped and say so.',
    schema: {
      type: 'object',
      properties: {
        driver: { type: 'string', description: 'optional driver name to filter by' },
        tag: { type: 'string', description: 'optional tag name substring to filter by' },
        exact: {
          type: 'boolean',
          description:
            'when true, tag is the exact point name (like corec-mcp read_tag) instead of a substring',
        },
      },
      required: [],
    },
    toolClass: 'read',
    execute: (args) =>
      run(async () => {
        const driver = argStr(args, 'driver')
        const needle = argStr(args, 'tag')
        // The per-driver route returns {tags: null} for an unknown driver
        // rather than 404 (src/types/api.ts), so null is a normal answer here.
        const res = driver ? await getDriverTags(driver) : await getTags()
        if (res.tags === null) {
          return {
            content: JSON.stringify({ tags: null, note: `no cached values for driver ${driver}` }),
            summary: `${driver}: no cached values`,
          }
        }
        const matches = filterPoints(Object.entries(res.tags), needle, args.exact === true)
        const capped = matches.slice(0, MAX_LISTED_TAGS)
        const tags = Object.fromEntries(capped)
        // Counts are named for what they bound. A bare `count` next to a
        // truncated `tags` object reads as "the length of tags" -- the obvious
        // meaning of the word in a JSON body -- and the one case where it
        // differs is exactly the case where reading it wrong matters: 300
        // matched, 50 sent, and a model that believes it was given 300 answers
        // "how many points have no value in cache" with "none" when it has
        // seen one sixth of the map.
        //   matched  is how many the filter hit
        //   returned is how many are in this object, so the two can be compared
        const out = { tags, matched: matches.length, returned: capped.length }
        if (matches.length > MAX_LISTED_TAGS) {
          Object.assign(out, {
            note: `showing ${MAX_LISTED_TAGS} of ${matches.length}; narrow by driver/tag`,
          })
        }
        return { content: JSON.stringify(out), summary: `${matches.length} tag(s)` }
      }),
  },
  {
    name: 'list_alerts',
    description:
      'List active alerts with their key, message, occurrence count and acknowledgement state, optionally filtered by driver.',
    schema: {
      type: 'object',
      properties: { driver: { type: 'string', description: 'optional driver name to filter by' } },
      required: [],
    },
    toolClass: 'read',
    execute: (args) =>
      run(async () => {
        const driver = argStr(args, 'driver')
        const res = await getAlerts()
        const alerts = res.alerts
          .filter((a) => !driver || a.driver === driver)
          .map((a) => ({
            key: a.key,
            rule: a.rule,
            driver: a.driver,
            tag: a.tag,
            quality: a.quality,
            count: a.count,
            acked: a.acked,
            last_fired: a.last_fired,
          }))
        // The counts are re-derived from what is being returned, not copied from
        // the engine. CoreC's /alerts reports active_count over ALL drivers, so
        // passing it through beside a driver-filtered `alerts` array says "300
        // active" and shows three: the number is true about a set the caller did
        // not ask about and cannot see. A filtered answer has to be counted over
        // the filtered set.
        //
        // total_active keeps the engine-wide figure, under a name that says so, so
        // the caller can still see that plc1's 3 are part of 300 and go filter the
        // rest rather than concluding the plant is quiet.
        //
        // The engine-wide acked_count gets the same treatment as *_total, NOT the
        // name acked_count: the server's acked_count counts acknowledgements across
        // /alerts as a whole, and handing back a different acked_count computed
        // over the filtered set would give one key two meanings depending on who
        // answered -- the same ambiguity, moved rather than removed. Each entry
        // already carries `acked`, so per-set acknowledgement needs no field.
        const active = alerts.length
        const acked = alerts.filter((a) => a.acked).length
        return {
          content: JSON.stringify({
            active_count: active,
            unacked_count: active - acked,
            total_active: res.active_count,
            total_acked: res.acked_count,
            alerts,
          }),
          summary: `${active} active alert(s)`,
        }
      }),
  },
  {
    name: 'get_configs',
    description:
      'Read the running CoreC configuration as YAML text. Read only the parts you need; prefer validate_configs before proposing a change.',
    schema: { type: 'object', properties: {}, required: [] },
    toolClass: 'read',
    execute: () =>
      run(async () => {
        const raw = await getConfigsRaw()
        return { content: raw, summary: `${raw.split('\\n').length} line(s) of YAML` }
      }),
  },
  {
    name: 'list_paused_drivers',
    description: 'List drivers whose collection is currently paused.',
    schema: { type: 'object', properties: {}, required: [] },
    toolClass: 'read',
    execute: () =>
      run(async () => {
        const res = await getPausedDrivers()
        return {
          content: JSON.stringify({ paused: res.paused }),
          summary: `${res.paused.length} paused`,
        }
      }),
  },
]

const writeTools: AssistantToolSpec[] = [
  {
    name: 'write_tag',
    description:
      'Write a value to a point. The engine enforces per-tag write protection and device write pacing: a read-only point, or a write inside the pacing window-body, is REFUSED with the reason (never queued).',
    schema: {
      type: 'object',
      properties: {
        driver: { type: 'string', description: 'driver name' },
        tag: { type: 'string', description: 'tag (point) name' },
        value: { description: 'value to write, matching type' },
        type: {
          type: 'string',
          description:
            'data type: bool, int8, int16, int32, int64, uint8, uint16, uint32, uint64, float32, float64, string, bytes',
        },
        raw: {
          type: 'boolean',
          description: 'optional: skip scale/offset inversion and write the raw device value',
        },
      },
      required: ['driver', 'tag', 'type', 'value'],
    },
    toolClass: 'write',
    execute: (args) =>
      run(async () => {
        const driver = argStr(args, 'driver')
        const tag = argStr(args, 'tag')
        if (!driver) throw new Error('write_tag requires a non-empty driver')
        if (!tag) throw new Error('write_tag requires a non-empty tag')
        const type = argStr(args, 'type') as WriteCommand['type']
        const cmd: WriteCommand = { driver, tag, type, value: args.value }
        if (args.raw === true) cmd.raw = true
        const res = await writeTag(cmd)
        return { content: JSON.stringify(res), summary: `wrote ${driver}/${tag}` }
      }),
  },
  {
    name: 'pause_driver',
    description:
      "Pause a driver's collection. The connection is kept; no data points are produced until resumed.",
    schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'driver name' } },
      required: ['name'],
    },
    toolClass: 'write',
    execute: (args) =>
      run(async () => {
        const name = argStr(args, 'name')
        if (!name.trim()) throw new Error('pause_driver requires a non-empty name')
        await pauseDriver(name)
        return { content: JSON.stringify({ paused: name }), summary: `paused ${name}` }
      }),
  },
  {
    name: 'resume_driver',
    description: 'Resume a paused driver collection.',
    schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'driver name' } },
      required: ['name'],
    },
    toolClass: 'write',
    execute: (args) =>
      run(async () => {
        const name = argStr(args, 'name')
        if (!name.trim()) throw new Error('resume_driver requires a non-empty name')
        await resumeDriver(name)
        return { content: JSON.stringify({ resumed: name }), summary: `resumed ${name}` }
      }),
  },
  {
    name: 'ack_alert',
    description:
      'Acknowledge an active alert by key (as returned by list_alerts). Acknowledgement does not clear it; only silence for the active window does.',
    schema: {
      type: 'object',
      properties: { key: { type: 'string', description: 'alert key' } },
      required: ['key'],
    },
    toolClass: 'write',
    execute: (args) =>
      run(async () => {
        const key = argStr(args, 'key')
        if (!key) throw new Error('ack_alert requires a non-empty key')
        await ackAlert(key)
        return { content: JSON.stringify({ acknowledged: key }), summary: `acked ${key}` }
      }),
  },
  {
    name: 'validate_configs',
    description:
      'Dry-run a candidate CoreC configuration (full YAML text) against the server. Use this BEFORE proposing a configuration change: it returns the same error the server would raise on reload, without applying it.',
    schema: {
      type: 'object',
      properties: { payload: { type: 'string', description: 'full configuration YAML' } },
      required: ['payload'],
    },
    toolClass: 'read',
    execute: (args) =>
      run(async () => {
        const payload = argStr(args, 'payload')
        if (!payload) throw new Error('validate_configs requires a non-empty payload')
        const res = await validateConfigs(payload)
        return {
          content: JSON.stringify(res),
          summary: res.valid ? 'valid' : `invalid: ${res.error ?? 'see content'}`,
        }
      }),
  },
]

/**
 * assistantTools returns the tools the model is shown.
 *
 * Write tools are omitted entirely unless allowWrite: the listing is the
 * authorization, matching corec-mcp's read-only default. A model that cannot
 * see pause_driver cannot be talked into calling it.
 */
export function assistantTools(allowWrite: boolean): AssistantToolSpec[] {
  return allowWrite ? [...readTools, ...writeTools] : [...readTools]
}

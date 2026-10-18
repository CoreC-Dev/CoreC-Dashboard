import type { CoreCInstance } from '@/types/models'

/**
 * Topology display model for the homepage InstanceCard (extracted from the
 * component so the card file stays under the 500-line God-file gate).
 *
 * Derives the input rows (drivers + incoming/bidirectional transports),
 * output rows (outgoing/bidirectional transports) and the rule list from a
 * probe's stats snapshot, classifying each transport as input/output using
 * its published/received counters with a name heuristic for the ambiguous
 * both-zero case — identical logic to the original in-component memo.
 */

type InstanceStats = NonNullable<NonNullable<CoreCInstance['lastKnownInfo']>['stats']>
type RuleListItem = NonNullable<InstanceStats['rule_list']>[number]

/** One rendered topology row (driver or transport). */
export interface TopologyRow {
  name: string
  type: string
  state: number
  detail: string
  conn: string
  /** True for driver rows (inputs panel). */
  isDriver: boolean
}

/** Everything the card's three topology panels need, derived from stats. */
export interface TopologyView {
  allInputs: TopologyRow[]
  allOutputs: TopologyRow[]
  ruleList: RuleListItem[]
  hasTopology: boolean
}

/** Derive the card topology view from a stats snapshot. Pure. */
export function deriveTopologyView(stats: InstanceStats | undefined): TopologyView {
  const driverList = stats?.driver_stats ? Object.values(stats.driver_stats) : []
  const transportList = stats?.transport_stats ? Object.values(stats.transport_stats) : []
  const ruleList: RuleListItem[] = stats?.rule_list ?? []

  // Classify transports as input or output based on published/received counts
  const inputTransports = transportList.filter((tr) => tr.received > 0 && tr.published === 0)
  const outputTransports = transportList.filter((tr) => tr.published > 0 && tr.received === 0)
  const bidirTransports = transportList.filter((tr) => tr.published > 0 && tr.received > 0)
  // Ambiguous (both 0) — use name heuristic
  const ambiguousTransports = transportList.filter((tr) => tr.published === 0 && tr.received === 0)
  for (const tr of ambiguousTransports) {
    if (/sub|in|from/i.test(tr.name)) {
      inputTransports.push(tr)
    } else {
      outputTransports.push(tr)
    }
  }

  // All inputs: drivers + input transports + bidirectional
  const allInputs: TopologyRow[] = [
    ...driverList.map((d) => ({
      name: d.name,
      type: d.type,
      state: d.state,
      detail:
        d.error_count > 0 ? `${d.error_count} err` : d.tag_count > 0 ? `${d.tag_count} tags` : '',
      conn: stats?.driver_conn?.[d.name] ?? '',
      isDriver: true,
    })),
    ...inputTransports.map((tr) => ({
      name: tr.name,
      type: tr.type,
      state: tr.state,
      detail: tr.received > 0 ? `${tr.received} rx` : '',
      conn: stats?.transport_conn?.[tr.name] ?? '',
      isDriver: false,
    })),
    ...bidirTransports.map((tr) => ({
      name: tr.name,
      type: tr.type,
      state: tr.state,
      detail: `${tr.received} rx`,
      conn: stats?.transport_conn?.[tr.name] ?? '',
      isDriver: false,
    })),
  ]

  // All outputs: output transports + bidirectional (published side)
  const allOutputs: TopologyRow[] = [
    ...outputTransports.map((tr) => ({
      name: tr.name,
      type: tr.type,
      state: tr.state,
      detail: tr.published > 0 ? `${tr.published} pub` : '',
      conn: stats?.transport_conn?.[tr.name] ?? '',
      isDriver: false,
    })),
    ...bidirTransports.map((tr) => ({
      name: tr.name,
      type: tr.type,
      state: tr.state,
      detail: `${tr.published} pub`,
      conn: stats?.transport_conn?.[tr.name] ?? '',
      isDriver: false,
    })),
  ]

  const hasTopology = allInputs.length > 0 || ruleList.length > 0 || allOutputs.length > 0
  return { allInputs, allOutputs, ruleList, hasTopology }
}

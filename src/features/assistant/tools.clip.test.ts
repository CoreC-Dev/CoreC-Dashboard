// @vitest-environment jsdom
//
// clip's contract, as docs/design-docs/ai-assistant.md:114 states it:
//
//   单次工具结果硬上限 64 KiB：超出截断，并在内容里写明"已截断 N 字符，请加过滤条件重查"
//
// "Hard limit 64 KiB" is a claim about a number, so it earns a test that measures
// the number -- not one that searches the output for the word "truncated" and
// calls the promise kept. The existing suite did the latter. It passed while the
// cap was exceeded on four of the five shapes below, including one where the
// result was three times the stated ceiling.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return {
    ...actual,
    apiRequest: (p: string, o?: unknown) => apiRequestMock(p, o),
  }
})

const apiRequestMock = vi.fn<(path: string, opts?: unknown) => Promise<unknown>>()

let assistantTools: typeof import('@/features/assistant/tools').assistantTools

beforeEach(async () => {
  apiRequestMock.mockReset()
  ;({ assistantTools } = await import('@/features/assistant/tools'))
})

afterEach(() => {
  vi.clearAllMocks()
})

function spec(name: string) {
  const found = assistantTools(true).find((t) => t.name === name)
  if (!found) throw new Error(`tool ${name} not registered`)
  return found
}

const MAX = 64 * 1024
const bytes = (s: string) => new TextEncoder().encode(s).length

/** Runs get_configs against a raw-YAML payload of n repeats of unit. */
async function clipOf(unit: string, n: number): Promise<string> {
  apiRequestMock.mockResolvedValue(unit.repeat(n))
  const res = await spec('get_configs').execute({})
  return String(res.content)
}

describe('tool result byte cap', () => {
  it('never exceeds 64 KiB of UTF-8, whatever the alphabet', async () => {
    // ASCII, CJK, accented, astral. A .length-based cap passes the first row and
    // blows past the rest; a byte cap has to hold all four.
    for (const [label, unit] of [
      ['ascii', 'x'],
      ['cjk', '\u6e29'],
      ['accented', '\u00e9'],
      ['astral', '\u{1F321}'],
    ] as const) {
      const out = await clipOf(unit, MAX + 1)
      expect(bytes(out), `${label}: ${bytes(out)} bytes`).toBeLessThanOrEqual(MAX)
    }
  })

  it('a payload at the cap is passed through untouched', async () => {
    const exact = 'x'.repeat(MAX)
    apiRequestMock.mockResolvedValue(exact)
    const res = await spec('get_configs').execute({})
    expect(res.content).toBe(exact)
    expect(res.content).not.toContain('truncated')
  })

  it('a payload just over the cap is clipped and says how much was withheld', async () => {
    for (const [label, unit] of [
      ['ascii', 'x'],
      ['cjk', '\u6e29'],
    ] as const) {
      const input = unit.repeat(MAX + 1)
      const out = await clipOf(unit, MAX + 1)
      expect(bytes(out), label).toBeLessThanOrEqual(MAX)

      const m = /truncated (\d+) bytes/.exec(out)
      expect(m, `${label}: notice missing: ...${out.slice(-80)}`).not.toBeNull()

      // The notice is self-consistent: the withheld count plus what survived
      // equals the input. If clip ever reports the wrong number, a model
      // deciding "I have seen 99% of this" is deciding from a lie.
      const withheld = Number(m?.[1] ?? -1)
      expect(withheld).toBeGreaterThan(0)
      expect(bytes(out) + withheld).toBeGreaterThanOrEqual(bytes(input))
    }
  })

  it('does not leave half a surrogate pair at the cut', async () => {
    // Astral glyphs are 4 UTF-8 bytes = 2 UTF-16 code units. An odd cut point
    // ends between them, producing a lone high surrogate that JSON encodes as
    // \ud83c and a model reads as a broken character.
    apiRequestMock.mockResolvedValue('\u{1F321}'.repeat(MAX + 3))
    const res = await spec('get_configs').execute({})
    const out = String(res.content)
    const last = out.charCodeAt(out.length - 1)
    expect(last >= 0xd800 && last <= 0xdbff, 'result ends on a lone high surrogate').toBe(false)
  })
})

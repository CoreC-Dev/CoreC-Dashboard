// @vitest-environment jsdom
// TagWriteDialog — B06: a write targets a physical PLC register, so the
// confirmation card must state WHICH sub-device receives the command before
// the operator confirms. i18n in English.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { TagWriteDialog } from '@/components/monitor/TagWriteDialog'
import i18n from '@/i18n'
import type { DataPoint } from '@/types/models'

const point = (over: Partial<DataPoint> = {}): DataPoint => ({
  driver: 'plc1',
  device: 'meter-01',
  tag: 'pump',
  value: true,
  type: 'bool',
  quality: 0,
  timestamp: '2026-01-01T12:00:00Z',
  ...over,
})

/** The dialog's info block renders label/value as separate <span>s, so plain
 *  getByText can't match "Device: meter-01" — match on the container's
 *  concatenated textContent instead. */
const byCombinedText = (text: string) =>
  screen.getByText((_: string, el: Element | null) => el?.textContent === text)

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

afterEach(() => {
  cleanup()
})

function renderDialog(selected: DataPoint | null) {
  return render(
    <TagWriteDialog
      selectedTagForWrite={selected}
      writeValue=""
      writeError={null}
      isPending={false}
      onValueChange={vi.fn()}
      onClose={vi.fn()}
      onSubmit={vi.fn()}
    />,
  )
}

describe('TagWriteDialog — device visibility (B06)', () => {
  it('shows the target sub-device next to driver and tag', () => {
    renderDialog(point())

    expect(screen.getByText('Write to PLC Tag')).toBeTruthy()
    expect(byCombinedText('Device: meter-01')).toBeTruthy()
    expect(byCombinedText('Driver: plc1')).toBeTruthy()
    expect(byCombinedText('Tag: pump')).toBeTruthy()
  })

  it("falls back to '-' for single-device drivers instead of hiding the line", () => {
    renderDialog(point({ device: undefined }))

    expect(byCombinedText('Device: -')).toBeTruthy()
  })
})

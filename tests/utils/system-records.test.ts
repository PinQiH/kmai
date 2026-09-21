import { describe, expect, it } from 'vitest'

import { baseSystemRecords } from '../src/mocks/systemRecords'
import type { SystemRecordEntry } from '../src/types'
import {
	buildAuditRecords,
	buildSystemEventRecords,
	getSystemRecordTimeCutoff,
	SYSTEM_EVENT_CATEGORIES,
} from '../src/utils/systemRecords'

describe('system records', () => {
	it('should keep only sign-in and scheduled job events in descending time order', () => {
		const records = buildSystemEventRecords(baseSystemRecords)

		expect(records.length).toBeGreaterThan(0)
		expect(records.every((record) => SYSTEM_EVENT_CATEGORIES.includes(record.category))).toBe(true)
		expect(records.every((record, index) => index === 0 || Date.parse(records[index - 1]!.occurredAt) >= Date.parse(record.occurredAt))).toBe(true)
	})

	it('should not leak audit, notification or alert records into system events', () => {
		const mixed: SystemRecordEntry[] = [
			...baseSystemRecords,
			{ ...baseSystemRecords[0]!, id: 'fake-alert', category: 'alert' },
			{ ...baseSystemRecords[0]!, id: 'fake-notification', category: 'notification' },
		]

		const categories = new Set(buildSystemEventRecords(mixed).map((record) => record.category))

		expect(categories).toEqual(new Set(['auth', 'job']))
	})

	it('should give every system event something to show when expanded', () => {
		const records = buildSystemEventRecords(baseSystemRecords)

		expect(records.every((record) => (record.details?.length ?? 0) > 0)).toBe(true)
	})

	it('should clone details so the view cannot mutate the source records', () => {
		const [first] = buildSystemEventRecords(baseSystemRecords)
		first!.details![0]!.value = '已修改'

		const [again] = buildSystemEventRecords(baseSystemRecords)
		expect(again!.details![0]!.value).not.toBe('已修改')
	})

	it('should merge base audits with inspection audits newest first', () => {
		const inspection: SystemRecordEntry = {
			...baseSystemRecords.find((record) => record.category === 'audit')!,
			id: 'inspection-latest',
			occurredAt: '2026-09-17T00:00:00.000Z',
		}

		const records = buildAuditRecords(baseSystemRecords, [inspection])

		expect(records[0]?.id).toBe('inspection-latest')
		expect(records.every((record) => record.category === 'audit')).toBe(true)
	})

	it('should calculate recent ranges from the current time instead of the latest record', () => {
		const now = Date.parse('2026-08-31T06:00:00.000Z')

		expect(getSystemRecordTimeCutoff('1h', now)).toBe(Date.parse('2026-08-31T05:00:00.000Z'))
		expect(getSystemRecordTimeCutoff('24h', now)).toBe(Date.parse('2026-08-30T06:00:00.000Z'))
		expect(getSystemRecordTimeCutoff('all', now)).toBe(Number.NEGATIVE_INFINITY)
	})
})

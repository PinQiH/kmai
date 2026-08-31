import { describe, expect, it } from 'vitest'

import { alertEvents } from '../src/mocks/monitoring'
import { notifications } from '../src/mocks/notifications'
import { baseSystemRecords } from '../src/mocks/systemRecords'
import { buildSystemRecords, getSystemRecordTimeCutoff } from '../src/utils/systemRecords'

describe('system records', () => {
	it('should merge base notification and alert records in descending time order', () => {
		const records = buildSystemRecords(baseSystemRecords, notifications, alertEvents)

		expect(records.some((record) => record.category === 'notification')).toBe(true)
		expect(records.some((record) => record.category === 'alert')).toBe(true)
		expect(records.every((record, index) => index === 0 || Date.parse(records[index - 1]!.occurredAt) >= Date.parse(record.occurredAt))).toBe(true)
	})

	it('should link notification and alert records back to their management pages', () => {
		const records = buildSystemRecords(baseSystemRecords, notifications, alertEvents)
		const notificationRecord = records.find((record) => record.category === 'notification')
		const alertRecord = records.find((record) => record.category === 'alert')

		expect(notificationRecord?.sourceTo).toContain('/admin/notifications?notificationId=')
		expect(alertRecord?.sourceTo).toContain('/admin/monitoring?tab=alerts&eventId=')
		expect(records.find((record) => record.id === 'record-audit-document')?.sourceTo).toBe('/admin/documents/doc-001/manage')
	})

	it('should calculate recent ranges from the current time instead of the latest record', () => {
		const now = Date.parse('2026-08-31T06:00:00.000Z')

		expect(getSystemRecordTimeCutoff('1h', now)).toBe(Date.parse('2026-08-31T05:00:00.000Z'))
		expect(getSystemRecordTimeCutoff('24h', now)).toBe(Date.parse('2026-08-30T06:00:00.000Z'))
		expect(getSystemRecordTimeCutoff('all', now)).toBe(Number.NEGATIVE_INFINITY)
	})

	it('should reflect a changed alert status when records are rebuilt', () => {
		const changedEvents = alertEvents.map((event, index) => index === 0 ? { ...event, status: 'silenced' as const } : event)
		const records = buildSystemRecords(baseSystemRecords, notifications, changedEvents)
		const changedRecord = records.find((record) => record.sourceId === changedEvents[0]?.id)

		expect(changedRecord?.statusLabel).toBe('已靜音')
	})

	it('should represent a future notification as a schedule operation', () => {
		const futureNotification = {
			...notifications[0]!,
			id: 'scheduled-notification',
			createdAt: '2026-08-31T03:00:00.000Z',
			sentAt: '2026-09-01T03:00:00.000Z',
		}
		const records = buildSystemRecords(
			baseSystemRecords,
			[futureNotification],
			alertEvents,
			new Date('2026-08-31T04:00:00.000Z'),
		)
		const scheduledRecord = records.find((record) => record.sourceId === futureNotification.id)

		expect(scheduledRecord?.occurredAt).toBe(futureNotification.createdAt)
		expect(scheduledRecord?.statusLabel).toBe('已排程')
		expect(scheduledRecord?.title).toContain('已排程')
	})
})

import { describe, expect, it } from 'vitest'

import { alertEvents } from '../src/mocks/monitoring'
import { notifications } from '../src/mocks/notifications'
import { baseSystemRecords } from '../src/mocks/systemRecords'
import { buildSystemRecords, getSystemRecordTimeCutoff } from '../src/utils/systemRecords'
import type { AssistantAuditSession } from '../src/types'

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

	it('should index an assistant session as one AI system record', () => {
		const assistantSession: AssistantAuditSession = {
			id: 'assistant-session-1',
			userId: 'user-current',
			userName: '王小明',
			department: '產品企劃部',
			startedAt: '2026-08-31T04:00:00.000Z',
			endedAt: '2026-08-31T04:05:00.000Z',
			status: 'completed',
			endReason: 'manual_end',
			modelLabel: 'Mock model',
			durationMs: 300000,
			messages: [{
				id: 'message-1',
				role: 'user',
				content: '如何使用通知管理？',
				createdAt: '2026-08-31T04:00:00.000Z',
				pageTitle: '通知管理',
				routePath: '/admin/notifications',
				sourceId: 'model',
				sourceKind: 'model',
				sourceLabel: '模型一般知識',
				webSearchEnabled: false,
				requestId: 'request-1',
				redactedFields: [],
			}],
		}

		const records = buildSystemRecords(baseSystemRecords, notifications, alertEvents, new Date(), [assistantSession])
		const record = records.find((item) => item.sourceId === assistantSession.id)

		expect(record?.category).toBe('ai')
		expect(record?.title).toBe('後台 AI 小幫手對話')
		expect(record?.sourceTo).toBe('/admin/logs?assistantSessionId=assistant-session-1')
	})
})

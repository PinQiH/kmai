import { describe, expect, it } from 'vitest'

import {
	getAdminDocumentsSnapshot,
	getHealthMetricsSnapshot,
	getRecentActivitiesSnapshot,
} from '@/repositories/admin.repository'
import {
	getAlertEventsSnapshot,
	getAlertRulesSnapshot,
	getLogEntriesSnapshot,
	getServiceHealthSnapshot,
	getServiceMetricsSnapshot,
} from '@/repositories/monitoring.repository'

describe('mock repository snapshots', () => {
	it('should return independent admin document snapshots', () => {
		const firstSnapshot = getAdminDocumentsSnapshot()
		const secondSnapshot = getAdminDocumentsSnapshot()

		firstSnapshot[0]!.source.name = 'mutated source'
		firstSnapshot[0]!.tags.push('mutated tag')

		expect(secondSnapshot[0]!.source.name).not.toBe('mutated source')
		expect(secondSnapshot[0]!.tags).not.toContain('mutated tag')
	})

	it('should return independent admin metric and activity snapshots', () => {
		const metrics = getHealthMetricsSnapshot()
		const activities = getRecentActivitiesSnapshot()

		metrics[0]!.value = -1
		activities[0]!.title = 'mutated activity'

		expect(getHealthMetricsSnapshot()[0]!.value).not.toBe(-1)
		expect(getRecentActivitiesSnapshot()[0]!.title).not.toBe('mutated activity')
	})

	it('should return independent monitoring snapshots including nested data', () => {
		const metrics = getServiceMetricsSnapshot()
		const health = getServiceHealthSnapshot()
		const logs = getLogEntriesSnapshot()
		const rules = getAlertRulesSnapshot()
		const events = getAlertEventsSnapshot()

		metrics[0]!.series.push(-1)
		health[0]!.status = 'down'
		logs[0]!.fields.mutated = true
		rules[0]!.enabled = !rules[0]!.enabled
		events[0]!.status = 'resolved'

		expect(getServiceMetricsSnapshot()[0]!.series).not.toContain(-1)
		expect(getServiceHealthSnapshot()[0]!.status).not.toBe('down')
		expect(getLogEntriesSnapshot()[0]!.fields).not.toHaveProperty('mutated')
		expect(getAlertRulesSnapshot()[0]!.enabled).not.toBe(rules[0]!.enabled)
		expect(getAlertEventsSnapshot()[0]!.status).not.toBe('resolved')
	})
})

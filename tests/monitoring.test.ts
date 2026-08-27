import { describe, expect, it } from 'vitest'

import { alertEvents, alertRules, logEntries } from '../src/mocks/monitoring'
import {
	ALL_FILTER,
	buildSparkline,
	countLogLevels,
	describeAlertRule,
	filterLogEntries,
	isValidEmail,
	parseEmailList,
	summarizeAlertEvents,
} from '../src/utils/monitoring'
import type { LogEntry } from '../src/types'

function findRule(ruleId: string) {
	const rule = alertRules.find((item) => item.id === ruleId)
	if (!rule) throw new Error(`測試資料缺少規則 ${ruleId}`)
	return rule
}

describe('sparkline geometry', () => {
	it('should map first and last sample to both ends of the view box', () => {
		const geometry = buildSparkline([1, 5, 3], 240, 40)

		expect(geometry.linePath.startsWith('M0 ')).toBe(true)
		expect(geometry.lastPoint?.x).toBe(240)
	})

	it('should place a flat series on the vertical center instead of the top edge', () => {
		const geometry = buildSparkline([7, 7, 7], 240, 40)

		expect(geometry.lastPoint?.y).toBe(20)
	})

	it('should still draw a line for a single sample', () => {
		const geometry = buildSparkline([42], 240, 40)

		expect(geometry.linePath).toContain('L')
		expect(geometry.lastPoint?.x).toBe(240)
	})

	it('should return empty paths for an empty series', () => {
		const geometry = buildSparkline([], 240, 40)

		expect(geometry.linePath).toBe('')
		expect(geometry.areaPath).toBe('')
		expect(geometry.lastPoint).toBeNull()
	})

	it('should close the area path back to the base line', () => {
		const geometry = buildSparkline([1, 4], 240, 40)

		expect(geometry.areaPath.endsWith('L0 40 Z')).toBe(true)
	})
})

describe('log filtering', () => {
	it('should keep every entry when no filter is applied', () => {
		const filtered = filterLogEntries(logEntries, { service: ALL_FILTER, level: ALL_FILTER, keyword: '' })

		expect(filtered).toHaveLength(logEntries.length)
	})

	it('should combine service and level conditions', () => {
		const filtered = filterLogEntries(logEntries, { service: 'llm-gateway', level: 'error', keyword: '' })

		expect(filtered.length).toBeGreaterThan(0)
		expect(filtered.every((entry) => entry.service === 'llm-gateway' && entry.level === 'error')).toBe(true)
	})

	it('should match trace id case-insensitively', () => {
		const filtered = filterLogEntries(logEntries, { service: ALL_FILTER, level: ALL_FILTER, keyword: 'TRC-9F13A2' })

		expect(filtered).toHaveLength(1)
		expect(filtered[0].traceId).toBe('trc-9f13a2')
	})

	it('should ignore surrounding spaces in the keyword', () => {
		const filtered = filterLogEntries(logEntries, { service: ALL_FILTER, level: ALL_FILTER, keyword: '  SMTP  ' })

		expect(filtered.length).toBeGreaterThan(0)
	})

	it('should count every level including the ones with no entry', () => {
		const entries: LogEntry[] = logEntries.filter((entry) => entry.level === 'error')
		const counts = countLogLevels(entries)

		expect(counts.error).toBe(entries.length)
		expect(counts.debug).toBe(0)
	})
})

describe('alert rules', () => {
	it('should describe a rule with its metric, threshold and duration', () => {
		expect(describeAlertRule(findRule('rule-latency'))).toBe('回答延遲 p95 > 4 秒，持續 5 分鐘')
	})

	it('should keep the percent sign next to the number', () => {
		expect(describeAlertRule(findRule('rule-error'))).toBe('請求錯誤率 > 3%，持續 10 分鐘')
	})

	it('should summarize event status and count critical firing separately', () => {
		const summary = summarizeAlertEvents(alertEvents)

		expect(summary.firing + summary.resolved + summary.silenced).toBe(alertEvents.length)
		expect(summary.criticalFiring).toBe(
			alertEvents.filter((event) => event.status === 'firing' && event.severity === 'critical').length,
		)
	})

	it('should return zeros for an empty event list', () => {
		expect(summarizeAlertEvents([])).toEqual({ firing: 0, resolved: 0, silenced: 0, criticalFiring: 0 })
	})
})

describe('email recipients', () => {
	it('should accept a normal company address', () => {
		expect(isValidEmail('ops@company.com')).toBe(true)
	})

	it('should reject addresses without a domain suffix or with spaces', () => {
		expect(isValidEmail('ops@company')).toBe(false)
		expect(isValidEmail('ops @company.com')).toBe(false)
		expect(isValidEmail('')).toBe(false)
	})

	it('should split pasted recipients by comma, semicolon and whitespace', () => {
		expect(parseEmailList('a@company.com, b@company.com; c@company.com\nd@company.com')).toEqual([
			'a@company.com',
			'b@company.com',
			'c@company.com',
			'd@company.com',
		])
	})

	it('should drop duplicates case-insensitively and keep the first spelling', () => {
		expect(parseEmailList('Ops@company.com ops@company.com')).toEqual(['Ops@company.com'])
	})

	it('should return an empty list for blank input', () => {
		expect(parseEmailList('   ')).toEqual([])
	})
})

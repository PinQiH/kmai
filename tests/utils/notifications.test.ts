import { describe, expect, it } from 'vitest'

import type { AppNotification } from '../src/types'
import {
	formatElapsedTime,
	formatNotificationMenuTimestamp,
	formatNotificationScheduleInput,
	formatNotificationTimestamp,
	getNotificationActionTargetKind,
	isNotificationScheduled,
	normalizeNotificationActionTarget,
	parseNotificationSchedule,
	summarizeNotificationPerformance,
} from '../src/utils/notifications'

function buildNotification(overrides: Partial<AppNotification> = {}): AppNotification {
	return {
		id: 'notification-test',
		title: '測試通知',
		body: '測試內容',
		priority: 'normal',
		source: 'manual',
		sourceLabel: '管理員發送',
		audienceLabel: '全體使用者',
		actionLabel: null,
		actionTo: null,
		createdAt: '2026-08-31T02:00:00.000Z',
		sentAt: '2026-08-31T02:00:00.000Z',
		createdBy: '林怡君',
		recipients: [],
		...overrides,
	}
}

describe('notification performance', () => {
	it('should return zero metrics when notification has no recipients', () => {
		expect(summarizeNotificationPerformance(buildNotification())).toEqual({
			targetedCount: 0,
			viewedCount: 0,
			unviewedCount: 0,
			viewRate: 0,
			averageTimeToViewSeconds: null,
			actionClickedCount: 0,
			actionClickRate: 0,
		})
	})

	it('should calculate unique viewers and average first view time when recipients are mixed', () => {
		const notification = buildNotification({
			recipients: [
				{
					userId: 'user-1',
					deliveredAt: '2026-08-31T02:00:00.000Z',
					readAt: '2026-08-31T02:01:00.000Z',
					firstViewedAt: '2026-08-31T02:01:00.000Z',
					lastViewedAt: '2026-08-31T02:02:00.000Z',
					viewCount: 2,
					firstActionClickedAt: '2026-08-31T02:02:10.000Z',
					lastActionClickedAt: '2026-08-31T02:02:10.000Z',
					actionClickCount: 1,
				},
				{
					userId: 'user-2',
					deliveredAt: '2026-08-31T02:00:00.000Z',
					readAt: '2026-08-31T02:03:00.000Z',
					firstViewedAt: '2026-08-31T02:03:00.000Z',
					lastViewedAt: '2026-08-31T02:03:00.000Z',
					viewCount: 1,
					firstActionClickedAt: null,
					lastActionClickedAt: null,
					actionClickCount: 0,
				},
				{
					userId: 'user-3',
					deliveredAt: '2026-08-31T02:00:00.000Z',
					readAt: null,
					firstViewedAt: null,
					lastViewedAt: null,
					viewCount: 0,
					firstActionClickedAt: null,
					lastActionClickedAt: null,
					actionClickCount: 0,
				},
			],
		})

		expect(summarizeNotificationPerformance(notification)).toEqual({
			targetedCount: 3,
			viewedCount: 2,
			unviewedCount: 1,
			viewRate: 66.7,
			averageTimeToViewSeconds: 120,
			actionClickedCount: 1,
			actionClickRate: 33.3,
		})
	})

	it('should exclude invalid timestamps from average without dropping viewed count', () => {
		const notification = buildNotification({
			recipients: [
				{
					userId: 'user-1',
					deliveredAt: 'invalid',
					readAt: '2026-08-31T02:01:00.000Z',
					firstViewedAt: '2026-08-31T02:01:00.000Z',
					lastViewedAt: '2026-08-31T02:01:00.000Z',
					viewCount: 1,
					firstActionClickedAt: null,
					lastActionClickedAt: null,
					actionClickCount: 0,
				},
			],
		})

		expect(summarizeNotificationPerformance(notification)).toMatchObject({
			viewedCount: 1,
			averageTimeToViewSeconds: null,
		})
	})
})

describe('notification action target validation', () => {
	it('should accept internal paths and http or https URLs', () => {
		expect(getNotificationActionTargetKind('/library?tab=recent')).toBe('internal')
		expect(getNotificationActionTargetKind('https://example.com/guide')).toBe('external')
		expect(getNotificationActionTargetKind('http://localhost:4173/demo')).toBe('external')
	})

	it('should reject dangerous or protocol-relative URLs', () => {
		expect(getNotificationActionTargetKind('javascript:alert(1)')).toBe('invalid')
		expect(getNotificationActionTargetKind('data:text/html,test')).toBe('invalid')
		expect(getNotificationActionTargetKind('//example.com')).toBe('invalid')
		expect(normalizeNotificationActionTarget('  https://example.com/path  ')).toBe('https://example.com/path')
	})
})

describe('notification time formatting', () => {
	it('should omit the year and seconds when formatting a menu timestamp', () => {
		expect(formatNotificationMenuTimestamp('2026-08-31T02:15:08.000Z')).toBe('08/31 10:15')
	})

	it('should return a dash when a menu timestamp is missing or invalid', () => {
		expect(formatNotificationMenuTimestamp(null)).toBe('—')
		expect(formatNotificationMenuTimestamp('invalid')).toBe('—')
	})

	it('should include seconds when formatting a valid timestamp', () => {
		const formatted = formatNotificationTimestamp('2026-08-31T02:15:08.000Z')

		expect(formatted).toContain('10:15:08')
	})

	it('should return a dash when timestamp is missing or invalid', () => {
		expect(formatNotificationTimestamp(null)).toBe('—')
		expect(formatNotificationTimestamp('invalid')).toBe('—')
	})

	it('should format elapsed seconds as seconds or minutes and seconds', () => {
		expect(formatElapsedTime(42)).toBe('42 秒')
		expect(formatElapsedTime(125)).toBe('2 分 5 秒')
		expect(formatElapsedTime(null)).toBe('—')
	})

	it('should parse and format a datetime-local schedule value', () => {
		const localValue = formatNotificationScheduleInput(new Date(2026, 7, 31, 10, 5))

		expect(localValue).toBe('2026-08-31T10:05')
		expect(parseNotificationSchedule(localValue)).toBeDefined()
		expect(parseNotificationSchedule('')).toBeUndefined()
		expect(parseNotificationSchedule('invalid')).toBeUndefined()
	})

	it('should identify a notification whose send time is still in the future', () => {
		const notification = buildNotification({ sentAt: '2026-08-31T03:00:00.000Z' })

		expect(isNotificationScheduled(notification, new Date('2026-08-31T02:00:00.000Z'))).toBe(true)
		expect(isNotificationScheduled(notification, new Date('2026-08-31T04:00:00.000Z'))).toBe(false)
	})
})

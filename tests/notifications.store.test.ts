import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { CURRENT_NOTIFICATION_USER_ID } from '../src/mocks/notifications'
import { useMonitoringStore } from '../src/stores/monitoring'
import { useNotificationsStore } from '../src/stores/notifications'
import type { NotificationRuleInput, SendNotificationInput } from '../src/types'

function buildInput(overrides: Partial<SendNotificationInput> = {}): SendNotificationInput {
	return {
		title: ' 新通知 ',
		body: ' 通知內容 ',
		priority: 'normal',
		audienceType: 'all',
		targetDepartment: null,
		targetRole: null,
		targetUserIds: [],
		actionLabel: null,
		actionTo: null,
		...overrides,
	}
}

function buildRuleInput(overrides: Partial<NotificationRuleInput> = {}): NotificationRuleInput {
	return {
		name: '文件完成通知',
		eventType: 'document-ready',
		title: '文件已完成',
		body: '文件已可供搜尋。',
		priority: 'normal',
		audienceType: 'all',
		targetDepartment: null,
		targetRole: null,
		targetUserIds: [],
		actionLabel: '查看說明',
		actionTo: 'https://example.com/guide',
		deliveryChannels: ['in-app'],
		isEnabled: true,
		...overrides,
	}
}

describe('notifications store', () => {
	beforeEach(() => setActivePinia(createPinia()))

	it('should send one notification to every mock user when audience is all', () => {
		const store = useNotificationsStore()
		const notificationId = store.sendNotification(buildInput(), '2026-08-31T04:00:00.000Z')
		const notification = store.notifications.find((item) => item.id === notificationId)

		expect(notification?.title).toBe('新通知')
		expect(notification?.body).toBe('通知內容')
		expect(notification?.recipients).toHaveLength(store.users.length)
		expect(notification?.recipients.every((recipient) => recipient.readAt === null)).toBe(true)
		expect(notification?.recipients.every((recipient) => recipient.firstViewedAt === null)).toBe(true)
	})

	it('should only select matching users when audience is a department', () => {
		const store = useNotificationsStore()
		const notificationId = store.sendNotification(
			buildInput({ audienceType: 'department', targetDepartment: '財務部' }),
			'2026-08-31T04:10:00.000Z',
		)
		const notification = store.notifications.find((item) => item.id === notificationId)

		expect(notification?.recipients).toHaveLength(1)
		expect(notification?.recipients[0]?.userId).toBe('user-finance')
		expect(notification?.audienceLabel).toBe('財務部')
	})

	it('should only select matching users when audience is a role', () => {
		const store = useNotificationsStore()
		const notificationId = store.sendNotification(
			buildInput({ audienceType: 'role', targetRole: 'system-admin' }),
			'2026-08-31T04:12:00.000Z',
		)
		const notification = store.notifications.find((item) => item.id === notificationId)

		expect(notification?.recipients.map((recipient) => recipient.userId)).toEqual(['user-it'])
		expect(notification?.audienceLabel).toBe('系統管理員')
	})

	it('should keep a future notification out of the user notification center', () => {
		const store = useNotificationsStore()
		const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
		const notificationId = store.sendNotification(buildInput(), scheduledAt)

		expect(store.notifications.some((notification) => notification.id === notificationId)).toBe(true)
		expect(store.currentUserNotifications.some((notification) => notification.id === notificationId)).toBe(false)

		store.refreshDeliveryClock(Date.parse(scheduledAt) + 1)
		expect(store.currentUserNotifications.some((notification) => notification.id === notificationId)).toBe(true)
	})

	it('should reject blank content and an audience with no matching users', () => {
		const store = useNotificationsStore()
		const originalCount = store.notifications.length

		expect(store.sendNotification(buildInput({ title: '   ' }))).toBeNull()
		expect(store.sendNotification(buildInput({ audienceType: 'selected', targetUserIds: [] }))).toBeNull()
		expect(store.sendNotification(buildInput(), 'not-a-date')).toBeNull()
		expect(store.notifications).toHaveLength(originalCount)
	})

	it('should preserve first viewed time while updating last viewed time and count', () => {
		const store = useNotificationsStore()
		const notification = store.currentUserNotifications.find((item) =>
			item.recipients.some((recipient) => recipient.userId === CURRENT_NOTIFICATION_USER_ID && !recipient.readAt),
		)
		expect(notification).toBeDefined()

		store.markViewed(notification!.id, CURRENT_NOTIFICATION_USER_ID, '2026-08-31T05:00:01.000Z')
		store.markViewed(notification!.id, CURRENT_NOTIFICATION_USER_ID, '2026-08-31T05:02:03.000Z')
		const recipient = notification!.recipients.find((item) => item.userId === CURRENT_NOTIFICATION_USER_ID)

		expect(recipient?.readAt).toBe('2026-08-31T05:00:01.000Z')
		expect(recipient?.firstViewedAt).toBe('2026-08-31T05:00:01.000Z')
		expect(recipient?.lastViewedAt).toBe('2026-08-31T05:02:03.000Z')
		expect(recipient?.viewCount).toBe(2)
	})

	it('should preserve first action click while updating last click without changing view count', () => {
		const store = useNotificationsStore()
		const notification = store.currentUserNotifications.find((item) => item.actionTo)
		expect(notification).toBeDefined()
		const recipient = notification!.recipients.find((item) => item.userId === CURRENT_NOTIFICATION_USER_ID)
		const originalViewCount = recipient?.viewCount

		store.markActionClicked(notification!.id, CURRENT_NOTIFICATION_USER_ID, '2026-08-31T06:00:01.000Z')
		store.markActionClicked(notification!.id, CURRENT_NOTIFICATION_USER_ID, '2026-08-31T06:02:03.000Z')

		expect(recipient?.firstActionClickedAt).toBe('2026-08-31T06:00:01.000Z')
		expect(recipient?.lastActionClickedAt).toBe('2026-08-31T06:02:03.000Z')
		expect(recipient?.actionClickCount).toBe(2)
		expect(recipient?.viewCount).toBe(originalViewCount)
	})

	it('should mark every current user notification as read without recording a view', () => {
		const store = useNotificationsStore()
		const unreadRecipients = store.currentUserNotifications
			.map((notification) =>
				notification.recipients.find((recipient) => recipient.userId === CURRENT_NOTIFICATION_USER_ID),
			)
			.filter((recipient) => recipient && !recipient.readAt)

		store.markAllRead('2026-08-31T05:10:00.000Z')

		expect(store.unreadCount).toBe(0)
		expect(unreadRecipients.every((recipient) => recipient?.readAt === '2026-08-31T05:10:00.000Z')).toBe(true)
		expect(unreadRecipients.every((recipient) => recipient?.firstViewedAt === null)).toBe(true)
		expect(unreadRecipients.every((recipient) => recipient?.viewCount === 0)).toBe(true)
	})

	it('should create automatic notification only when rule is enabled', () => {
		const store = useNotificationsStore()
		const disabledRule = store.rules.find((rule) => !rule.isEnabled)
		const enabledRule = store.rules.find((rule) => rule.isEnabled)
		expect(disabledRule).toBeDefined()
		expect(enabledRule).toBeDefined()

		expect(store.triggerAutomaticRule(disabledRule!.id, '2026-08-31T05:20:00.000Z')).toBeNull()
		const result = store.triggerAutomaticRule(enabledRule!.id, '2026-08-31T05:21:00.000Z')
		const notification = store.notifications.find((item) => item.id === result?.notificationId)

		expect(notification?.source).toBe('automatic')
		expect(notification?.sourceLabel).toBe(enabledRule?.name)
		expect(store.currentUserNotifications.some((item) => item.id === result?.notificationId)).toBe(true)
		expect(result?.emailRecipientCount).toBe(0)
		expect(store.triggerAutomaticRule(enabledRule!.id, 'not-a-date')).toBeNull()
	})

	it('should let one automatic rule send email without creating an in-app notification', () => {
		const store = useNotificationsStore()
		const originalNotificationCount = store.notifications.length
		const ruleId = store.createRule(buildRuleInput({ deliveryChannels: ['email'] }))

		expect(ruleId).not.toBeNull()
		const result = store.triggerAutomaticRule(ruleId!, '2026-08-31T05:22:00.000Z')

		expect(result?.notificationId).toBeNull()
		expect(result?.emailRecipientCount).toBe(store.users.length)
		expect(store.notifications).toHaveLength(originalNotificationCount)
	})

	it('should default mock rules to in-app delivery and reject a rule with no channel', () => {
		const store = useNotificationsStore()

		expect(store.rules.every((rule) => rule.deliveryChannels.includes('in-app'))).toBe(true)
		expect(store.createRule(buildRuleInput({ deliveryChannels: [] }))).toBeNull()
	})

	it('should create update and delete a rule without deleting notification history', () => {
		const store = useNotificationsStore()
		const originalNotificationCount = store.notifications.length
		const ruleId = store.createRule(buildRuleInput())
		expect(ruleId).not.toBeNull()
		expect(store.rules.find((rule) => rule.id === ruleId)?.eventLabel).toContain('文件完成')

		expect(store.updateRule(ruleId!, buildRuleInput({ name: '更新後規則', eventType: 'notebook-shared' }))).toBe(true)
		expect(store.rules.find((rule) => rule.id === ruleId)?.name).toBe('更新後規則')
		expect(store.rules.find((rule) => rule.id === ruleId)?.eventType).toBe('notebook-shared')

		expect(store.deleteRule(ruleId!)).toBe(true)
		expect(store.rules.some((rule) => rule.id === ruleId)).toBe(false)
		expect(store.notifications).toHaveLength(originalNotificationCount)
	})

	it('should reject a rule with an unsafe action URL', () => {
		const store = useNotificationsStore()

		expect(store.createRule(buildRuleInput({ actionTo: 'javascript:alert(1)' }))).toBeNull()
	})

	it('should reject a rule with an incomplete audience', () => {
		const store = useNotificationsStore()

		expect(
			store.createRule(buildRuleInput({ audienceType: 'department', targetDepartment: '   ' })),
		).toBeNull()
		expect(store.createRule(buildRuleInput({ audienceType: 'selected', targetUserIds: [] }))).toBeNull()
		expect(store.createRule(buildRuleInput({ audienceType: 'role', targetRole: null }))).toBeNull()
	})

	it('should support system alert lifecycle event types', () => {
		const store = useNotificationsStore()
		const triggeredRuleId = store.createRule(buildRuleInput({ eventType: 'system-alert-triggered' }))
		const resolvedRuleId = store.createRule(buildRuleInput({ eventType: 'system-alert-resolved' }))

		expect(store.rules.find((rule) => rule.id === triggeredRuleId)?.eventLabel).toBe('營運監控產生新的系統告警')
		expect(store.rules.find((rule) => rule.id === resolvedRuleId)?.eventLabel).toBe('營運監控的系統告警已解除')
	})

	it('should keep recipient group IDs stable while editing delivery targets', () => {
		const store = useNotificationsStore()
		const monitoringStore = useMonitoringStore()
		const group = store.recipientGroups[0]
		expect(group).toBeDefined()
		const rule = monitoringStore.rules.find((item) => item.recipientGroupId === group?.id)

		const addedCount = store.addRecipientEmails(group!.id, ['new.operator@company.com'])
		store.updateRecipientGroupSeverities(group!.id, ['critical', 'warning'])

		expect(addedCount).toBe(1)
		expect(group?.emails).toContain('new.operator@company.com')
		expect(group?.severities).toEqual(['critical', 'warning'])
		expect(rule?.recipientGroupId).toBe(group?.id)
	})

	it('should save non-secret email channel settings without SMTP credentials', () => {
		const store = useNotificationsStore()
		store.saveEmailSettings({
			...store.emailSettings,
			senderName: 'Cubi 系統通知',
			repeatIntervalMinutes: 60,
		})

		expect(store.emailSettings.senderName).toBe('Cubi 系統通知')
		expect(store.emailSettings.repeatIntervalMinutes).toBe(60)
		expect(Object.keys(store.emailSettings)).not.toContain('password')
	})

	it('should return false when viewing or toggling a missing record', () => {
		const store = useNotificationsStore()

		expect(store.markViewed('missing-notification')).toBe(false)
		expect(store.markActionClicked('missing-notification')).toBe(false)
		expect(store.setRuleEnabled('missing-rule', true)).toBe(false)
	})
})

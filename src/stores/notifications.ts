import { defineStore } from 'pinia'

import {
	automaticNotificationRules,
	CURRENT_NOTIFICATION_USER_ID,
	notifications,
	notificationUsers,
} from '@/mocks/notifications'
import type {
	AppNotification,
	AutomaticNotificationRule,
	NotificationAudienceType,
	NotificationEventType,
	NotificationRecipient,
	NotificationRole,
	NotificationRuleInput,
	NotificationUser,
	SendNotificationInput,
} from '@/types'
import { normalizeNotificationActionTarget } from '@/utils/notifications'

interface NotificationsState {
	notifications: AppNotification[]
	rules: AutomaticNotificationRule[]
	users: NotificationUser[]
	deliveryClock: number
}

const NOTIFICATION_EVENT_LABELS: Record<NotificationEventType, string> = {
	'document-ready': '文件完成解析、切塊與向量化',
	'document-failed': '文件解析或向量化失敗',
	'document-review-required': '文件進入待審核狀態',
	'document-expiring': '文件即將到期，需要重新確認內容',
	'notebook-shared': '使用者被加入共用筆記本',
	'notebook-mentioned': '使用者在筆記本留言中被提及',
	'permission-granted': '使用者取得文件或資料夾權限',
	'system-maintenance': '系統維護時段即將開始',
}

function cloneNotification(notification: AppNotification): AppNotification {
	return {
		...notification,
		recipients: notification.recipients.map((recipient) => ({ ...recipient })),
	}
}

function cloneRule(rule: AutomaticNotificationRule): AutomaticNotificationRule {
	return { ...rule, targetUserIds: [...rule.targetUserIds] }
}

function resolveAudienceUsers(
	users: NotificationUser[],
	audienceType: NotificationAudienceType,
	targetDepartment: string | null,
	targetRole: NotificationRole | null,
	targetUserIds: string[],
): NotificationUser[] {
	if (audienceType === 'all') return [...users]
	if (audienceType === 'department') return users.filter((user) => user.department === targetDepartment)
	if (audienceType === 'role') return users.filter((user) => user.role === targetRole)

	const targetIds = new Set(targetUserIds)
	return users.filter((user) => targetIds.has(user.id))
}

function buildAudienceLabel(
	audienceType: NotificationAudienceType,
	recipients: NotificationUser[],
	targetDepartment: string | null,
	targetRole: NotificationRole | null,
): string {
	if (audienceType === 'all') return '全體使用者'
	if (audienceType === 'department') return targetDepartment ?? '未指定部門'
	if (audienceType === 'role') return recipients[0]?.roleLabel ?? targetRole ?? '未指定角色'
	if (recipients.length === 1) return `指定使用者（${recipients[0]?.name ?? '未知'}）`
	return `指定使用者（${recipients.length} 人）`
}

function buildRecipient(userId: string, deliveredAt: string): NotificationRecipient {
	return {
		userId,
		deliveredAt,
		readAt: null,
		firstViewedAt: null,
		lastViewedAt: null,
		viewCount: 0,
		firstActionClickedAt: null,
		lastActionClickedAt: null,
		actionClickCount: 0,
	}
}

function normalizeRuleInput(input: NotificationRuleInput): NotificationRuleInput | null {
	const name = input.name.trim()
	const title = input.title.trim()
	const body = input.body.trim()
	const actionTo = normalizeNotificationActionTarget(input.actionTo)
	const hasValidAudience =
		input.audienceType === 'all' ||
		(input.audienceType === 'department' && Boolean(input.targetDepartment?.trim())) ||
		(input.audienceType === 'role' && Boolean(input.targetRole)) ||
		(input.audienceType === 'selected' && input.targetUserIds.length > 0)
	if (!name || !title || !body || actionTo === undefined || !hasValidAudience) return null

	return {
		...input,
		name,
		title,
		body,
		targetDepartment: input.audienceType === 'department' ? input.targetDepartment?.trim() || null : null,
		targetRole: input.audienceType === 'role' ? input.targetRole : null,
		targetUserIds: input.audienceType === 'selected' ? [...new Set(input.targetUserIds)] : [],
		actionTo,
		actionLabel: actionTo ? input.actionLabel?.trim() || '查看詳情' : null,
	}
}

function buildRule(ruleId: string, input: NotificationRuleInput): AutomaticNotificationRule {
	return {
		id: ruleId,
		...input,
		eventLabel: NOTIFICATION_EVENT_LABELS[input.eventType],
	}
}

export const useNotificationsStore = defineStore('notifications', {
	state: (): NotificationsState => ({
		notifications: notifications.map(cloneNotification),
		rules: automaticNotificationRules.map(cloneRule),
		users: notificationUsers.map((user) => ({ ...user })),
		deliveryClock: Date.now(),
	}),
	getters: {
		currentUserNotifications: (state): AppNotification[] =>
			state.notifications
				.filter((notification) =>
					Date.parse(notification.sentAt) <= state.deliveryClock
					&& notification.recipients.some((recipient) => recipient.userId === CURRENT_NOTIFICATION_USER_ID),
				)
				.sort((left, right) => Date.parse(right.sentAt) - Date.parse(left.sentAt)),
		unreadCount(): number {
			return this.currentUserNotifications.filter((notification) => {
				const recipient = notification.recipients.find((item) => item.userId === CURRENT_NOTIFICATION_USER_ID)
				return !recipient?.readAt
			}).length
		},
		departments: (state): string[] => Array.from(new Set(state.users.map((user) => user.department))).sort(),
	},
	actions: {
		/**
		 * 以 Mock 使用者清單建立立即或排程通知。
		 * @param input 通知內容與受眾。
		 * @param sentAt 指定發送時間，測試可傳入固定值。
		 * @returns 新通知識別碼；資料不完整或沒有收件人時回傳 null。
		 */
		sendNotification(
			input: SendNotificationInput,
			sentAt = new Date().toISOString(),
			createdAt = new Date().toISOString(),
		): string | null {
			const title = input.title.trim()
			const body = input.body.trim()
			const actionTo = normalizeNotificationActionTarget(input.actionTo)
			if (
				!title
				|| !body
				|| actionTo === undefined
				|| !Number.isFinite(Date.parse(sentAt))
				|| !Number.isFinite(Date.parse(createdAt))
			) return null

			const recipients = resolveAudienceUsers(
				this.users,
				input.audienceType,
				input.targetDepartment,
				input.targetRole,
				input.targetUserIds,
			)
			if (recipients.length === 0) return null

			const notificationId = `notification-${Date.parse(sentAt)}-${this.notifications.length + 1}`
			const notification: AppNotification = {
				id: notificationId,
				title,
				body,
				priority: input.priority,
				source: 'manual',
				sourceLabel: '管理員發送',
				audienceLabel: buildAudienceLabel(input.audienceType, recipients, input.targetDepartment, input.targetRole),
				actionLabel: actionTo ? input.actionLabel?.trim() || '查看詳情' : null,
				actionTo,
				createdAt,
				sentAt,
				createdBy: '林怡君',
				recipients: recipients.map((user) => buildRecipient(user.id, sentAt)),
			}

			this.notifications.unshift(notification)
			this.deliveryClock = Date.now()
			return notificationId
		},
		/**
		 * 更新前台判斷排程通知是否已到發送時間的基準時鐘。
		 * @param now 目前時間戳，測試可傳入固定值。
		 */
		refreshDeliveryClock(now = Date.now()): void {
			this.deliveryClock = now
		},
		/**
		 * 記錄單一使用者開啟通知的時間。
		 * @param notificationId 通知識別碼。
		 * @param userId 使用者識別碼。
		 * @param viewedAt 查看時間，測試可傳入固定值。
		 * @returns 是否找到對應收件紀錄並完成更新。
		 */
		markViewed(
			notificationId: string,
			userId = CURRENT_NOTIFICATION_USER_ID,
			viewedAt = new Date().toISOString(),
		): boolean {
			const notification = this.notifications.find((item) => item.id === notificationId)
			const recipient = notification?.recipients.find((item) => item.userId === userId)
			if (!recipient) return false

			recipient.readAt ??= viewedAt
			recipient.firstViewedAt ??= viewedAt
			recipient.lastViewedAt = viewedAt
			recipient.viewCount += 1
			return true
		},
		/**
		 * 記錄單一使用者點擊通知行動按鈕的時間。
		 * @param notificationId 通知識別碼。
		 * @param userId 使用者識別碼。
		 * @param clickedAt 點擊時間，測試可傳入固定值。
		 * @returns 通知有行動目標且找到收件紀錄時回傳 true。
		 */
		markActionClicked(
			notificationId: string,
			userId = CURRENT_NOTIFICATION_USER_ID,
			clickedAt = new Date().toISOString(),
		): boolean {
			const notification = this.notifications.find((item) => item.id === notificationId)
			if (!notification?.actionTo) return false

			const recipient = notification.recipients.find((item) => item.userId === userId)
			if (!recipient) return false

			recipient.firstActionClickedAt ??= clickedAt
			recipient.lastActionClickedAt = clickedAt
			recipient.actionClickCount += 1
			return true
		},
		/**
		 * 將目前使用者的所有通知標示為已讀，但不計入查看成效。
		 * @param readAt 已讀時間，測試可傳入固定值。
		 */
		markAllRead(readAt = new Date().toISOString()): void {
			this.currentUserNotifications.forEach((notification) => {
				const recipient = notification.recipients.find((item) => item.userId === CURRENT_NOTIFICATION_USER_ID)
				if (!recipient || recipient.readAt) return
				recipient.readAt = readAt
			})
		},
		/**
		 * 啟用或停用自動通知規則。
		 * @param ruleId 規則識別碼。
		 * @param isEnabled 新的啟用狀態。
		 * @returns 是否找到規則。
		 */
		setRuleEnabled(ruleId: string, isEnabled: boolean): boolean {
			const rule = this.rules.find((item) => item.id === ruleId)
			if (!rule) return false

			rule.isEnabled = isEnabled
			return true
		},
		/**
		 * 新增自動通知規則。
		 * @param input 規則內容。
		 * @returns 新規則識別碼；資料無效時回傳 null。
		 */
		createRule(input: NotificationRuleInput): string | null {
			const normalizedInput = normalizeRuleInput(input)
			if (!normalizedInput) return null

			const ruleId = `rule-notification-${Date.now()}-${this.rules.length + 1}`
			this.rules.push(buildRule(ruleId, normalizedInput))
			return ruleId
		},
		/**
		 * 更新既有自動通知規則。
		 * @param ruleId 規則識別碼。
		 * @param input 規則內容。
		 * @returns 是否完成更新。
		 */
		updateRule(ruleId: string, input: NotificationRuleInput): boolean {
			const ruleIndex = this.rules.findIndex((rule) => rule.id === ruleId)
			const normalizedInput = normalizeRuleInput(input)
			if (ruleIndex < 0 || !normalizedInput) return false

			this.rules[ruleIndex] = buildRule(ruleId, normalizedInput)
			return true
		},
		/**
		 * 刪除自動通知規則，但保留已建立的通知。
		 * @param ruleId 規則識別碼。
		 * @returns 是否找到並刪除規則。
		 */
		deleteRule(ruleId: string): boolean {
			const ruleIndex = this.rules.findIndex((rule) => rule.id === ruleId)
			if (ruleIndex < 0) return false

			this.rules.splice(ruleIndex, 1)
			return true
		},
		/**
		 * 模擬指定事件發生並依規則產生通知。
		 * @param ruleId 規則識別碼。
		 * @param occurredAt 事件發生時間，測試可傳入固定值。
		 * @returns 新通知識別碼；規則不存在、停用或無收件人時回傳 null。
		 */
		triggerAutomaticRule(ruleId: string, occurredAt = new Date().toISOString()): string | null {
			const rule = this.rules.find((item) => item.id === ruleId)
			if (!rule?.isEnabled || !Number.isFinite(Date.parse(occurredAt))) return null

			const recipients = resolveAudienceUsers(
				this.users,
				rule.audienceType,
				rule.targetDepartment,
				rule.targetRole,
				rule.targetUserIds,
			)
			if (recipients.length === 0) return null

			const notificationId = `notification-${rule.eventType}-${Date.parse(occurredAt)}-${this.notifications.length + 1}`
			this.notifications.unshift({
				id: notificationId,
				title: rule.title,
				body: rule.body,
				priority: rule.priority,
				source: 'automatic',
				sourceLabel: rule.name,
				audienceLabel: buildAudienceLabel(rule.audienceType, recipients, rule.targetDepartment, rule.targetRole),
				actionLabel: rule.actionLabel,
				actionTo: rule.actionTo,
				createdAt: occurredAt,
				sentAt: occurredAt,
				createdBy: '系統自動通知',
				recipients: recipients.map((user) => buildRecipient(user.id, occurredAt)),
			})
			this.deliveryClock = Date.now()
			return notificationId
		},
	},
})

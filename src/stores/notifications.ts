import { defineStore } from 'pinia'

import {
	CURRENT_NOTIFICATION_USER_ID,
	getAutomaticNotificationRulesSnapshot,
	getEmailChannelSettingsSnapshot,
	getNotificationsSnapshot,
	getNotificationUsersSnapshot,
	getRecipientGroupsSnapshot,
} from '@/repositories/notifications.repository'
import type {
	AlertSeverity,
	AppNotification,
	AutomaticNotificationTriggerResult,
	AutomaticNotificationRule,
	EmailChannelSettings,
	NotificationAudienceType,
	NotificationEventType,
	NotificationRecipient,
	NotificationRole,
	NotificationRuleInput,
	NotificationUser,
	RecipientGroup,
	SendNotificationInput,
} from '@/types'
import { normalizeNotificationActionTarget } from '@/utils/notifications'

interface NotificationsState {
	notifications: AppNotification[]
	rules: AutomaticNotificationRule[]
	users: NotificationUser[]
	recipientGroups: RecipientGroup[]
	emailSettings: EmailChannelSettings
	deliveryClock: number
}

export const ALERT_SEVERITY_LABELS: Record<AlertSeverity, string> = {
	critical: '嚴重',
	warning: '警告',
	info: '資訊',
}

const NOTIFICATION_EVENT_LABELS: Record<NotificationEventType, string> = {
	'document-ready': '文件完成解析、切塊與向量化',
	'document-failed': '文件解析或向量化失敗',
	'document-review-required': '文件進入待審核狀態',
	'document-expiring': '文件即將到期，需要重新確認內容',
	'notebook-shared': '使用者被加入共用筆記本',
	'notebook-mentioned': '使用者在筆記本留言中被提及',
	'permission-granted': '使用者取得文件或資料夾權限',
	'system-alert-triggered': '營運監控產生新的系統告警',
	'system-alert-resolved': '營運監控的系統告警已解除',
	'system-maintenance': '系統維護時段即將開始',
}

function cloneNotification(notification: AppNotification): AppNotification {
	return {
		...notification,
		recipients: notification.recipients.map((recipient) => ({ ...recipient })),
	}
}

function cloneRule(rule: AutomaticNotificationRule): AutomaticNotificationRule {
	return {
		...rule,
		targetUserIds: [...rule.targetUserIds],
		alertSeverities: [...rule.alertSeverities],
		deliveryChannels: [...rule.deliveryChannels],
	}
}

/** 系統告警事件；這兩種事件的規則會多一個嚴重度條件 */
export const ALERT_EVENT_TYPES: NotificationEventType[] = ['system-alert-triggered', 'system-alert-resolved']

function resolveAudienceUsers(
	users: NotificationUser[],
	audienceType: NotificationAudienceType,
	targetDepartment: string | null,
	targetRole: NotificationRole | null,
	targetUserIds: string[],
	group?: RecipientGroup,
): NotificationUser[] {
	if (audienceType === 'all') return [...users]
	if (audienceType === 'department') return users.filter((user) => user.department === targetDepartment)
	if (audienceType === 'role') return users.filter((user) => user.role === targetRole)
	// @ 收件群組同時有站內成員與外部 Email；站內通知只看成員
	if (audienceType === 'group') {
		const memberIds = new Set(group?.memberUserIds ?? [])
		return users.filter((user) => memberIds.has(user.id))
	}

	const targetIds = new Set(targetUserIds)
	return users.filter((user) => targetIds.has(user.id))
}

function buildAudienceLabel(
	audienceType: NotificationAudienceType,
	recipients: NotificationUser[],
	targetDepartment: string | null,
	targetRole: NotificationRole | null,
	group?: RecipientGroup,
): string {
	if (audienceType === 'group') return group ? `收件群組（${group.name}）` : '收件群組'
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
		(input.audienceType === 'group' && Boolean(input.targetGroupId)) ||
		(input.audienceType === 'selected' && input.targetUserIds.length > 0)
	if (!name || !title || !body || actionTo === undefined || !hasValidAudience || input.deliveryChannels.length === 0) return null

	return {
		...input,
		name,
		title,
		body,
		targetDepartment: input.audienceType === 'department' ? input.targetDepartment?.trim() || null : null,
		targetRole: input.audienceType === 'role' ? input.targetRole : null,
		targetUserIds: input.audienceType === 'selected' ? [...new Set(input.targetUserIds)] : [],
		targetGroupId: input.audienceType === 'group' ? input.targetGroupId : null,
		alertSeverities: ALERT_EVENT_TYPES.includes(input.eventType) ? [...new Set(input.alertSeverities)] : [],
		deliveryChannels: [...new Set(input.deliveryChannels)],
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

/**
 * 組出告警通知要導向的營運監控連結。
 * @param eventId 告警事件識別碼。
 * @param status 通知對應的告警狀態。
 * @returns 已解除的告警導向告警紀錄，其餘導向系統概況的目前告警。
 */
function alertEventLink(eventId: string, status: 'triggered' | 'resolved' | 'test'): string {
	// ! 未解除的告警列在系統概況，已解除的只在告警紀錄
	const tab = status === 'resolved' ? 'alert-history' : 'overview'
	return `/admin/monitoring?tab=${tab}&eventId=${encodeURIComponent(eventId)}`
}

export const useNotificationsStore = defineStore('notifications', {
	state: (): NotificationsState => ({
		notifications: getNotificationsSnapshot().map(cloneNotification),
		rules: getAutomaticNotificationRulesSnapshot().map(cloneRule),
		users: getNotificationUsersSnapshot(),
		recipientGroups: getRecipientGroupsSnapshot(),
		emailSettings: getEmailChannelSettingsSnapshot(),
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
		/** 找出會被某個告警事件與嚴重度觸發的規則；空的嚴重度代表不分等級 */
		matchAlertRules() {
			return (eventType: NotificationEventType, severity: AlertSeverity): AutomaticNotificationRule[] =>
				this.rules.filter((rule) => rule.isEnabled
					&& rule.eventType === eventType
					&& (rule.alertSeverities.length === 0 || rule.alertSeverities.includes(severity)))
		},
		/** 以一行文字說明某個嚴重度觸發時會通知誰，供營運監控唯讀顯示 */
		describeAlertDelivery() {
			return (severity: AlertSeverity): string => {
				const matched = this.matchAlertRules('system-alert-triggered', severity)
				if (!matched.length) return '沒有對應的通知規則'
				return matched
					.map((rule) => {
						const group = this.recipientGroups.find((item) => item.id === rule.targetGroupId)
						const channels = rule.deliveryChannels.map((channel) => (channel === 'in-app' ? '站內' : 'Email')).join('＋')
						const audience = group ? group.name : rule.audienceType === 'role' ? rule.targetRole ?? '指定角色' : '指定對象'
						return `${audience}（${channels}）`
					})
					.join('、')
			}
		},
	},
	actions: {
		/**
		 * 將不重複的電子郵件加入指定收件人群組。
		 * @param groupId 收件人群組識別碼。
		 * @param emails 已完成格式驗證的電子郵件清單。
		 * @returns 實際加入的電子郵件數量。
		 */
		addRecipientEmails(groupId: string, emails: string[]): number {
			const group = this.recipientGroups.find((item) => item.id === groupId)
			if (!group) return 0

			const existingEmails = new Set(group.emails.map((email) => email.toLocaleLowerCase('en-US')))
			const addedEmails = emails.filter((email) => !existingEmails.has(email.toLocaleLowerCase('en-US')))
			group.emails.push(...addedEmails)
			return addedEmails.length
		},
		/**
		 * 移除指定群組中的收件人。
		 * @param groupId 收件人群組識別碼。
		 * @param email 要移除的電子郵件。
		 * @returns 是否找到並移除收件人。
		 */
		removeRecipientEmail(groupId: string, email: string): boolean {
			const group = this.recipientGroups.find((item) => item.id === groupId)
			const emailIndex = group?.emails.indexOf(email) ?? -1
			if (!group || emailIndex < 0) return false

			group.emails.splice(emailIndex, 1)
			return true
		},
		/**
		 * 更新收件人群組接收的告警嚴重度。
		 * @param groupId 收件人群組識別碼。
		 * @param severities 要接收的告警嚴重度。
		 * @returns 是否找到群組並完成更新。
		 */
		updateRecipientGroupSeverities(groupId: string, severities: AlertSeverity[]): boolean {
			const group = this.recipientGroups.find((item) => item.id === groupId)
			if (!group) return false

			group.severities = [...new Set(severities)]
			return true
		},
		/**
		 * 儲存非機密的電子郵件通知設定。
		 * @param settings 完整電子郵件通知設定。
		 */
		saveEmailSettings(settings: EmailChannelSettings): void {
			this.emailSettings = { ...settings }
		},
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

			const group = this.recipientGroups.find((item) => item.id === input.targetGroupId)
			const recipients = resolveAudienceUsers(
				this.users,
				input.audienceType,
				input.targetDepartment,
				input.targetRole,
				input.targetUserIds,
				group,
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
				audienceLabel: buildAudienceLabel(input.audienceType, recipients, input.targetDepartment, input.targetRole, group),
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
		 * 依嚴重度送出告警通知；對象與管道來自「自動通知」中的系統告警規則。
		 * @param input 告警內容與狀態。
		 * @returns 實際送達的規則、管道與人數。
		 */
		notifyAlert(input: { ruleName: string; severity: AlertSeverity; observed: string; status: 'triggered' | 'resolved' | 'test'; eventId?: string }): {
			notificationIds: string[]
			inAppRecipientCount: number
			emailRecipientCount: number
			matchedRuleNames: string[]
		} {
			const eventType: NotificationEventType = input.status === 'resolved' ? 'system-alert-resolved' : 'system-alert-triggered'
			const matched = this.matchAlertRules(eventType, input.severity)
			const notificationIds: string[] = []
			let inAppRecipientCount = 0
			let emailRecipientCount = 0

			for (const rule of matched) {
				const group = this.recipientGroups.find((item) => item.id === rule.targetGroupId)
				const recipients = resolveAudienceUsers(this.users, rule.audienceType, rule.targetDepartment, rule.targetRole, rule.targetUserIds, group)
				if (rule.deliveryChannels.includes('email')) emailRecipientCount += group?.emails.length ?? recipients.length
				if (!rule.deliveryChannels.includes('in-app') || recipients.length === 0) continue

				const titlePrefix = input.status === 'resolved' ? '告警已解除' : input.status === 'test' ? '告警測試通知' : '告警觸發'
				const notificationId = this.sendSystemNotification({
					title: `${titlePrefix}：${input.ruleName}`,
					body: `${ALERT_SEVERITY_LABELS[input.severity]} · ${input.observed}`,
					userIds: recipients.map((user) => user.id),
					priority: rule.priority,
					actionTo: input.eventId ? alertEventLink(input.eventId, input.status) : rule.actionTo,
					actionLabel: rule.actionLabel ?? '查看告警',
					sourceLabel: rule.name,
				})
				if (notificationId) {
					notificationIds.push(notificationId)
					inAppRecipientCount += recipients.length
				}
			}

			return { notificationIds, inAppRecipientCount, emailRecipientCount, matchedRuleNames: matched.map((rule) => rule.name) }
		},
		/**
		 * 由系統事件（例如回饋案件指派、結案）發送站內通知給指定使用者。
		 * @param input 通知內容與收件人識別碼。
		 * @returns 新通知識別碼；資料不完整或沒有有效收件人時回傳 null。
		 */
		sendSystemNotification(input: {
			title: string
			body: string
			userIds: string[]
			priority: AppNotification['priority']
			actionTo: string | null
			actionLabel: string | null
			sourceLabel: string
		}): string | null {
			const title = input.title.trim()
			const body = input.body.trim()
			const actionTo = normalizeNotificationActionTarget(input.actionTo)
			const recipients = resolveAudienceUsers(this.users, 'selected', null, null, input.userIds)
			if (!title || !body || actionTo === undefined || recipients.length === 0) return null

			const sentAt = new Date().toISOString()
			const notificationId = `notification-system-${Date.parse(sentAt)}-${this.notifications.length + 1}`
			this.notifications.unshift({
				id: notificationId,
				title,
				body,
				priority: input.priority,
				source: 'automatic',
				sourceLabel: input.sourceLabel,
				audienceLabel: buildAudienceLabel('selected', recipients, null, null),
				actionLabel: actionTo ? input.actionLabel?.trim() || '查看詳情' : null,
				actionTo,
				createdAt: sentAt,
				sentAt,
				createdBy: '系統自動通知',
				recipients: recipients.map((user) => buildRecipient(user.id, sentAt)),
			})
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
		 * @returns 這次實際由未讀轉為已讀的通知識別碼，可交給 restoreUnread 復原。
		 */
		markAllRead(readAt = new Date().toISOString()): string[] {
			const changedIds: string[] = []
			this.currentUserNotifications.forEach((notification) => {
				const recipient = notification.recipients.find((item) => item.userId === CURRENT_NOTIFICATION_USER_ID)
				if (!recipient || recipient.readAt) return
				recipient.readAt = readAt
				changedIds.push(notification.id)
			})
			return changedIds
		},
		/**
		 * 把指定通知還原成未讀，用於復原「全部標示已讀」。
		 * @param notificationIds markAllRead 回傳的通知識別碼。
		 * @returns 實際還原成未讀的筆數。
		 */
		restoreUnread(notificationIds: string[]): number {
			let restoredCount = 0
			notificationIds.forEach((notificationId) => {
				const notification = this.notifications.find((item) => item.id === notificationId)
				const recipient = notification?.recipients.find((item) => item.userId === CURRENT_NOTIFICATION_USER_ID)
				if (!recipient?.readAt) return
				recipient.readAt = null
				restoredCount += 1
			})
			return restoredCount
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
		 * @returns 模擬結果；規則不存在、停用或無收件人時回傳 null。
		 */
		triggerAutomaticRule(ruleId: string, occurredAt = new Date().toISOString()): AutomaticNotificationTriggerResult | null {
			const rule = this.rules.find((item) => item.id === ruleId)
			if (!rule?.isEnabled || !Number.isFinite(Date.parse(occurredAt))) return null

			const group = this.recipientGroups.find((item) => item.id === rule.targetGroupId)
			const recipients = resolveAudienceUsers(
				this.users,
				rule.audienceType,
				rule.targetDepartment,
				rule.targetRole,
				rule.targetUserIds,
				group,
			)
			if (recipients.length === 0) return null

			const sendsInApp = rule.deliveryChannels.includes('in-app')
			const notificationId = sendsInApp
				? `notification-${rule.eventType}-${Date.parse(occurredAt)}-${this.notifications.length + 1}`
				: null
			if (notificationId) {
				this.notifications.unshift({
					id: notificationId,
					title: rule.title,
					body: rule.body,
					priority: rule.priority,
					source: 'automatic',
					sourceLabel: rule.name,
					audienceLabel: buildAudienceLabel(rule.audienceType, recipients, rule.targetDepartment, rule.targetRole, group),
					actionLabel: rule.actionLabel,
					actionTo: rule.actionTo,
					createdAt: occurredAt,
					sentAt: occurredAt,
					createdBy: '系統自動通知',
					recipients: recipients.map((user) => buildRecipient(user.id, occurredAt)),
				})
				this.deliveryClock = Date.now()
			}
			return {
				notificationId,
				emailRecipientCount: rule.deliveryChannels.includes('email') ? (group?.emails.length ?? recipients.length) : 0,
			}
		},
	},
})

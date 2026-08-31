import type {
	AdminQuestionRecord,
	AdminQuestionRecordStatus,
	AlertEvent,
	AppNotification,
	AssistantAuditSession,
	SystemRecordEntry,
	SystemRecordLevel,
} from '@/types'
import { formatNotificationTimestamp, summarizeNotificationPerformance } from '@/utils/notifications'
import { buildAssistantSystemRecords } from '@/utils/assistantAudit'

export type SystemRecordTimeRange = 'all' | '1h' | '24h' | '7d'

export interface AdminQuestionRecordFilters {
	keyword: string
	userId: string
	department: string
	status: AdminQuestionRecordStatus | 'all'
	timeRange: SystemRecordTimeRange
	now: number
}

/**
 * 計算系統紀錄時間範圍的起始時間。
 * @param range 使用者選擇的時間範圍。
 * @param now 目前時間戳。
 * @returns 起始時間戳；全部時間回傳負無限大。
 */
export function getSystemRecordTimeCutoff(range: SystemRecordTimeRange, now: number): number {
	if (range === 'all') return Number.NEGATIVE_INFINITY

	const rangeHours = range === '1h' ? 1 : range === '24h' ? 24 : 24 * 7
	return now - rangeHours * 60 * 60 * 1000
}

/**
 * 依管理端篩選條件取得可見的單次問答紀錄。
 * @param records 原始問答紀錄。
 * @param filters 使用者、部門、狀態、時間及關鍵字條件。
 * @returns 依提問時間由新到舊排列的問答紀錄。
 */
export function filterAdminQuestionRecords(
	records: AdminQuestionRecord[],
	filters: AdminQuestionRecordFilters,
): AdminQuestionRecord[] {
	const normalizedKeyword = filters.keyword.trim().toLocaleLowerCase('zh-TW')
	const cutoff = getSystemRecordTimeCutoff(filters.timeRange, filters.now)

	return records
		.filter((record) => {
			const matchesUser = filters.userId === 'all' || record.userId === filters.userId
			const matchesDepartment = filters.department === 'all' || record.department === filters.department
			const matchesStatus = filters.status === 'all' || record.status === filters.status
			const matchesTime = Date.parse(record.askedAt) >= cutoff
			const searchableText = [
				record.question,
				record.answer,
				record.userName,
				record.userEmail,
				record.requestId,
			].join(' ').toLocaleLowerCase('zh-TW')
			const matchesKeyword = !normalizedKeyword || searchableText.includes(normalizedKeyword)
			return matchesUser && matchesDepartment && matchesStatus && matchesTime && matchesKeyword
		})
		.sort((left, right) => Date.parse(right.askedAt) - Date.parse(left.askedAt))
}

function notificationLevel(notification: AppNotification): SystemRecordLevel {
	if (notification.priority === 'urgent') return 'error'
	if (notification.priority === 'important') return 'warning'
	return 'info'
}

function alertLevel(event: AlertEvent): SystemRecordLevel {
	if (event.status === 'resolved') return 'success'
	if (event.severity === 'critical') return 'error'
	if (event.severity === 'warning') return 'warning'
	return 'info'
}

/**
 * 合併基礎系統紀錄、站內通知與告警事件。
 * @param baseRecords 登入、AI、排程與稽核紀錄。
 * @param notifications 站內通知。
 * @param alertEvents 告警事件。
 * @param assistantSessions 目前頁籤中的後台 AI 小幫手稽核 session。
 * @returns 依發生時間由新到舊排列的統一紀錄。
 */
export function buildSystemRecords(
	baseRecords: SystemRecordEntry[],
	notifications: AppNotification[],
	alertEvents: AlertEvent[],
	now = new Date(),
	assistantSessions: AssistantAuditSession[] = [],
): SystemRecordEntry[] {
	const notificationRecords = notifications.map<SystemRecordEntry>((notification) => {
		const performance = summarizeNotificationPerformance(notification)
		const isScheduled = Date.parse(notification.sentAt) > now.getTime()
		return {
			id: `record-notification-${notification.id}`,
			occurredAt: isScheduled ? notification.createdAt : notification.sentAt,
			category: 'notification',
			level: notificationLevel(notification),
			title: isScheduled ? `已排程：${notification.title}` : notification.title,
			summary: isScheduled
				? `${notification.sourceLabel} · ${notification.audienceLabel} · 預定 ${formatNotificationTimestamp(notification.sentAt)} 發送`
				: `${notification.sourceLabel} · ${notification.audienceLabel} · ${performance.viewedCount} 人已查看`,
			statusLabel: isScheduled ? '已排程' : '已發送',
			sourceId: notification.id,
			sourceTo: `/admin/notifications?notificationId=${encodeURIComponent(notification.id)}`,
		}
	})
	const alertRecords = alertEvents.map<SystemRecordEntry>((event) => ({
		id: `record-alert-${event.id}`,
		occurredAt: event.occurredAt,
		category: 'alert',
		level: alertLevel(event),
		title: event.ruleName,
		summary: `${event.observed} · ${event.durationLabel} · 電子郵件${event.notifyResult}`,
		statusLabel: event.status === 'firing' ? '觸發中' : event.status === 'silenced' ? '已靜音' : '已解除',
		sourceId: event.id,
		sourceTo: `/admin/monitoring?tab=alerts&eventId=${encodeURIComponent(event.id)}`,
	}))

	return [
		...baseRecords.map((record) => ({ ...record })),
		...notificationRecords,
		...alertRecords,
		...buildAssistantSystemRecords(assistantSessions),
	].sort(
		(left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt),
	)
}

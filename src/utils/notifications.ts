import type { AppNotification, NotificationPerformance } from '@/types'

export type NotificationActionTargetKind = 'none' | 'internal' | 'external' | 'invalid'

const MAX_ACTION_TARGET_LENGTH = 2048

/**
 * 判斷通知行動目標是否為站內路徑或安全的外部網址。
 * @param target 使用者設定的行動目標。
 * @returns 目標種類；不符合規則時回傳 invalid。
 */
export function getNotificationActionTargetKind(target: string | null): NotificationActionTargetKind {
	if (target === null || target.trim().length === 0) return 'none'

	const normalizedTarget = target.trim()
	if (normalizedTarget.length > MAX_ACTION_TARGET_LENGTH) return 'invalid'
	if (normalizedTarget.startsWith('/') && !normalizedTarget.startsWith('//')) return 'internal'

	try {
		const url = new URL(normalizedTarget)
		return url.protocol === 'http:' || url.protocol === 'https:' ? 'external' : 'invalid'
	} catch {
		return 'invalid'
	}
}

/**
 * 正規化通知行動目標。
 * @param target 使用者輸入的目標。
 * @returns 有效且去除頭尾空白的目標；沒有行動時回傳 null；格式錯誤時回傳 undefined。
 */
export function normalizeNotificationActionTarget(target: string | null): string | null | undefined {
	const kind = getNotificationActionTargetKind(target)
	if (kind === 'none') return null
	if (kind === 'invalid') return undefined
	return target?.trim()
}

/**
 * 將瀏覽器 datetime-local 欄位值轉成 ISO 8601 時間。
 * @param value 使用者選擇的本地日期時間。
 * @returns 有效時間的 ISO 字串；空白或無效值回傳 undefined。
 */
export function parseNotificationSchedule(value: string): string | undefined {
	if (!value.trim()) return undefined

	const parsed = new Date(value)
	return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}

/**
 * 產生 datetime-local 欄位可使用的本地日期時間。
 * @param date 要格式化的時間。
 * @returns 精確到分鐘的本地日期時間字串。
 */
export function formatNotificationScheduleInput(date: Date): string {
	const pad = (value: number) => String(value).padStart(2, '0')
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * 判斷通知是否尚未到達預定發送時間。
 * @param notification 通知資料。
 * @param now 比較基準時間。
 * @returns 尚未發送時回傳 true。
 */
export function isNotificationScheduled(notification: AppNotification, now = new Date()): boolean {
	return Date.parse(notification.sentAt) > now.getTime()
}

/**
 * 計算單則通知的查看成效。
 * @param notification 要統計的通知。
 * @returns 目標人數、查看率與平均查看秒數。
 */
export function summarizeNotificationPerformance(notification: AppNotification): NotificationPerformance {
	const viewedRecipients = notification.recipients.filter((recipient) => recipient.firstViewedAt)
	const actionClickedRecipients = notification.recipients.filter((recipient) => recipient.firstActionClickedAt)
	const elapsedSeconds = viewedRecipients
		.map((recipient) => {
			const deliveredAt = Date.parse(recipient.deliveredAt)
			const firstViewedAt = Date.parse(recipient.firstViewedAt ?? '')
			return Number.isFinite(deliveredAt) && Number.isFinite(firstViewedAt)
				? Math.max(0, Math.round((firstViewedAt - deliveredAt) / 1000))
				: null
		})
		.filter((seconds): seconds is number => seconds !== null)
	const targetedCount = notification.recipients.length
	const viewedCount = viewedRecipients.length

	return {
		targetedCount,
		viewedCount,
		unviewedCount: targetedCount - viewedCount,
		viewRate: targetedCount === 0 ? 0 : Math.round((viewedCount / targetedCount) * 1000) / 10,
		averageTimeToViewSeconds:
			elapsedSeconds.length === 0
				? null
				: Math.round(elapsedSeconds.reduce((total, seconds) => total + seconds, 0) / elapsedSeconds.length),
		actionClickedCount: actionClickedRecipients.length,
		actionClickRate:
			targetedCount === 0 ? 0 : Math.round((actionClickedRecipients.length / targetedCount) * 1000) / 10,
	}
}

/**
 * 將 ISO 時間轉成台灣使用者可閱讀且精確到秒的格式。
 * @param isoTimestamp ISO 8601 時間字串。
 * @returns 格式化時間；無效值回傳破折號。
 */
export function formatNotificationTimestamp(isoTimestamp: string | null): string {
	if (!isoTimestamp) return '—'

	const date = new Date(isoTimestamp)
	if (Number.isNaN(date.getTime())) return '—'

	return date.toLocaleString('zh-TW', {
		timeZone: 'Asia/Taipei',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
	})
}

/**
 * 將秒數轉成簡短的閱讀耗時。
 * @param totalSeconds 總秒數。
 * @returns 分秒文字；無資料回傳破折號。
 */
export function formatElapsedTime(totalSeconds: number | null): string {
	if (totalSeconds === null || !Number.isFinite(totalSeconds) || totalSeconds < 0) return '—'

	const minutes = Math.floor(totalSeconds / 60)
	const seconds = Math.round(totalSeconds % 60)
	return minutes === 0 ? `${seconds} 秒` : `${minutes} 分 ${seconds} 秒`
}

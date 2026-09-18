import type {
	AdminQuestionRecord,
	AdminQuestionRecordStatus,
	AdminQuestionSource,
	SystemRecordCategory,
	SystemRecordEntry,
	SystemRecordLevel,
} from '@/types'

export type SystemRecordTimeRange = 'all' | '1h' | '24h' | '7d'

export interface AdminQuestionRecordFilters {
	keyword: string
	userId: string
	department: string
	status: AdminQuestionRecordStatus | 'all'
	timeRange: SystemRecordTimeRange
	now: number
	source?: AdminQuestionSource | 'all'
}

export interface AuditRecordFilters {
	keyword: string
	actorLabel: string
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
			const matchesSource = !filters.source || filters.source === 'all' || (record.source ?? 'web') === filters.source
			const matchesTime = Date.parse(record.askedAt) >= cutoff
			const searchableText = [
				record.question,
				record.answer,
				record.userName,
				record.userEmail,
				record.requestId,
			].join(' ').toLocaleLowerCase('zh-TW')
			const matchesKeyword = !normalizedKeyword || searchableText.includes(normalizedKeyword)
			return matchesUser && matchesDepartment && matchesStatus && matchesSource && matchesTime && matchesKeyword
		})
		.sort((left, right) => Date.parse(right.askedAt) - Date.parse(left.askedAt))
}

/**
 * 依操作者、時間與關鍵字篩選操作稽核紀錄。
 * @param records 已合併的稽核紀錄。
 * @param filters 操作者、時間範圍與關鍵字條件。
 * @returns 依發生時間由新到舊排列的稽核紀錄。
 */
export function filterAuditRecords(
	records: SystemRecordEntry[],
	filters: AuditRecordFilters,
): SystemRecordEntry[] {
	const normalizedKeyword = filters.keyword.trim().toLocaleLowerCase('zh-TW')
	const cutoff = getSystemRecordTimeCutoff(filters.timeRange, filters.now)

	return records
		.filter((record) => {
			const matchesActor = filters.actorLabel === 'all' || record.actorLabel === filters.actorLabel
			const matchesTime = Date.parse(record.occurredAt) >= cutoff
			const searchableText = [
				record.actorLabel,
				record.actorAccount,
				record.actorIp,
				record.resourceName,
				record.resourceLabel ?? record.sourceId,
				record.operationLabel ?? record.title,
				record.operationScope,
				record.requestId,
				record.statusLabel,
			]
				.filter((field): field is string => Boolean(field))
				.join(' ')
				.toLocaleLowerCase('zh-TW')
			const matchesKeyword = !normalizedKeyword || searchableText.includes(normalizedKeyword)
			return matchesActor && matchesTime && matchesKeyword
		})
		.sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
}

// > 系統事件只收沒有專屬紀錄頁的類別；通知、告警、AI 問答各自在工作頁留存，不在這裡重複出現
export const SYSTEM_EVENT_CATEGORIES: readonly SystemRecordCategory[] = ['auth', 'job']

function byNewestFirst(left: SystemRecordEntry, right: SystemRecordEntry): number {
	return Date.parse(right.occurredAt) - Date.parse(left.occurredAt)
}

function cloneRecord(record: SystemRecordEntry): SystemRecordEntry {
	return {
		...record,
		details: record.details?.map((detail) => ({ ...detail })),
	}
}

/**
 * 取得系統事件分頁要顯示的紀錄。
 * @param baseRecords 基礎系統紀錄。
 * @returns 只含登入登出與排程工作、依發生時間由新到舊排列的紀錄。
 */
export function buildSystemEventRecords(baseRecords: SystemRecordEntry[]): SystemRecordEntry[] {
	return baseRecords
		.filter((record) => SYSTEM_EVENT_CATEGORIES.includes(record.category))
		.map(cloneRecord)
		.sort(byNewestFirst)
}

/**
 * 合併基礎稽核紀錄與本頁產生的調閱、匯出稽核。
 * @param baseRecords 基礎系統紀錄。
 * @param inspectionRecords 調閱與匯出產生的稽核紀錄。
 * @returns 只含操作稽核、依發生時間由新到舊排列的紀錄。
 */
export function buildAuditRecords(
	baseRecords: SystemRecordEntry[],
	inspectionRecords: SystemRecordEntry[],
): SystemRecordEntry[] {
	return [...inspectionRecords, ...baseRecords.filter((record) => record.category === 'audit')]
		.map(cloneRecord)
		.sort(byNewestFirst)
}

// > 系統紀錄頁各分頁共用的表格與篩選設定
// @ 時間序紀錄一律以發生時間新到舊為預設排序，每頁筆數與時間範圍選項各分頁一致

export const SYSTEM_RECORD_PAGE_SIZE = 25

export const SYSTEM_RECORD_PAGE_SIZE_OPTIONS = [
	{ title: '25', value: 25 },
	{ title: '50', value: 50 },
	{ title: '100', value: 100 },
]

export const SYSTEM_RECORD_TIME_RANGE_OPTIONS: Array<{ title: string; value: SystemRecordTimeRange }> = [
	{ title: '全部時間', value: 'all' },
	{ title: '最近 1 小時', value: '1h' },
	{ title: '最近 24 小時', value: '24h' },
	{ title: '最近 7 天', value: '7d' },
]

export const SYSTEM_RECORD_LEVEL_META: Record<SystemRecordLevel, { label: string; color: string }> = {
	info: { label: '資訊', color: 'info' },
	success: { label: '成功', color: 'success' },
	warning: { label: '警告', color: 'warning' },
	error: { label: '失敗', color: 'error' },
}

/**
 * 組出以 requestId 篩選服務日誌的連結。
 * @param requestId 問答或稽核紀錄的 Request ID。
 * @returns 營運監控日誌查詢頁的路徑。
 */
export function buildLogQueryLink(requestId: string): string {
	return `/admin/monitoring?tab=logs&keyword=${encodeURIComponent(requestId)}`
}

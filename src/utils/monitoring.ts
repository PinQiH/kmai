import type { AlertEvent, AlertRule, LogEntry, LogLevel } from '@/types'

// > 篩選器的「不限制」選項；view 與 util 共用同一個字面值，避免兩邊各寫一份
export const ALL_FILTER = '全部'

export interface SparklineGeometry {
	/** 折線本身的 path，序列為空時為空字串。 */
	linePath: string
	/** 折線下方的封閉面積 path，用來畫淡色填充。 */
	areaPath: string
	/** 最新一個取樣點，供畫端點圓點使用。 */
	lastPoint: { x: number; y: number } | null
}

function round(value: number): number {
	return Math.round(value * 100) / 100
}

/**
 * 將取樣序列換算成 SVG path。
 * @param values 由舊到新的取樣值。
 * @param width viewBox 寬度。
 * @param height viewBox 高度。
 * @param strokeInset 上下保留給線寬的內距，避免線頂到邊界被裁掉。
 * @returns 折線、面積與最新取樣點。
 */
export function buildSparkline(
	values: number[],
	width: number,
	height: number,
	strokeInset = 1,
): SparklineGeometry {
	if (values.length === 0) return { linePath: '', areaPath: '', lastPoint: null }

	// @ 只有一個取樣點時補成兩點，否則單一 moveto 什麼都畫不出來
	const series = values.length === 1 ? [values[0], values[0]] : values
	const top = strokeInset
	const bottom = height - strokeInset
	const min = Math.min(...series)
	const max = Math.max(...series)
	const range = max - min
	const stepX = width / (series.length - 1)

	const points = series.map((value, index) => ({
		x: round(index * stepX),
		// @ 完全水平的序列沒有值域可映射，畫在垂直中央而不是貼著上緣
		y: round(range === 0 ? height / 2 : bottom - ((value - min) / range) * (bottom - top)),
	}))

	const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ')
	const first = points[0]
	const last = points[points.length - 1]
	const areaPath = `${linePath} L${last.x} ${height} L${first.x} ${height} Z`

	return { linePath, areaPath, lastPoint: last }
}

export interface LogFilter {
	service: string
	level: string
	keyword: string
}

/**
 * 依服務、等級與關鍵字篩選日誌。
 * @param entries 原始日誌。
 * @param filter 篩選條件，服務與等級可用 ALL_FILTER 表示不限制。
 * @returns 符合全部條件的日誌。
 */
export function filterLogEntries(entries: LogEntry[], filter: LogFilter): LogEntry[] {
	const keyword = filter.keyword.trim().toLowerCase()

	return entries.filter((entry) => {
		if (filter.service !== ALL_FILTER && entry.service !== filter.service) return false
		if (filter.level !== ALL_FILTER && entry.level !== filter.level) return false
		if (!keyword) return true

		const haystack = `${entry.message} ${entry.service} ${entry.traceId}`.toLowerCase()
		return haystack.includes(keyword)
	})
}

/**
 * 統計各等級的日誌筆數。
 * @param entries 日誌清單。
 * @returns 以等級為鍵的筆數，未出現的等級為 0。
 */
export function countLogLevels(entries: LogEntry[]): Record<LogLevel, number> {
	const counts: Record<LogLevel, number> = { error: 0, warn: 0, info: 0, debug: 0 }
	for (const entry of entries) counts[entry.level] += 1
	return counts
}

/**
 * 把告警規則描述成一句人話。
 * @param rule 告警規則。
 * @returns 例如「回答延遲 p95 > 4 秒，持續 5 分鐘」。
 */
export function describeAlertRule(rule: AlertRule): string {
	// @ 百分號緊貼數字，其餘單位（秒、件）中文習慣留一個空格
	const unitText = rule.unit === '%' ? rule.unit : ` ${rule.unit}`
	return `${rule.metricLabel} ${rule.comparison} ${rule.threshold}${unitText}，持續 ${rule.durationMinutes} 分鐘`
}

export interface AlertSummary {
	firing: number
	resolved: number
	silenced: number
	criticalFiring: number
}

/**
 * 統計告警事件的狀態分佈。
 * @param events 告警事件。
 * @returns 各狀態筆數，另計目前觸發中的嚴重告警數。
 */
export function summarizeAlertEvents(events: AlertEvent[]): AlertSummary {
	return events.reduce<AlertSummary>(
		(summary, event) => {
			summary[event.status] += 1
			if (event.status === 'firing' && event.severity === 'critical') summary.criticalFiring += 1
			return summary
		},
		{ firing: 0, resolved: 0, silenced: 0, criticalFiring: 0 },
	)
}

/**
 * 檢查是否為可寄送的電子郵件位址。
 * @param value 待檢查字串。
 * @returns 格式正確時回傳 true。
 */
export function isValidEmail(value: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())
}

/**
 * 將使用者貼上的收件人字串拆成電子郵件清單。
 * @param text 以逗號、分號、空白或換行分隔的字串。
 * @returns 去除空白與重複（不分大小寫）後的清單，保留第一次出現的寫法。
 */
export function parseEmailList(text: string): string[] {
	const seen = new Set<string>()
	const emails: string[] = []

	for (const candidate of text.split(/[,;\s]+/)) {
		const email = candidate.trim()
		if (!email) continue

		const key = email.toLowerCase()
		if (seen.has(key)) continue

		seen.add(key)
		emails.push(email)
	}

	return emails
}

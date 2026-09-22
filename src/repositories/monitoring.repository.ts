import {
	alertEvents,
	alertRules,
	logEntries,
	serviceHealth,
	serviceMetrics,
} from '@/mocks/monitoring'
import type {
	AlertEvent,
	AlertRule,
	LogEntry,
	ServiceHealth,
	ServiceMetric,
} from '@/types'

// @ 假資料沒有網路延遲，加上固定延遲讓載入狀態在展示環境看得見
const MOCK_DELAY_MS = 320

function delay(): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, MOCK_DELAY_MS))
}

/** 取得服務指標快照。 */
export async function fetchServiceMetrics(): Promise<ServiceMetric[]> {
	// TODO(api-integration): 改為呼叫後端服務指標 API。
	await delay()
	return readServiceMetrics()
}

function readServiceMetrics(): ServiceMetric[] {
	return serviceMetrics.map((metric) => ({ ...metric, series: [...metric.series] }))
}

/** 取得各服務健康度快照。 */
export async function fetchServiceHealth(): Promise<ServiceHealth[]> {
	// TODO(api-integration): 改為呼叫後端各服務健康度 API。
	await delay()
	return readServiceHealth()
}

function readServiceHealth(): ServiceHealth[] {
	return serviceHealth.map((service) => ({ ...service }))
}

/** 取得日誌快照。 */
export async function fetchLogEntries(): Promise<LogEntry[]> {
	// TODO(api-integration): 改為呼叫後端日誌 API。
	await delay()
	return readLogEntries()
}

function readLogEntries(): LogEntry[] {
	return logEntries.map((entry) => ({ ...entry, fields: { ...entry.fields } }))
}

/** 取得告警規則快照。 */
export function getAlertRulesSnapshot(): AlertRule[] {
	return alertRules.map((rule) => ({ ...rule }))
}

/** 取得告警事件快照。 */
export function getAlertEventsSnapshot(): AlertEvent[] {
	return alertEvents.map((event) => ({ ...event }))
}

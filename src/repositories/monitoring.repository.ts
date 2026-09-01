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

/** 取得服務指標快照。 */
export function getServiceMetricsSnapshot(): ServiceMetric[] {
	return serviceMetrics.map((metric) => ({ ...metric, series: [...metric.series] }))
}

/** 取得各服務健康度快照。 */
export function getServiceHealthSnapshot(): ServiceHealth[] {
	return serviceHealth.map((service) => ({ ...service }))
}

/** 取得日誌快照。 */
export function getLogEntriesSnapshot(): LogEntry[] {
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

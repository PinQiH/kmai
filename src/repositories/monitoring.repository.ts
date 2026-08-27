import {
	alertEvents,
	alertRules,
	emailChannelSettings,
	logEntries,
	recipientGroups,
	serviceHealth,
	serviceMetrics,
} from '@/mocks/monitoring'
import type {
	AlertEvent,
	AlertRule,
	EmailChannelSettings,
	LogEntry,
	RecipientGroup,
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

/** 取得收件人群組快照。 */
export function getRecipientGroupsSnapshot(): RecipientGroup[] {
	return recipientGroups.map((group) => ({ ...group, emails: [...group.emails], severities: [...group.severities] }))
}

/** 取得電子郵件通知設定快照。 */
export function getEmailChannelSettingsSnapshot(): EmailChannelSettings {
	return { ...emailChannelSettings }
}

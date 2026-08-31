import { defineStore } from 'pinia'

import { alertEvents, alertRules } from '@/mocks/monitoring'
import type { AlertEvent, AlertRule } from '@/types'

interface MonitoringState {
	rules: AlertRule[]
	events: AlertEvent[]
}

export const useMonitoringStore = defineStore('monitoring', {
	state: (): MonitoringState => ({
		rules: alertRules.map((rule) => ({ ...rule })),
		events: alertEvents.map((event) => ({ ...event })),
	}),
	actions: {
		/** 新增告警規則。 */
		addRule(rule: AlertRule): void {
			this.rules.push({ ...rule })
		},
		/** 更新既有告警規則。 */
		updateRule(rule: AlertRule): boolean {
			const ruleIndex = this.rules.findIndex((item) => item.id === rule.id)
			if (ruleIndex < 0) return false

			this.rules[ruleIndex] = { ...rule }
			return true
		},
		/** 啟用或停用告警規則。 */
		setRuleEnabled(ruleId: string, isEnabled: boolean): boolean {
			const rule = this.rules.find((item) => item.id === ruleId)
			if (!rule) return false

			rule.isEnabled = isEnabled
			return true
		},
		/** 刪除告警規則並保留既有告警事件。 */
		deleteRule(ruleId: string): boolean {
			const ruleIndex = this.rules.findIndex((item) => item.id === ruleId)
			if (ruleIndex < 0) return false

			this.rules.splice(ruleIndex, 1)
			return true
		},
		/** 將觸發中的告警靜音一小時。 */
		silenceEvent(eventId: string): boolean {
			const event = this.events.find((item) => item.id === eventId)
			if (!event || event.status !== 'firing') return false

			event.status = 'silenced'
			event.durationLabel = '靜音 1 小時'
			return true
		},
	},
})

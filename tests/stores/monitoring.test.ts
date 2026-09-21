import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useMonitoringStore } from '../src/stores/monitoring'

describe('monitoring store', () => {
	beforeEach(() => setActivePinia(createPinia()))

	it('should add an independent alert rule when a valid rule is provided', () => {
		const store = useMonitoringStore()
		const rule = { ...store.rules[0]!, id: 'rule-new', name: '新增規則' }

		store.addRule(rule)
		rule.name = '外部修改'

		expect(store.rules.at(-1)).toMatchObject({ id: 'rule-new', name: '新增規則' })
	})

	it('should update and toggle an existing rule without accepting unknown identifiers', () => {
		const store = useMonitoringStore()
		const rule = { ...store.rules[0]!, name: '更新後規則' }

		expect(store.updateRule(rule)).toBe(true)
		expect(store.rules[0]?.name).toBe('更新後規則')
		expect(store.setRuleEnabled(rule.id, false)).toBe(true)
		expect(store.rules[0]?.isEnabled).toBe(false)

		expect(store.updateRule({ ...rule, id: 'missing-rule' })).toBe(false)
		expect(store.setRuleEnabled('missing-rule', true)).toBe(false)
		expect(store.deleteRule('missing-rule')).toBe(false)
	})

	it('should share a silenced alert status without mutating unrelated events', () => {
		const store = useMonitoringStore()
		const firingEvent = store.events.find((event) => event.status === 'firing')
		const unrelatedEvent = store.events.find((event) => event.id !== firingEvent?.id)
		const unrelatedStatus = unrelatedEvent?.status
		expect(firingEvent).toBeDefined()

		expect(store.silenceEvent(firingEvent!.id)).toBe(true)
		expect(firingEvent?.status).toBe('silenced')
		expect(firingEvent?.durationLabel).toBe('靜音 1 小時')
		expect(unrelatedEvent?.status).toBe(unrelatedStatus)
	})

	it('should keep alert events when deleting a rule', () => {
		const store = useMonitoringStore()
		const rule = store.rules[0]
		const originalEventCount = store.events.length
		expect(rule).toBeDefined()

		expect(store.deleteRule(rule!.id)).toBe(true)
		expect(store.rules.some((item) => item.id === rule!.id)).toBe(false)
		expect(store.events).toHaveLength(originalEventCount)
	})

	it('should reject silencing when an event is missing or no longer firing', () => {
		const store = useMonitoringStore()
		const inactiveEvent = store.events.find((event) => event.status !== 'firing')
		expect(inactiveEvent).toBeDefined()
		const originalStatus = inactiveEvent!.status

		expect(store.silenceEvent('missing-event')).toBe(false)
		expect(store.silenceEvent(inactiveEvent!.id)).toBe(false)
		expect(inactiveEvent?.status).toBe(originalStatus)
	})
})

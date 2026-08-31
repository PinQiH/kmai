import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useMonitoringStore } from '../src/stores/monitoring'

describe('monitoring store', () => {
	beforeEach(() => setActivePinia(createPinia()))

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
})

import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAssistantIdleTimer } from '@/composables/useAssistantIdleTimer'
import { useAdminAssistantStore } from '@/stores/adminAssistant'

const IdleTimerHarness = defineComponent({
	setup() {
		return useAssistantIdleTimer()
	},
	template: '<output>{{ remainingLabel }}</output>',
})

let wrapper: VueWrapper | null = null

beforeEach(() => {
	setActivePinia(createPinia())
	vi.useFakeTimers()
	vi.setSystemTime(new Date('2026-09-04T00:00:00.000Z'))
})

afterEach(() => {
	wrapper?.unmount()
	wrapper = null
	vi.useRealTimers()
})

describe('useAssistantIdleTimer', () => {
	it('should count down and stop when no active session expiry exists', async () => {
		const store = useAdminAssistantStore()
		store.expiresAt = Date.now() + 61_000
		wrapper = mount(IdleTimerHarness)
		await nextTick()

		expect(wrapper.text()).toBe('01:01')

		await vi.advanceTimersByTimeAsync(1_000)
		expect(wrapper.text()).toBe('01:00')

		store.expiresAt = null
		await nextTick()
		expect(wrapper.text()).toBe('')
	})

	it('should refresh the remaining time after the document becomes visible', async () => {
		const store = useAdminAssistantStore()
		store.expiresAt = Date.now() + 10_000
		wrapper = mount(IdleTimerHarness)
		await nextTick()

		await vi.advanceTimersByTimeAsync(4_000)
		document.dispatchEvent(new Event('visibilitychange'))

		expect(wrapper.text()).toBe('00:06')
	})
})

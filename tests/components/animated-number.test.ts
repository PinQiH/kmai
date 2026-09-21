import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import AnimatedNumber from '@/components/AnimatedNumber.vue'

let wrapper: VueWrapper | null = null

afterEach(() => {
	wrapper?.unmount()
	wrapper = null
	vi.unstubAllGlobals()
})

describe('AnimatedNumber', () => {
	it('should preserve number formatting, prefix, and suffix when reduced motion is preferred', async () => {
		vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))

		wrapper = mount(AnimatedNumber, { props: { value: '97.8%' } })
		await nextTick()

		expect(wrapper.text()).toBe('97.8%')
	})

	it('should render non-numeric values without attempting an animation', () => {
		vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))

		wrapper = mount(AnimatedNumber, { props: { value: 'N/A' } })

		expect(wrapper.text()).toBe('N/A')
	})
})

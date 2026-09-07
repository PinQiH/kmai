import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createVuetify } from 'vuetify'

import App from '@/App.vue'
import { useAppStore } from '@/stores/app'

let wrapper: VueWrapper | null = null

afterEach(() => {
	wrapper?.unmount()
	wrapper = null
})

describe('App', () => {
	it('should initialize and dispose the application theme with the root lifecycle', () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const appStore = useAppStore(pinia)
		const initializeTheme = vi.spyOn(appStore, 'initializeTheme').mockImplementation(() => undefined)
		const disposeTheme = vi.spyOn(appStore, 'disposeTheme').mockImplementation(() => undefined)

		wrapper = mount(App, {
			global: {
				plugins: [pinia, createVuetify()],
				stubs: {
					AppShell: true,
					VApp: { template: '<div><slot /></div>' },
				},
			},
		})

		expect(initializeTheme).toHaveBeenCalledOnce()
		expect(wrapper.findComponent({ name: 'AppShell' }).exists()).toBe(true)

		wrapper.unmount()
		wrapper = null
		expect(disposeTheme).toHaveBeenCalledOnce()
	})
})

import { flushPromises, mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'

import NotFoundView from '@/views/NotFoundView.vue'

describe('NotFoundView', () => {
	it('should explain the missing address and go home on request', async () => {
		const router = createRouter({
			history: createMemoryHistory(),
			routes: [
				{ path: '/', component: { template: '<div />' } },
				{ path: '/:pathMatch(.*)*', component: NotFoundView },
			],
		})
		await router.push('/old-link')
		await router.isReady()
		const wrapper = mount(NotFoundView, { global: { plugins: [router, createVuetify({ components })] } })

		expect(wrapper.text()).toContain('找不到這個頁面')
		expect(wrapper.text()).toContain('網址「/old-link」不存在')

		await wrapper.get('button').trigger('click')
		await flushPromises()

		expect(router.currentRoute.value.path).toBe('/')
	})
})

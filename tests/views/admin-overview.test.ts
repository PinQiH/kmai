import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AdminOverviewView from '@/views/admin/AdminOverviewView.vue'
import * as adminRepository from '@/repositories/admin.repository'

globalThis.ResizeObserver = class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
} as typeof ResizeObserver

async function mountView(): Promise<VueWrapper> {
	setActivePinia(createPinia())
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
	})
	await router.push('/admin')
	const wrapper = mount(AdminOverviewView, { global: { plugins: [createPinia(), router, createVuetify({ components, directives })] } })
	await flushPromises()
	return wrapper
}

describe('AdminOverviewView', () => {
	beforeEach(() => {
		vi.restoreAllMocks()
	})

	it('should show skeletons until the health metrics arrive', async () => {
		const wrapper = await mountView()

		expect(wrapper.find('.v-skeleton-loader').exists()).toBe(true)

		await vi.waitFor(() => expect(wrapper.find('.v-skeleton-loader').exists()).toBe(false))
		expect(wrapper.findAll('.metric').length).toBeGreaterThan(0)
	})

	it('should offer a retry when the health metrics fail to load', async () => {
		const metrics = await adminRepository.fetchHealthMetrics()
		const fetchMetrics = vi.spyOn(adminRepository, 'fetchHealthMetrics')
			.mockRejectedValueOnce(new Error('伺服器處理失敗，請稍後再試。'))
			.mockResolvedValueOnce(metrics)

		const wrapper = await mountView()
		await vi.waitFor(() => expect(wrapper.text()).toContain('無法載入健康度'))
		expect(wrapper.text()).toContain('目前無法載入系統健康度，請稍後再試。')

		await wrapper.findAll('button').find((button) => button.text() === '重新載入')!.trigger('click')
		await vi.waitFor(() => expect(wrapper.text()).not.toContain('無法載入健康度'))

		expect(fetchMetrics).toHaveBeenCalledTimes(2)
		expect(wrapper.findAll('.metric').length).toBeGreaterThan(0)
	})
})

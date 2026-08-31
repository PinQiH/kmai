import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'

import { useNotificationsStore } from '@/stores/notifications'
import AdminNotificationsView from '@/views/admin/AdminNotificationsView.vue'
import AdminSystemRecordsView from '@/views/admin/AdminSystemRecordsView.vue'

globalThis.ResizeObserver = class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
} as typeof ResizeObserver

function createTestVuetify() {
	return createVuetify({ components, directives })
}

describe('admin notification management views', () => {
	it('should expand the linked notification performance inside its record row', async () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const store = useNotificationsStore()
		const notification = store.notifications[0]
		expect(notification).toBeDefined()

		const router = createRouter({
			history: createMemoryHistory(),
			routes: [{ path: '/admin/notifications', component: AdminNotificationsView }],
		})
		await router.push(`/admin/notifications?notificationId=${notification!.id}`)
		await router.isReady()

		const wrapper = mount(AdminNotificationsView, {
			global: { plugins: [pinia, createTestVuetify(), router] },
		})
		await flushPromises()
		await nextTick()

		expect(wrapper.text()).not.toContain('成效分析')
		expect(wrapper.get('[data-testid="notification-performance-row"]').text()).toContain('查看率')
		expect(wrapper.get('[data-testid="notification-performance-row"]').text()).toContain('點擊率')
	})

	it('should present notifications and alerts in the read-only system records table', async () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const router = createRouter({
			history: createMemoryHistory(),
			routes: [
				{ path: '/admin/logs', component: AdminSystemRecordsView },
				{ path: '/admin/notifications', component: { template: '<div />' } },
				{ path: '/admin/monitoring', component: { template: '<div />' } },
				{ path: '/admin/documents/:id/manage', component: { template: '<div />' } },
				{ path: '/admin/processing', component: { template: '<div />' } },
				{ path: '/admin/access', component: { template: '<div />' } },
				{ path: '/admin/graph', component: { template: '<div />' } },
				{ path: '/ask', component: { template: '<div />' } },
			],
		})
		await router.push('/admin/logs')
		await router.isReady()

		const wrapper = mount(AdminSystemRecordsView, {
			global: { plugins: [pinia, createTestVuetify(), router] },
		})
		await flushPromises()

		expect(wrapper.get('[data-testid="system-record-table"]').text()).toContain('通知')
		expect(wrapper.get('[data-testid="system-record-table"]').text()).toContain('告警')
		expect(wrapper.text()).toContain('此處只提供整合查詢')
	})
})

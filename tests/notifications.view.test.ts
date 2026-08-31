import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'

import { CURRENT_NOTIFICATION_USER_ID } from '@/mocks/notifications'
import { useNotificationsStore } from '@/stores/notifications'
import NotificationsView from '@/views/NotificationsView.vue'

describe('NotificationsView', () => {
	it('should keep an opened notification visible in the unread filter and record one view', async () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const store = useNotificationsStore()
		const unreadNotification = store.currentUserNotifications.find((notification) => {
			const recipient = notification.recipients.find((item) => item.userId === CURRENT_NOTIFICATION_USER_ID)
			return !recipient?.readAt
		})
		expect(unreadNotification).toBeDefined()
		store.notifications = [unreadNotification!]

		const router = createRouter({
			history: createMemoryHistory(),
			routes: [{ path: '/notifications', component: NotificationsView }],
		})
		await router.push('/notifications')
		await router.isReady()

		const wrapper = mount(NotificationsView, {
			global: {
				plugins: [pinia, createVuetify({ components, directives }), router],
			},
		})

		await wrapper.get('[data-testid="notification-filter-unread"]').trigger('click')
		await wrapper.get('[data-testid="notification-item"]').trigger('click')
		await flushPromises()
		await nextTick()

		const recipient = unreadNotification!.recipients.find((item) => item.userId === CURRENT_NOTIFICATION_USER_ID)
		expect(wrapper.get('[data-testid="notification-detail"]').text()).toContain(unreadNotification!.title)
		expect(wrapper.findAll('[data-testid="notification-item"]')).toHaveLength(1)
		expect(recipient?.readAt).not.toBeNull()
		expect(recipient?.viewCount).toBe(1)
	})

	it('should exclude a previously selected read notification when switching to unread', async () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const store = useNotificationsStore()
		const readNotification = store.currentUserNotifications.find((notification) => {
			const recipient = notification.recipients.find((item) => item.userId === CURRENT_NOTIFICATION_USER_ID)
			return Boolean(recipient?.readAt)
		})
		const unreadNotification = store.currentUserNotifications.find((notification) => {
			const recipient = notification.recipients.find((item) => item.userId === CURRENT_NOTIFICATION_USER_ID)
			return !recipient?.readAt
		})
		expect(readNotification).toBeDefined()
		expect(unreadNotification).toBeDefined()
		readNotification!.actionLabel = null
		readNotification!.actionTo = null
		store.notifications = [readNotification!, unreadNotification!]

		const router = createRouter({
			history: createMemoryHistory(),
			routes: [{ path: '/notifications', component: NotificationsView }],
		})
		await router.push('/notifications')
		await router.isReady()
		const wrapper = mount(NotificationsView, {
			global: {
				plugins: [pinia, createVuetify({ components, directives }), router],
			},
		})

		const readItem = wrapper
			.findAll('[data-testid="notification-item"]')
			.find((item) => item.text().includes(readNotification!.title))
		expect(readItem).toBeDefined()
		await readItem!.trigger('click')
		await flushPromises()
		await wrapper.get('[data-testid="notification-filter-unread"]').trigger('click')
		await nextTick()

		const visibleItems = wrapper.findAll('[data-testid="notification-item"]')
		expect(visibleItems).toHaveLength(1)
		expect(visibleItems[0]?.text()).toContain(unreadNotification!.title)
		expect(visibleItems[0]?.text()).not.toContain(readNotification!.title)
		expect(wrapper.find('[data-testid="notification-detail"]').exists()).toBe(false)
	})

	it('should record an action click before navigating to an internal target', async () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const store = useNotificationsStore()
		const notification = store.currentUserNotifications.find((item) => item.actionTo?.startsWith('/'))
		expect(notification).toBeDefined()
		store.notifications = [notification!]
		const recipient = notification!.recipients.find((item) => item.userId === CURRENT_NOTIFICATION_USER_ID)
		const originalClickCount = recipient?.actionClickCount ?? 0

		const router = createRouter({
			history: createMemoryHistory(),
			routes: [
				{ path: '/notifications', component: NotificationsView },
				{ path: '/documents/:id', component: { template: '<div>文件</div>' } },
				{ path: '/library', component: { template: '<div>知識庫</div>' } },
			],
		})
		await router.push('/notifications')
		await router.isReady()
		const wrapper = mount(NotificationsView, {
			global: {
				plugins: [pinia, createVuetify({ components, directives }), router],
			},
		})

		await wrapper.get('[data-testid="notification-item"]').trigger('click')
		await flushPromises()
		await wrapper.get('[data-testid="notification-action"]').trigger('click')
		await flushPromises()

		expect(recipient?.actionClickCount).toBe(originalClickCount + 1)
		expect(recipient?.firstActionClickedAt).not.toBeNull()
		expect(router.currentRoute.value.path).toBe(notification!.actionTo)
	})
})

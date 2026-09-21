import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import NotificationCenterDialog from '@/components/NotificationCenterDialog.vue'
import { CURRENT_NOTIFICATION_USER_ID } from '@/mocks/notifications'
import { useNotificationsStore } from '@/stores/notifications'
import { useToastStore } from '@/stores/toast'
import type { AppNotification } from '@/types'

// @ jsdom 沒有 ResizeObserver 與 visualViewport，Vuetify 的 overlay 定位會直接取用，補上最小替身。
globalThis.ResizeObserver = class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
} as typeof ResizeObserver

Object.defineProperty(globalThis, 'visualViewport', {
	configurable: true,
	value: { addEventListener: vi.fn(), removeEventListener: vi.fn(), width: 1024, height: 768, scale: 1 },
})

function recipientOf(notification: AppNotification) {
	return notification.recipients.find((item) => item.userId === CURRENT_NOTIFICATION_USER_ID)
}

function findUnread(store: ReturnType<typeof useNotificationsStore>): AppNotification | undefined {
	return store.currentUserNotifications.find((notification) => !recipientOf(notification)?.readAt)
}

function findRead(store: ReturnType<typeof useNotificationsStore>): AppNotification | undefined {
	return store.currentUserNotifications.find((notification) => Boolean(recipientOf(notification)?.readAt))
}

// @ VDialog 的內容 teleport 到 body；Vuetify 的 overlay 容器會跨測試殘留，一律只取最後掛載的那一層
function overlay(): ParentNode {
	const containers = document.querySelectorAll<HTMLElement>('.v-overlay-container')
	return containers[containers.length - 1] ?? document
}

const el = (testId: string): HTMLElement | null => overlay().querySelector(`[data-testid="${testId}"]`)
const all = (testId: string): HTMLElement[] => [...overlay().querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`)]

// @ 用真正的 MouseEvent 而非 HTMLElement.click()；後者在 jsdom 不會讓 RouterLink 完成導航
async function click(target: HTMLElement | null): Promise<void> {
	expect(target).not.toBeNull()
	target!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
	await flushPromises()
	await nextTick()
}

async function mountDialog(initialNotificationId: string | null = null) {
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [
			{ path: '/', component: { template: '<div>首頁</div>' } },
			{ path: '/documents/:id', component: { template: '<div>文件</div>' } },
			{ path: '/library', component: { template: '<div>知識庫</div>' } },
		],
	})
	await router.push('/')
	await router.isReady()

	const wrapper = mount(NotificationCenterDialog, {
		attachTo: document.body,
		props: { modelValue: true, initialNotificationId },
		global: {
			plugins: [createVuetify({ components, directives }), router],
		},
	})
	await flushPromises()
	await nextTick()
	return { wrapper, router }
}

describe('NotificationCenterDialog', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
		setActivePinia(createPinia())
	})

	it('should keep an opened notification visible in the unread filter and record one view', async () => {
		const store = useNotificationsStore()
		const unreadNotification = findUnread(store)
		expect(unreadNotification).toBeDefined()
		store.notifications = [unreadNotification!]

		const { wrapper } = await mountDialog()

		await click(el('notification-dialog-filter-unread'))
		await click(all('notification-dialog-item')[0] ?? null)

		const recipient = recipientOf(unreadNotification!)
		expect(el('notification-dialog-detail')?.textContent).toContain(unreadNotification!.title)
		expect(all('notification-dialog-item')).toHaveLength(1)
		expect(recipient?.readAt).not.toBeNull()
		expect(recipient?.viewCount).toBe(1)

		wrapper.unmount()
	})

	it('should exclude a previously selected read notification when switching to unread', async () => {
		const store = useNotificationsStore()
		const readNotification = findRead(store)
		const unreadNotification = findUnread(store)
		expect(readNotification).toBeDefined()
		expect(unreadNotification).toBeDefined()
		readNotification!.actionLabel = null
		readNotification!.actionTo = null
		store.notifications = [readNotification!, unreadNotification!]

		const { wrapper } = await mountDialog()

		const readItem = all('notification-dialog-item').find((item) => item.textContent?.includes(readNotification!.title))
		await click(readItem ?? null)
		await click(el('notification-dialog-filter-unread'))

		const visibleItems = all('notification-dialog-item')
		expect(visibleItems).toHaveLength(1)
		expect(visibleItems[0]?.textContent).toContain(unreadNotification!.title)
		expect(el('notification-dialog-detail')).toBeNull()

		wrapper.unmount()
	})

	it('should record an action click and close the dialog before navigating to an internal target', async () => {
		const store = useNotificationsStore()
		const notification = store.currentUserNotifications.find((item) => item.actionTo?.startsWith('/'))
		expect(notification).toBeDefined()
		store.notifications = [notification!]
		const recipient = recipientOf(notification!)
		const originalClickCount = recipient?.actionClickCount ?? 0

		const { wrapper, router } = await mountDialog()

		await click(all('notification-dialog-item')[0] ?? null)
		await click(el('notification-dialog-action'))
		// @ RouterLink 的導航是非同步的，等它真的落地再斷言
		await vi.waitFor(() => expect(router.currentRoute.value.path).toBe(notification!.actionTo))

		expect(recipient?.actionClickCount).toBe(originalClickCount + 1)
		expect(recipient?.firstActionClickedAt).not.toBeNull()
		expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])

		wrapper.unmount()
	})

	it('should open the notification passed as initialNotificationId', async () => {
		const store = useNotificationsStore()
		const unreadNotification = findUnread(store)
		expect(unreadNotification).toBeDefined()

		const { wrapper } = await mountDialog(unreadNotification!.id)
		await wrapper.setProps({ modelValue: false })
		await flushPromises()
		await wrapper.setProps({ modelValue: true })
		await flushPromises()
		await nextTick()

		expect(el('notification-dialog-detail')?.textContent).toContain(unreadNotification!.title)

		wrapper.unmount()
	})

	it('should keep the notification being read visible after marking everything read', async () => {
		const store = useNotificationsStore()
		store.notifications = store.currentUserNotifications.filter((notification) => !recipientOf(notification)?.readAt)
		expect(store.unreadCount).toBeGreaterThan(0)

		const { wrapper } = await mountDialog()

		await click(el('notification-dialog-filter-unread'))
		await click(all('notification-dialog-item')[0] ?? null)
		const readingDetail = el('notification-dialog-detail')?.textContent

		await click(el('notification-dialog-mark-all'))

		expect(store.unreadCount).toBe(0)
		expect(el('notification-dialog-detail')?.textContent).toBe(readingDetail)

		wrapper.unmount()
	})

	it('should offer an undo toast that restores every notification marked read', async () => {
		const store = useNotificationsStore()
		const toastStore = useToastStore()
		store.notifications = store.currentUserNotifications.filter((notification) => !recipientOf(notification)?.readAt)
		const originalUnreadCount = store.unreadCount
		expect(originalUnreadCount).toBeGreaterThan(0)

		const { wrapper } = await mountDialog()
		await click(el('notification-dialog-mark-all'))

		expect(store.unreadCount).toBe(0)
		const undoAction = toastStore.items[0]?.action
		expect(undoAction?.label).toBe('復原')

		undoAction?.handler()
		await nextTick()
		expect(store.unreadCount).toBe(originalUnreadCount)

		wrapper.unmount()
	})

	it('should keep the unread filter between openings', async () => {
		useNotificationsStore()

		const { wrapper } = await mountDialog()
		await click(el('notification-dialog-filter-unread'))

		await wrapper.setProps({ modelValue: false })
		await flushPromises()
		await wrapper.setProps({ modelValue: true })
		await flushPromises()
		await nextTick()

		expect(el('notification-dialog-filter-unread')?.classList.contains('v-btn--active')).toBe(true)

		wrapper.unmount()
	})

	it('should emit closed so the trigger can take the focus back', async () => {
		useNotificationsStore()

		const { wrapper } = await mountDialog()
		await wrapper.setProps({ modelValue: false })
		await flushPromises()

		expect(wrapper.emitted('closed')).toHaveLength(1)

		wrapper.unmount()
	})
})

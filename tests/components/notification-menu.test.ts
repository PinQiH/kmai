import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import NotificationMenu from '@/components/NotificationMenu.vue'
import { useNotificationsStore } from '@/stores/notifications'
import { useToastStore } from '@/stores/toast'

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

const el = (testId: string): HTMLElement | null => document.querySelector(`[data-testid="${testId}"]`)

// @ 用真正的 MouseEvent 而非 HTMLElement.click()；後者在 jsdom 不會讓 RouterLink 完成導航
async function click(target: HTMLElement | null): Promise<void> {
	expect(target).not.toBeNull()
	target!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
	await flushPromises()
	await nextTick()
}

async function mountMenu() {
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [{ path: '/', component: { template: '<div>首頁</div>' } }],
	})
	await router.push('/')
	await router.isReady()

	const wrapper = mount(NotificationMenu, {
		attachTo: document.body,
		global: { plugins: [createVuetify({ components, directives }), router] },
	})
	await flushPromises()
	await nextTick()

	// @ 選單內容要展開才會渲染，先點開鈴鐺
	await click(wrapper.get('button').element)
	return wrapper
}

describe('NotificationMenu', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
		setActivePinia(createPinia())
	})

	it('should offer an undo toast when marking everything read from the bell menu', async () => {
		const store = useNotificationsStore()
		const toastStore = useToastStore()
		const originalUnreadCount = store.unreadCount
		expect(originalUnreadCount).toBeGreaterThan(0)

		const wrapper = await mountMenu()
		await click(el('notification-menu-mark-all'))

		expect(store.unreadCount).toBe(0)
		const undoAction = toastStore.items[0]?.action
		expect(undoAction?.label).toBe('復原')

		undoAction?.handler()
		await nextTick()
		expect(store.unreadCount).toBe(originalUnreadCount)

		wrapper.unmount()
	})
})

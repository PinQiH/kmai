import { createPinia, setActivePinia } from 'pinia'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ConversationSearchDialog from '../../src/components/ConversationSearchDialog.vue'
import { useConversationStore } from '../../src/stores/conversation'

interface MountedSearchDialog {
	router: Router
	wrapper: VueWrapper
}

async function mountSearchDialog(): Promise<MountedSearchDialog> {
	const pinia = createPinia()
	setActivePinia(pinia)
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [
			{ path: '/', component: { template: '<div>首頁</div>' } },
			{ path: '/ask', component: { template: '<div>AI 問答</div>' } },
		],
	})
	await router.push('/')
	await router.isReady()

	const wrapper = mount(ConversationSearchDialog, {
		attachTo: document.body,
		props: { modelValue: true },
		global: {
			plugins: [pinia, router],
			stubs: {
				VDialog: {
					props: ['modelValue'],
					template: '<div v-if="modelValue"><slot /></div>',
				},
				VIcon: true,
			},
		},
	})

	return { router, wrapper }
}

describe('ConversationSearchDialog', () => {
	const wrappers: VueWrapper[] = []

	afterEach(() => {
		wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
	})

	it('should list conversations with their folder name', async () => {
		const { wrapper } = await mountSearchDialog()
		wrappers.push(wrapper)

		expect(wrapper.get('input').attributes('placeholder')).toBe('搜尋對話標題或內容…')
		expect(wrapper.text()).toContain('國內出差住宿費用上限是多少？')
		expect(wrapper.text()).toContain('差旅與報支')
	})

	it('should distinguish an empty conversation list from search with no matches', async () => {
		const { wrapper } = await mountSearchDialog()
		wrappers.push(wrapper)
		const conversationStore = useConversationStore()

		await wrapper.get('input').setValue('不存在的對話')
		expect(wrapper.text()).toContain('找不到符合「不存在的對話」的對話')

		await wrapper.get('input').setValue('')
		conversationStore.conversations = []
		await nextTick()
		expect(wrapper.text()).toContain('目前沒有可搜尋的對話')
	})

	it('should open the selected conversation when Enter is pressed', async () => {
		const { router, wrapper } = await mountSearchDialog()
		wrappers.push(wrapper)
		const conversationStore = useConversationStore()

		await wrapper.get('input').trigger('keydown', { key: 'Enter', isComposing: false })
		await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/ask'))

		expect(conversationStore.activeConversationId).toBe('conv-001')
		expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false])
	})

	it('should not open a conversation while an IME composition is active', async () => {
		const { router, wrapper } = await mountSearchDialog()
		wrappers.push(wrapper)

		await wrapper.get('input').trigger('keydown', { key: 'Enter', isComposing: true })

		expect(router.currentRoute.value.path).toBe('/')
		expect(wrapper.emitted('update:modelValue')).toBeUndefined()
	})
})

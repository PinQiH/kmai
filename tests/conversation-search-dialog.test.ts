import { createPinia, setActivePinia } from 'pinia'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ConversationSearchDialog from '../src/components/ConversationSearchDialog.vue'
import { useConversationStore } from '../src/stores/conversation'
import { useFavoritesStore } from '../src/stores/favorites'

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

	it('should show saved answers when the favorites tab is selected', async () => {
		const { wrapper } = await mountSearchDialog()
		wrappers.push(wrapper)

		await wrapper.get('[data-testid="search-favorites-tab"]').trigger('click')

		expect(wrapper.get('[data-testid="search-favorites-tab"]').attributes('aria-pressed')).toBe('true')
		expect(wrapper.get('input').attributes('placeholder')).toBe('搜尋收藏的問題或回答…')
		expect(wrapper.text()).toContain('國內出差住宿費用上限是多少？')
		expect(wrapper.text()).toContain('收藏於 2026-08-17')
		expect(wrapper.get('[aria-labelledby="favorite-title-conv-001-message-2"]').attributes('aria-describedby')).toBe('favorite-answer-conv-001-message-2 favorite-date-conv-001-message-2')
	})

	it('should distinguish an empty favorites list from search with no matches', async () => {
		const { wrapper } = await mountSearchDialog()
		wrappers.push(wrapper)
		const favoritesStore = useFavoritesStore()
		favoritesStore.items = []

		await wrapper.get('[data-testid="search-favorites-tab"]').trigger('click')
		expect(wrapper.text()).toContain('目前還沒有收藏')

		await wrapper.get('input').setValue('不存在的收藏')
		expect(wrapper.text()).toContain('找不到符合「不存在的收藏」的收藏')
	})

	it('should remove a favorite without closing the search dialog', async () => {
		const { wrapper } = await mountSearchDialog()
		wrappers.push(wrapper)
		const favoritesStore = useFavoritesStore()
		const removedId = favoritesStore.items[0]?.id

		await wrapper.get('[data-testid="search-favorites-tab"]').trigger('click')
		await wrapper.get('.favorite-remove').trigger('click')

		expect(favoritesStore.items.some((favorite) => favorite.id === removedId)).toBe(false)
		expect(wrapper.emitted('update:modelValue')).toBeUndefined()
		expect(wrapper.get('[aria-live="polite"]').text()).toContain('已取消收藏')
		expect(document.activeElement?.classList.contains('favorite-remove')).toBe(true)
	})

	it('should open the original conversation message from the selected favorite when Enter is pressed', async () => {
		const { router, wrapper } = await mountSearchDialog()
		wrappers.push(wrapper)

		await wrapper.get('[data-testid="search-favorites-tab"]').trigger('click')
		await wrapper.get('input').trigger('keydown', { key: 'Enter', isComposing: false })
		await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/ask'))

		expect(router.currentRoute.value.query).toEqual({ conversationId: 'conv-001', messageId: 'conv-001-message-2' })
		expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false])
	})

	it('should not start a favorite question while an IME composition is active', async () => {
		const { router, wrapper } = await mountSearchDialog()
		wrappers.push(wrapper)

		await wrapper.get('[data-testid="search-favorites-tab"]').trigger('click')
		await wrapper.get('input').trigger('keydown', { key: 'Enter', isComposing: true })

		expect(router.currentRoute.value.path).toBe('/')
		expect(wrapper.emitted('update:modelValue')).toBeUndefined()
	})

	it('should show an error instead of rerunning a question when the original message is missing', async () => {
		const { router, wrapper } = await mountSearchDialog()
		wrappers.push(wrapper)
		const favoritesStore = useFavoritesStore()
		favoritesStore.items[0]!.conversationId = 'missing-conversation'

		await wrapper.get('[data-testid="search-favorites-tab"]').trigger('click')
		await wrapper.get('.result-item').trigger('click')

		expect(wrapper.text()).toContain('原始對話或回答已不存在')
		expect(router.currentRoute.value.path).toBe('/')
		expect(router.currentRoute.value.query.q).toBeUndefined()
	})

	it('should keep the dialog open while another answer is being generated', async () => {
		const { router, wrapper } = await mountSearchDialog()
		wrappers.push(wrapper)
		const conversationStore = useConversationStore()
		conversationStore.isResponding = true

		await wrapper.get('[data-testid="search-favorites-tab"]').trigger('click')
		await wrapper.get('.result-item').trigger('click')

		expect(wrapper.text()).toContain('目前正在產生回答，請稍候完成後再開啟收藏。')
		expect(router.currentRoute.value.path).toBe('/')
		expect(wrapper.emitted('update:modelValue')).toBeUndefined()
	})
})

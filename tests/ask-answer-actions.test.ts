import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useConversationStore } from '@/stores/conversation'
import { useNotebooksStore } from '@/stores/notebooks'
import AskView from '@/views/AskView.vue'

const EmptyView = { template: '<div />' }
let wrapper: VueWrapper | null = null

async function mountAskView(): Promise<{
	conversationStore: ReturnType<typeof useConversationStore>
	notebooksStore: ReturnType<typeof useNotebooksStore>
}> {
	const pinia = createPinia()
	setActivePinia(pinia)
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [
			{ path: '/ask', component: AskView },
			{ path: '/notebooks', component: EmptyView },
			{ path: '/notebooks/:id', component: EmptyView },
			{ path: '/documents/:id', component: EmptyView },
		],
	})
	await router.push('/ask')
	await router.isReady()

	wrapper = mount(
		{
			components: { AskView },
			template: '<VApp><AskView /></VApp>',
		},
		{
			attachTo: document.body,
			global: {
				plugins: [pinia, createVuetify({ components, directives }), router],
			},
		},
	)
	const conversationStore = useConversationStore()
	conversationStore.messages = [
		{ id: 'question-1', role: 'user', content: '住宿費用上限是多少？', createdAt: '2026-09-02T09:00:00.000Z' },
		{
			id: 'answer-1',
			role: 'assistant',
			content: '國內住宿每晚原則上限為新台幣 3,000 元 [1]。',
			createdAt: '2026-09-02T09:00:01.000Z',
			citations: [{
				id: 'citation-1',
				documentId: 'document-1',
				title: '員工差旅與費用報支辦法',
				section: '4.2 住宿費用',
				excerpt: '國內住宿每晚以新台幣 3,000 元為原則。',
				confidence: 0.94,
			}],
			trace: { documentCount: 1, citationCount: 1, retrievedCount: 1, elapsedMs: 800, stages: [] },
		},
	]
	await nextTick()
	return { conversationStore, notebooksStore: useNotebooksStore() }
}

beforeEach(() => {
	vi.stubGlobal('ResizeObserver', class ResizeObserverStub {
		observe(): void {}
		unobserve(): void {}
		disconnect(): void {}
	})
	vi.stubGlobal('IntersectionObserver', class IntersectionObserverStub {
		observe(): void {}
		unobserve(): void {}
		disconnect(): void {}
	})
	vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
	vi.stubGlobal('visualViewport', {
		width: 1280,
		height: 720,
		offsetLeft: 0,
		offsetTop: 0,
		pageLeft: 0,
		pageTop: 0,
		scale: 1,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
	})
})

afterEach(() => {
	wrapper?.unmount()
	wrapper = null
	document.body.innerHTML = ''
	vi.unstubAllGlobals()
})

describe('AskView answer actions', () => {
	it('should require a reason before recording unhelpful feedback', async () => {
		const { conversationStore } = await mountAskView()
		await wrapper!.get('[aria-label="這個回答沒有幫助"]').trigger('click')
		await flushPromises()

		expect(document.getElementById('answer-feedback-dialog')).not.toBeNull()
		document.body.querySelector<HTMLButtonElement>('[data-testid="submit-negative-feedback"]')?.click()
		await nextTick()
		expect(document.body.textContent).toContain('請輸入這個回答需要改善的原因。')
		expect(conversationStore.messages[1]?.feedback).toBeUndefined()

		const reasonInput = document.body.querySelector<HTMLTextAreaElement>('[data-testid="feedback-reason-input"] textarea')!
		reasonInput.value = '引用的規定版本不正確。'
		reasonInput.dispatchEvent(new Event('input', { bubbles: true }))
		document.body.querySelector<HTMLButtonElement>('[data-testid="submit-negative-feedback"]')?.click()
		await flushPromises()

		expect(conversationStore.messages[1]?.feedback).toMatchObject({ value: 'unhelpful', reason: '引用的規定版本不正確。' })
		expect(wrapper!.get('[aria-label="這個回答沒有幫助"]').attributes('aria-pressed')).toBe('true')

		await wrapper!.get('[aria-label="這個回答沒有幫助"]').trigger('click')
		expect(conversationStore.messages[1]?.feedback).toBeUndefined()
	})

	it('should save an answer only to an editable selected notebook', async () => {
		const { notebooksStore } = await mountAskView()
		const viewerNotebook = notebooksStore.notebooks[1]
		viewerNotebook.members.find((member) => member.id === 'user-current')!.role = 'viewer'

		await wrapper!.get('[aria-label="將這個回答存入筆記本"]').trigger('click')
		await flushPromises()
		const notebookSelect = wrapper!.findAllComponents({ name: 'VSelect' })
			.find((component) => component.props('label') === '選擇筆記本')!
		expect(notebookSelect.props('items')).toEqual([{ title: '產品研究筆記', value: 'notebook-product', disabled: false }])

		notebookSelect.vm.$emit('update:modelValue', 'notebook-product')
		await nextTick()
		document.body.querySelector<HTMLButtonElement>('[data-testid="confirm-save-answer"]')?.click()
		await flushPromises()

		const savedAnswer = notebooksStore.notebooks[0].documents.find((document) => document.source.type === 'ai-answer' && document.source.answerId === 'answer-1')
		expect(savedAnswer).toMatchObject({
			source: {
				type: 'ai-answer',
				question: '住宿費用上限是多少？',
				content: '國內住宿每晚原則上限為新台幣 3,000 元 [1]。',
			},
		})
		expect(savedAnswer?.source.type === 'ai-answer' ? savedAnswer.source.citations : []).toHaveLength(1)
		expect(document.body.textContent).toContain('已將回答存入「產品研究筆記」。')

		viewerNotebook.members.find((member) => member.id === 'user-current')!.role = 'editor'
		await wrapper!.get('[aria-label="已存入 1 本筆記本，可繼續新增"]').trigger('click')
		await flushPromises()
		const secondNotebookSelect = wrapper!.findAllComponents({ name: 'VSelect' })
			.find((component) => component.props('label') === '選擇筆記本')!
		expect(secondNotebookSelect.props('items')).toEqual([
			{ title: '產品研究筆記（已儲存）', value: 'notebook-product', disabled: true },
			{ title: '新人培訓資料', value: 'notebook-onboarding', disabled: false },
		])
		secondNotebookSelect.vm.$emit('update:modelValue', 'notebook-onboarding')
		await nextTick()
		document.body.querySelector<HTMLButtonElement>('[data-testid="confirm-save-answer"]')?.click()
		await flushPromises()

		expect(notebooksStore.getSavedNotebookIds('answer-1')).toEqual(['notebook-product', 'notebook-onboarding'])
		expect(wrapper!.get('[aria-label="已存入 2 本筆記本，可繼續新增"]').exists()).toBe(true)
	})
})

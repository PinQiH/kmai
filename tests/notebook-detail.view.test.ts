import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useConversationStore } from '@/stores/conversation'
import { useNotebooksStore } from '@/stores/notebooks'
import NotebookDetailView from '@/views/NotebookDetailView.vue'

globalThis.ResizeObserver = class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
} as typeof ResizeObserver

Object.defineProperty(globalThis, 'visualViewport', {
	configurable: true,
	value: {
		addEventListener: vi.fn(),
		dispatchEvent: vi.fn(() => true),
		height: 768,
		offsetLeft: 0,
		offsetTop: 0,
		onresize: null,
		onscroll: null,
		pageLeft: 0,
		pageTop: 0,
		removeEventListener: vi.fn(),
		scale: 1,
		width: 1024,
	} satisfies Partial<VisualViewport>,
})

let wrapper: VueWrapper | null = null

afterEach(() => {
	wrapper?.unmount()
	wrapper = null
	document.body.innerHTML = ''
})

describe('NotebookDetailView sharing confirmation', () => {
	it('should keep the member when cancellation is selected and remove it only after confirmation', async () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const router = createRouter({
			history: createMemoryHistory(),
			routes: [
				{ path: '/notebooks', component: { template: '<div />' } },
				{ path: '/notebooks/:id', component: NotebookDetailView },
			],
		})
		await router.push('/notebooks/notebook-product')
		await router.isReady()

		wrapper = mount(
			{
				components: { NotebookDetailView },
				template: '<VApp><NotebookDetailView /></VApp>',
			},
			{
				attachTo: document.body,
				global: {
					plugins: [pinia, createVuetify({ components, directives }), router],
				},
			},
		)
		const store = useNotebooksStore()

		await wrapper.get('[data-testid="open-sharing-dialog"]').trigger('click')
		await flushPromises()
		await nextTick()

		const removalTrigger = document.body.querySelector<HTMLButtonElement>('[data-testid="stop-sharing-group-product"]')
		expect(removalTrigger).not.toBeNull()
		removalTrigger?.click()
		await nextTick()

		const dialog = document.body.querySelector<HTMLElement>('.v-dialog')
		expect(dialog?.textContent).toContain('停止分享這本筆記本？')
		expect(dialog?.textContent).toContain('產品企劃部')
		expect(dialog?.textContent).toContain('這不會刪除筆記本')
		expect(store.notebooks[0].members.some((member) => member.id === 'group-product')).toBe(true)
		expect(document.activeElement?.getAttribute('data-testid')).toBe('keep-sharing-button')

		document.body.querySelector<HTMLButtonElement>('[data-testid="keep-sharing-button"]')?.click()
		await nextTick()

		expect(document.body.textContent).toContain('只有受邀的公司成員或群組能查看內容。')
		expect(store.notebooks[0].members.some((member) => member.id === 'group-product')).toBe(true)
		expect(document.activeElement?.getAttribute('data-testid')).toBe('stop-sharing-group-product')

		document.body.querySelector<HTMLButtonElement>('[data-testid="stop-sharing-group-product"]')?.click()
		await nextTick()
		document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
		await nextTick()

		expect(document.body.textContent).toContain('只有受邀的公司成員或群組能查看內容。')
		expect(store.notebooks[0].members.some((member) => member.id === 'group-product')).toBe(true)
		expect(document.activeElement?.getAttribute('data-testid')).toBe('stop-sharing-group-product')

		document.body.querySelector<HTMLButtonElement>('[data-testid="stop-sharing-group-product"]')?.click()
		await nextTick()
		wrapper.findComponent({ name: 'VDialog' }).vm.$emit('update:modelValue', false)
		await nextTick()

		expect(document.body.textContent).toContain('只有受邀的公司成員或群組能查看內容。')
		expect(store.notebooks[0].members.some((member) => member.id === 'group-product')).toBe(true)
		expect(document.activeElement?.getAttribute('data-testid')).toBe('stop-sharing-group-product')

		document.body.querySelector<HTMLButtonElement>('[data-testid="stop-sharing-group-product"]')?.click()
		await nextTick()
		document.body.querySelector<HTMLButtonElement>('[data-testid="confirm-stop-sharing-button"]')?.click()
		await nextTick()

		expect(store.notebooks[0].members.some((member) => member.id === 'group-product')).toBe(false)
		expect(document.body.textContent).not.toContain('停止分享這本筆記本？')
		expect(document.activeElement?.getAttribute('data-testid')).toBe('close-sharing-dialog')
	})
})

describe('NotebookDetailView knowledge graph', () => {
	it('should add text and URL sources from the compact content menu', async () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const router = createRouter({
			history: createMemoryHistory(),
			routes: [
				{ path: '/notebooks', component: { template: '<div />' } },
				{ path: '/notebooks/:id', component: NotebookDetailView },
			],
		})
		await router.push('/notebooks/notebook-product')
		await router.isReady()
		wrapper = mount(
			{ components: { NotebookDetailView }, template: '<VApp><NotebookDetailView /></VApp>' },
			{ attachTo: document.body, global: { plugins: [pinia, createVuetify({ components, directives }), router] } },
		)
		const store = useNotebooksStore()

		await wrapper.get('[data-testid="add-notebook-content"]').trigger('click')
		await flushPromises()
		document.body.querySelector<HTMLElement>('[data-testid="add-notebook-text"]')?.click()
		await flushPromises()
		const titleInput = document.body.querySelector<HTMLInputElement>('[data-testid="text-source-title"] input')!
		const contentInput = document.body.querySelector<HTMLTextAreaElement>('[data-testid="text-source-content"] textarea')!
		titleInput.value = '會議重點'
		titleInput.dispatchEvent(new Event('input', { bubbles: true }))
		contentInput.value = '# 決議\n\n- 先完成預覽'
		contentInput.dispatchEvent(new Event('input', { bubbles: true }))
		document.body.querySelector<HTMLButtonElement>('[data-testid="confirm-add-text-source"]')?.click()
		await flushPromises()
		expect(store.notebooks[0].documents[0]?.source).toMatchObject({ type: 'text', format: 'markdown' })

		await wrapper.get('[data-testid="add-notebook-content"]').trigger('click')
		await flushPromises()
		document.body.querySelector<HTMLElement>('[data-testid="add-notebook-url"]')?.click()
		await flushPromises()
		const urlInput = document.body.querySelector<HTMLInputElement>('[data-testid="url-source-value"] input')!
		urlInput.value = 'https://example.com/meeting'
		urlInput.dispatchEvent(new Event('input', { bubbles: true }))
		document.body.querySelector<HTMLButtonElement>('[data-testid="confirm-add-url-source"]')?.click()
		await flushPromises()
		expect(store.notebooks[0].documents[0]?.source).toMatchObject({ type: 'url', domain: 'example.com' })
	})

	it('should render the notebook graph and react to newly uploaded documents', async () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const router = createRouter({
			history: createMemoryHistory(),
			routes: [
				{ path: '/notebooks', component: { template: '<div />' } },
				{ path: '/notebooks/:id', component: NotebookDetailView },
			],
		})
		await router.push('/notebooks/notebook-product')
		await router.isReady()

		wrapper = mount(
			{
				components: { NotebookDetailView },
				template: '<VApp><NotebookDetailView /></VApp>',
			},
			{
				attachTo: document.body,
				global: {
					plugins: [pinia, createVuetify({ components, directives }), router],
				},
			},
		)
		const store = useNotebooksStore()
		await flushPromises()
		await nextTick()

		expect(wrapper.get('[data-testid="notebook-knowledge-graph"]').attributes('aria-label')).toBe('這本筆記本的知識圖譜')
		expect(wrapper.get('[data-testid="add-notebook-content"]').classes()).toContain('text-primary')
		expect(wrapper.get('[data-testid="notebook-knowledge-graph"]').text()).not.toContain('這本筆記本的知識圖譜')
		expect(wrapper.get('[data-testid="notebook-tab-graph"]').attributes('aria-selected')).toBe('true')
		expect(wrapper.get('[data-testid="notebook-tab-graph"]').attributes('aria-controls')).toBe('notebook-panel-graph')
		expect(wrapper.get('[data-testid="notebook-graph-panel"]').attributes('role')).toBe('tabpanel')
		expect(wrapper.get('[data-testid="notebook-graph-panel"]').attributes('aria-labelledby')).toBe('notebook-tab-graph')
		expect(wrapper.find('[data-testid="notebook-documents-panel"]').exists()).toBe(false)
		expect(wrapper.text()).toContain('2026-Q3-市場觀察.pdf')
		expect(wrapper.text()).toContain('市場趨勢')

		await store.addDocuments({
			notebookId: 'notebook-product',
			files: [new File(['notes'], '訪談逐字稿.md', { type: 'text/markdown' })],
		})
		await nextTick()

		expect(wrapper.get('[data-testid="notebook-knowledge-graph"]').text()).toContain('4 份可用文件')
		expect(wrapper.get('[data-testid="notebook-knowledge-canvas"]').text()).toContain('訪談逐字稿.md')

		store.notebooks[0].documents.push(
			{ id: 'processing-document', name: '處理中.pdf', size: '1 MB', uploadedAt: '2026-09-02', status: 'processing', source: { type: 'file', fileName: '處理中.pdf', mimeType: 'application/pdf', extension: 'pdf' } },
			{ id: 'failed-document', name: '處理失敗.pdf', size: '1 MB', uploadedAt: '2026-09-02', status: 'failed', source: { type: 'file', fileName: '處理失敗.pdf', mimeType: 'application/pdf', extension: 'pdf' } },
		)
		await nextTick()

		expect(wrapper.get('[data-testid="notebook-knowledge-graph"]').text()).toContain('1 份處理中')
		expect(wrapper.get('[data-testid="notebook-knowledge-graph"]').text()).toContain('1 份失敗')

		store.notebooks[0].documents.push(...Array.from({ length: 20 }, (_, index) => ({
			id: `bulk-document-${index}`,
			name: `批次文件-${index + 1}.pdf`,
			size: '1 MB',
			uploadedAt: '2026-09-02',
			status: 'ready' as const,
			source: { type: 'file' as const, fileName: `批次文件-${index + 1}.pdf`, mimeType: 'application/pdf', extension: 'pdf' },
		})))
		await nextTick()

		expect(wrapper.get('[data-testid="notebook-tab-documents"]').text()).toContain('文件（26）')
		expect(wrapper.get('[data-testid="notebook-graph-panel"]').isVisible()).toBe(true)
		expect(wrapper.find('[data-testid="notebook-documents-panel"]').exists()).toBe(false)

		await wrapper.get('[data-testid="notebook-tab-documents"]').trigger('click')
		await nextTick()

		expect(wrapper.get('[data-testid="notebook-documents-panel"]').text()).toContain('訪談逐字稿.md')
		expect(wrapper.get('[data-testid="notebook-tab-documents"]').attributes('aria-controls')).toBe('notebook-panel-documents')
		expect(wrapper.get('[data-testid="notebook-documents-panel"]').attributes('aria-labelledby')).toBe('notebook-tab-documents')
		expect(wrapper.get('[data-testid="desktop-document-list"]').findAll('tbody tr')).toHaveLength(26)
		expect(wrapper.find('[data-testid="mobile-document-list"]').exists()).toBe(false)
		expect(wrapper.get('[data-testid="document-status-processing-document"]').text()).toBe('處理中')
		expect(wrapper.get('[data-testid="document-status-failed-document"]').text()).toBe('處理失敗')
		expect(wrapper.find('[data-testid="notebook-graph-panel"]').exists()).toBe(false)

		for (const previewCase of [
			{ documentId: 'nb-doc-001', testId: 'file-source-preview' },
			{ documentId: 'nb-doc-002', testId: 'markdown-preview' },
			{ documentId: 'nb-doc-003', testId: 'url-source-preview' },
		]) {
			await wrapper.get(`[data-testid="open-document-${previewCase.documentId}"]`).trigger('click')
			await flushPromises()
			expect(document.body.querySelector(`[data-testid="${previewCase.testId}"]`)).not.toBeNull()
			document.body.querySelector<HTMLButtonElement>('[data-testid="close-document-preview"]')?.click()
			await nextTick()
		}

		expect(store.saveAnswerToNotebook({
			notebookId: 'notebook-product',
			answerId: 'answer-preview',
			question: '市場趨勢有哪些重點？',
			answer: '市場需求正逐步成長。',
			citations: [{
				id: 'citation-preview',
				documentId: 'nb-doc-001',
				title: '2026-Q3-市場觀察.pdf',
				section: '市場趨勢',
				excerpt: '第三季需求較前期增加。',
				confidence: 0.91,
			}],
		})).toBe('saved')
		await nextTick()

		const savedAnswer = store.notebooks[0].documents.find((document) => document.source.type === 'ai-answer' && document.source.answerId === 'answer-preview')!
		await wrapper.get(`[data-testid="open-document-${savedAnswer.id}"]`).trigger('click')
		await flushPromises()
		expect(document.body.textContent).toContain('原始問題')
		expect(document.body.textContent).toContain('市場趨勢有哪些重點？')
		expect(document.body.textContent).toContain('市場需求正逐步成長。')
		expect(document.body.textContent).toContain('2026-Q3-市場觀察.pdf')
		document.body.querySelector<HTMLButtonElement>('[data-testid="close-document-preview"]')?.click()
		await nextTick()
		expect(document.activeElement?.getAttribute('data-testid')).toBe(`open-document-${savedAnswer.id}`)
	})
})

describe('NotebookDetailView notebook actions', () => {
	it('should start a new conversation using the current notebook', async () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const router = createRouter({
			history: createMemoryHistory(),
			routes: [
				{ path: '/ask', component: { template: '<div />' } },
				{ path: '/notebooks', component: { template: '<div />' } },
				{ path: '/notebooks/:id', component: NotebookDetailView },
			],
		})
		await router.push('/notebooks/notebook-product')
		await router.isReady()

		wrapper = mount(
			{
				components: { NotebookDetailView },
				template: '<VApp><NotebookDetailView /></VApp>',
			},
			{
				attachTo: document.body,
				global: {
					plugins: [pinia, createVuetify({ components, directives }), router],
				},
			},
		)
		const conversationStore = useConversationStore()
		const routerPush = vi.spyOn(router, 'push')
		conversationStore.messages.push({ id: 'old-message', role: 'user', content: '舊問題', createdAt: new Date().toISOString() })

		await wrapper.get('[data-testid="ask-notebook"]').trigger('click')
		await flushPromises()

		expect(routerPush).toHaveBeenCalledWith('/ask')
		expect(conversationStore.selectedKnowledgeSourceId).toBe('notebook-product')
		expect(conversationStore.selectedScope).toBe('產品研究筆記')
		expect(conversationStore.messages).toEqual([])
	})

	it('should edit notebook details through a dialog and delete only after explicit confirmation', async () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const router = createRouter({
			history: createMemoryHistory(),
			routes: [
				{ path: '/notebooks', component: { template: '<div />' } },
				{ path: '/notebooks/:id', component: NotebookDetailView },
			],
		})
		await router.push('/notebooks/notebook-product')
		await router.isReady()

		wrapper = mount(
			{
				components: { NotebookDetailView },
				template: '<VApp><NotebookDetailView /></VApp>',
			},
			{
				attachTo: document.body,
				global: {
					plugins: [pinia, createVuetify({ components, directives }), router],
				},
			},
		)
		const notebooksStore = useNotebooksStore()
		const conversationStore = useConversationStore()
		conversationStore.selectKnowledgeSource({ id: 'notebook-product', name: '產品策略筆記本', defaultWebSearchEnabled: true })

		await wrapper.get('[data-testid="notebook-actions-menu"]').trigger('click')
		await flushPromises()
		document.body.querySelector<HTMLElement>('[data-testid="edit-notebook-action"]')?.click()
		await nextTick()

		const nameInput = document.body.querySelector<HTMLInputElement>('[data-testid="edit-notebook-name-input"] input')
		const descriptionInput = document.body.querySelector<HTMLTextAreaElement>('[data-testid="edit-notebook-description-input"] textarea')
		expect(nameInput).not.toBeNull()
		expect(descriptionInput).not.toBeNull()
		if (nameInput && descriptionInput) {
			nameInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, isComposing: true, key: 'Enter' }))
			await nextTick()
			expect(document.body.textContent).toContain('編輯筆記本')
			nameInput.value = '市場洞察筆記本'
			nameInput.dispatchEvent(new Event('input', { bubbles: true }))
			descriptionInput.value = '整理市場訊號與客戶訪談。'
			descriptionInput.dispatchEvent(new Event('input', { bubbles: true }))
		}
		document.body.querySelector<HTMLButtonElement>('[data-testid="confirm-edit-notebook"]')?.click()
		await nextTick()

		expect(notebooksStore.notebooks.find((item) => item.id === 'notebook-product')?.name).toBe('市場洞察筆記本')
		expect(notebooksStore.notebooks.find((item) => item.id === 'notebook-product')?.description).toBe('整理市場訊號與客戶訪談。')
		expect(conversationStore.selectedScope).toBe('市場洞察筆記本')
		expect(wrapper.text()).toContain('市場洞察筆記本')
		expect(wrapper.text()).toContain('整理市場訊號與客戶訪談。')
		expect(document.activeElement?.id).toBe('notebook-actions-menu')

		await wrapper.get('[data-testid="notebook-actions-menu"]').trigger('click')
		await flushPromises()
		document.body.querySelector<HTMLElement>('[data-testid="delete-notebook-action"]')?.click()
		await nextTick()

		expect(document.body.textContent).toContain('刪除「市場洞察筆記本」？')
		expect(document.body.textContent).toContain('此操作無法在目前頁面復原。')
		expect(notebooksStore.notebooks.some((item) => item.id === 'notebook-product')).toBe(true)
		document.body.querySelector<HTMLButtonElement>('[data-testid="confirm-delete-notebook"]')
			?.closest<HTMLElement>('.confirm-dialog-card')
			?.querySelector<HTMLButtonElement>('button:not([data-testid])')
			?.click()
		await nextTick()
		expect(notebooksStore.notebooks.some((item) => item.id === 'notebook-product')).toBe(true)
		expect(document.activeElement?.id).toBe('notebook-actions-menu')

		await wrapper.get('[data-testid="notebook-actions-menu"]').trigger('click')
		await flushPromises()
		document.body.querySelector<HTMLElement>('[data-testid="delete-notebook-action"]')?.click()
		await nextTick()

		document.body.querySelector<HTMLButtonElement>('[data-testid="confirm-delete-notebook"]')?.click()
		await flushPromises()

		expect(notebooksStore.notebooks.some((item) => item.id === 'notebook-product')).toBe(false)
		expect(router.currentRoute.value.path).toBe('/notebooks')
		expect(conversationStore.selectedKnowledgeSourceId).toBe('policy')
		expect(conversationStore.selectedScope).toBe('公司制度')
	})
})

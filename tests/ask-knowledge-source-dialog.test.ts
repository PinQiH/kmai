import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
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
	store: ReturnType<typeof useConversationStore>
	notebooksStore: ReturnType<typeof useNotebooksStore>
}> {
	const pinia = createPinia()
	setActivePinia(pinia)
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [
			{ path: '/ask', component: AskView },
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
	await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))

	return { store: useConversationStore(), notebooksStore: useNotebooksStore() }
}

function getDialog(): HTMLElement {
	const dialog = document.getElementById('knowledge-source-dialog')
	if (!(dialog instanceof HTMLElement)) throw new Error('找不到知識來源彈窗')
	return dialog
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
		takeRecords(): IntersectionObserverEntry[] { return [] }
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

describe('AskView knowledge source dialog', () => {
	it('should group compact name-only sources by ownership with an accessible dialog name', async () => {
		await mountAskView()
		const trigger = wrapper!.get('#knowledge-source-trigger')

		expect(trigger.attributes('aria-haspopup')).toBe('dialog')
		expect(trigger.attributes('aria-expanded')).toBe('false')
		await trigger.trigger('click')
		await flushPromises()

		const dialog = getDialog()
		expect(trigger.attributes('aria-expanded')).toBe('true')
		expect(dialog.getAttribute('aria-labelledby')).toBe('knowledge-source-title')
		expect(dialog.textContent).toContain('凌群知識庫')
		expect(dialog.textContent).toContain('我的筆記本')
		expect(dialog.textContent).toContain('其他')
		expect(dialog.textContent).toContain('公司制度')
		expect(dialog.textContent).toContain('人事流程')
		expect(dialog.textContent).toContain('資訊安全')
		expect(dialog.textContent).toContain('作業流程')
		expect(dialog.textContent).toContain('模型一般知識')
		expect(dialog.textContent).not.toContain('預設搜尋網路')
		expect(dialog.textContent).toContain('員工差旅與費用報支辦法')
		expect(dialog.textContent).toContain('每頁最多 8 份')
		expect(dialog.textContent).toContain('完成')
	})

	it('should keep document-backed sources open until confirmation and restore focus', async () => {
		const { store } = await mountAskView()
		const trigger = wrapper!.get<HTMLButtonElement>('#knowledge-source-trigger')
		trigger.element.focus()

		await trigger.trigger('click')
		await flushPromises()
		getDialog().querySelector<HTMLInputElement>('[data-testid="knowledge-source-policy"] input')?.click()
		await flushPromises()
		expect(getDialog().style.display).not.toBe('none')
		getDialog().querySelector<HTMLInputElement>('[data-testid="knowledge-source-benefits"] input')?.click()
		await flushPromises()
		expect(getDialog().textContent).toContain('新進同仁到職指南')
		getDialog().querySelector<HTMLButtonElement>('[data-testid="confirm-document-scope"]')?.click()
		await vi.waitFor(() => expect(getDialog().style.display).toBe('none'))

		expect(store.selectedKnowledgeSourceId).toBe('benefits')
		expect(store.selectedScope).toBe('人事流程')
		expect(document.activeElement).toBe(trigger.element)
	})

	it('should select a company knowledge document without sending a question', async () => {
		const { store } = await mountAskView()
		await wrapper!.get('#knowledge-source-trigger').trigger('click')
		await flushPromises()

		const dialog = getDialog()
		dialog.querySelector<HTMLInputElement>('[data-testid="knowledge-source-benefits"] input')?.click()
		await flushPromises()
		dialog.querySelector<HTMLInputElement>('[data-testid="document-scope-doc-002"] input')?.click()
		await flushPromises()

		expect(store.selectedKnowledgeSourceId).toBe('benefits')
		expect(store.selectedDocuments).toEqual([{ id: 'doc-002', name: '新進同仁到職指南' }])
		expect(store.messages).toEqual([])
	})

	it('should display at most eight documents per page and expose pagination', async () => {
		const { notebooksStore } = await mountAskView()
		const notebook = notebooksStore.notebooks.find((item) => item.id === 'notebook-product')!
		notebook.documents = Array.from({ length: 10 }, (_, index) => ({
			id: `document-${index + 1}`,
			name: `測試文件-${index + 1}.pdf`,
			size: '1 MB',
			uploadedAt: '2026-09-02',
			status: 'ready' as const,
			source: { type: 'file' as const, fileName: `測試文件-${index + 1}.pdf`, mimeType: 'application/pdf', extension: 'pdf' },
		}))

		await wrapper!.get('#knowledge-source-trigger').trigger('click')
		await flushPromises()
		getDialog().querySelector<HTMLInputElement>('[data-testid="knowledge-source-notebook-product"] input')?.click()
		await flushPromises()

		const dialog = getDialog()
		expect(dialog.querySelectorAll('[data-testid^="document-scope-document-"]')).toHaveLength(8)
		expect(dialog.querySelector('[data-testid="document-scope-pagination"]')).not.toBeNull()
		expect(dialog.textContent).toContain('顯示 1–8，共 10 份；每頁最多 8 份')

		const pageButtons = dialog.querySelectorAll<HTMLButtonElement>('.v-pagination__item button')
		pageButtons[pageButtons.length - 1]?.click()
		await flushPromises()

		expect(dialog.querySelectorAll('[data-testid^="document-scope-document-"]')).toHaveLength(2)
		expect(dialog.textContent).toContain('測試文件-9.pdf')
		expect(dialog.textContent).toContain('測試文件-10.pdf')
		expect(dialog.textContent).toContain('顯示 9–10，共 10 份；每頁最多 8 份')
	})

	it('should progressively reveal searchable ready documents and keep the selected scope visible', async () => {
		const { store, notebooksStore } = await mountAskView()
		const notebook = notebooksStore.notebooks.find((item) => item.id === 'notebook-product')!
		notebook.documents = [
			{ id: 'doc-market', name: '2026-Q3-市場觀察.pdf', size: '2.4 MB', uploadedAt: '2026-08-18', status: 'ready', source: { type: 'file', fileName: '2026-Q3-市場觀察.pdf', mimeType: 'application/pdf', extension: 'pdf' } },
			{ id: 'doc-interview', name: '客戶訪談摘要.docx', size: '860 KB', uploadedAt: '2026-08-17', status: 'ready', source: { type: 'file', fileName: '客戶訪談摘要.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extension: 'docx' } },
			{ id: 'doc-processing', name: '競品資料.pdf', size: '1.2 MB', uploadedAt: '2026-08-16', status: 'processing', source: { type: 'file', fileName: '競品資料.pdf', mimeType: 'application/pdf', extension: 'pdf' } },
		]
		const trigger = wrapper!.get<HTMLButtonElement>('#knowledge-source-trigger')

		await trigger.trigger('click')
		await flushPromises()
		getDialog().querySelector<HTMLInputElement>('[data-testid="knowledge-source-notebook-product"] input')?.click()
		await flushPromises()

		const dialog = getDialog()
		expect(dialog.style.display).not.toBe('none')
		expect(dialog.textContent).toContain('限定文件（選填）')
		expect(dialog.textContent).toContain('2 份可用')
		expect(dialog.textContent).toContain('另有 1 份文件仍在處理或處理失敗')
		expect(dialog.textContent).not.toContain('競品資料.pdf')

		const searchInput = dialog.querySelector<HTMLInputElement>('[data-testid="document-scope-search"] input')!
		searchInput.value = '訪談'
		searchInput.dispatchEvent(new Event('input', { bubbles: true }))
		await flushPromises()

		expect(dialog.textContent).toContain('客戶訪談摘要.docx')
		expect(dialog.textContent).not.toContain('2026-Q3-市場觀察.pdf')
		dialog.querySelector<HTMLInputElement>('[data-testid="document-scope-doc-interview"] input')?.click()
		await flushPromises()

		expect(store.selectedDocuments).toEqual([{ id: 'doc-interview', name: '客戶訪談摘要.docx' }])
		dialog.querySelector<HTMLButtonElement>('[data-testid="confirm-document-scope"]')?.click()
		await vi.waitFor(() => expect(getDialog().style.display).toBe('none'))
		expect(trigger.text()).toContain('產品研究筆記 · 客戶訪談摘要.docx')
		expect(trigger.attributes('aria-label')).toContain('限定回答範圍')

		notebook.documents = notebook.documents.filter((document) => document.id !== 'doc-interview')
		await flushPromises()

		expect(store.selectedDocuments).toEqual([])
		expect(trigger.text()).toBe('產品研究筆記')
	})

	it('should place the summary rail inside the scroll area before its outer scrollbar', async () => {
		const { store } = await mountAskView()
		store.openConversation(store.conversations[0].id)
		await flushPromises()

		const scrollArea = wrapper!.get('.ask-scroll')
		const layout = scrollArea.get('.ask-scroll-layout.has-outline')
		const [content, outline] = Array.from(layout.element.children)

		expect(content.classList.contains('ask-content')).toBe(true)
		expect(outline.classList.contains('outline-rail')).toBe(true)
	})
})

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useConversationStore } from '@/stores/conversation'
import HomeView from '@/views/HomeView.vue'
import LibraryView from '@/views/LibraryView.vue'
import NotebooksView from '@/views/NotebooksView.vue'

const EmptyView = { template: '<div />' }
let wrapper: VueWrapper | null = null

async function mountView(component: typeof HomeView | typeof LibraryView | typeof NotebooksView, path: string): Promise<Router> {
	const pinia = createPinia()
	setActivePinia(pinia)
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [
			{ path: '/', component: HomeView },
			{ path: '/library', component: LibraryView },
			{ path: '/notebooks', component: NotebooksView },
			{ path: '/notebooks/:id', component: EmptyView },
			{ path: '/documents/:id', component: EmptyView },
			{ path: '/graph', name: 'graph', component: EmptyView },
			{ path: '/ask', component: EmptyView },
		],
	})
	await router.push(path)
	await router.isReady()

	wrapper = mount(
		{
			components: { TestedView: component },
			template: '<VApp><TestedView /></VApp>',
		},
		{
			attachTo: document.body,
			global: {
				plugins: [pinia, createVuetify({ components, directives }), router],
				stubs: { KnowledgeConstellation: true },
			},
		},
	)
	return router
}

beforeEach(() => {
	vi.stubGlobal('ResizeObserver', class ResizeObserverStub {
		observe(): void {}
		unobserve(): void {}
		disconnect(): void {}
	})
	vi.stubGlobal('matchMedia', vi.fn(() => ({
		matches: true,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
	})))
})

afterEach(() => {
	wrapper?.unmount()
	wrapper = null
	document.body.innerHTML = ''
	vi.unstubAllGlobals()
})

describe('knowledge source entry actions', () => {
	it('should show four scoped knowledge bases and one all-documents entry on the home page', async () => {
		await mountView(HomeView, '/')

		const knowledgeBaseLinks = wrapper!.findAll('[data-testid^="home-knowledge-base-"]')
		expect(knowledgeBaseLinks).toHaveLength(4)
		expect(knowledgeBaseLinks.map((link) => link.attributes('href'))).toEqual([
			'/library?source=policy',
			'/library?source=benefits',
			'/library?source=information-security',
			'/library?source=operations',
		])
		expect(wrapper!.findAll('[data-testid="all-knowledge-documents"]')).toHaveLength(1)
		expect(wrapper!.get('[data-testid="all-knowledge-documents"]').attributes('href')).toBe('/library')
		expect(wrapper!.text()).not.toContain('查看知識庫')
	})

	it('should reveal the library ask action only after selecting a knowledge base', async () => {
		const router = await mountView(LibraryView, '/library')
		const conversationStore = useConversationStore()

		expect(wrapper!.find('[data-testid="ask-knowledge-base"]').exists()).toBe(false)
		expect(wrapper!.text()).not.toContain('知識庫範圍')
		expect(wrapper!.get('[role="group"][aria-label="選擇知識庫"]').exists()).toBe(true)
		await wrapper!.get('[data-testid="library-source-benefits"]').trigger('click')
		expect(wrapper!.text()).toContain('詢問這個知識庫')
		expect(wrapper!.text()).toContain('新進同仁到職指南')
		expect(wrapper!.text()).not.toContain('員工差旅與費用報支辦法')

		await wrapper!.get('[data-testid="ask-knowledge-base"]').trigger('click')
		await flushPromises()

		expect(router.currentRoute.value.path).toBe('/ask')
		expect(conversationStore.selectedKnowledgeSourceId).toBe('benefits')
		expect(conversationStore.selectedDocuments).toEqual([])
		expect(conversationStore.messages).toEqual([])
	})

	it('should honor a knowledge base selected from the home page query', async () => {
		await mountView(LibraryView, '/library?source=policy')

		expect(wrapper!.get('[data-testid="library-source-policy"]').attributes('aria-pressed')).toBe('true')
		expect(wrapper!.find('[data-testid="ask-knowledge-base"]').exists()).toBe(true)
		expect(wrapper!.text()).toContain('員工差旅與費用報支辦法')
		expect(wrapper!.text()).not.toContain('新進同仁到職指南')
	})

	it('should place the scoped knowledge graph beside the documents in its knowledge base', async () => {
		await mountView(LibraryView, '/library?source=benefits&view=graph')

		expect(wrapper!.findAll('.graph-node')).toHaveLength(11)
		expect(wrapper!.text()).toContain('請假管理辦法')
		expect(wrapper!.text()).toContain('績效考核辦法')
		expect(wrapper!.text()).not.toContain('差旅管理辦法')
		expect(wrapper!.find('[aria-label="全螢幕檢視知識圖譜"]').exists()).toBe(false)
	})

	it('should keep the knowledge base interface and close the detail panel on the full-screen route', async () => {
		await mountView(LibraryView, '/graph?source=policy')

		expect(wrapper!.get('h1').text()).toBe('知識庫')
		expect(wrapper!.get('[data-testid="library-source-policy"]').attributes('aria-pressed')).toBe('true')
		expect(wrapper!.findAll('.graph-node')).toHaveLength(8)
		expect(wrapper!.find('.graph-detail').exists()).toBe(false)
	})

	it('should update the scoped graph when Vue reuses the knowledge base page across routes', async () => {
		const router = await mountView(LibraryView, '/graph?source=policy')

		await router.push('/library?source=benefits&view=graph')
		await flushPromises()

		expect(wrapper!.get('[data-testid="library-source-benefits"]').attributes('aria-pressed')).toBe('true')
		expect(wrapper!.findAll('.graph-node')).toHaveLength(11)
		expect(wrapper!.text()).toContain('請假管理辦法')
		expect(wrapper!.text()).not.toContain('差旅管理辦法')
	})

	it('should fall back to all knowledge bases when a removed source is requested', async () => {
		await mountView(LibraryView, '/library?source=faq')

		expect(wrapper!.get('[data-testid="library-source-all"]').attributes('aria-pressed')).toBe('true')
		expect(wrapper!.find('[data-testid="ask-knowledge-base"]').exists()).toBe(false)
		expect(wrapper!.text()).toContain('員工差旅與費用報支辦法')
		expect(wrapper!.text()).toContain('年度績效評核常見問題')
	})

	it('should provide visible ask and open shortcuts on every notebook card', async () => {
		const router = await mountView(NotebooksView, '/notebooks')
		const conversationStore = useConversationStore()

		expect(wrapper!.findAll('[data-testid^="ask-notebook-"]')).toHaveLength(2)
		expect(wrapper!.findAll('[data-testid^="open-notebook-"]')).toHaveLength(2)
		expect(wrapper!.get('[data-testid="open-notebook-notebook-product"]').attributes('href')).toBe('/notebooks/notebook-product')
		await wrapper!.get('[data-testid="ask-notebook-notebook-product"]').trigger('click')
		await flushPromises()

		await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/ask'))
		expect(conversationStore.selectedKnowledgeSourceId).toBe('notebook-product')
		expect(conversationStore.selectedScope).toBe('產品研究筆記')
		expect(conversationStore.selectedDocuments).toEqual([])
		expect(conversationStore.messages).toEqual([])
	})
})

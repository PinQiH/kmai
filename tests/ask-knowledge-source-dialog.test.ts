import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useConversationStore } from '@/stores/conversation'
import AskView from '@/views/AskView.vue'

const EmptyView = { template: '<div />' }
let wrapper: VueWrapper | null = null

async function mountAskView(): Promise<{ store: ReturnType<typeof useConversationStore> }> {
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

	return { store: useConversationStore() }
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
		expect(dialog.textContent).toContain('後台知識庫')
		expect(dialog.textContent).toContain('我的筆記本')
		expect(dialog.textContent).toContain('其他')
		expect(dialog.textContent).toContain('公司制度')
		expect(dialog.textContent).toContain('人事與福利')
		expect(dialog.textContent).toContain('模型一般知識')
		expect(dialog.textContent).not.toContain('預設搜尋網路')
		expect(dialog.textContent).not.toContain('完成')
	})

	it('should apply a source, close after current or changed selection, and restore focus', async () => {
		const { store } = await mountAskView()
		const trigger = wrapper!.get<HTMLButtonElement>('#knowledge-source-trigger')
		trigger.element.focus()

		await trigger.trigger('click')
		await flushPromises()
		getDialog().querySelector<HTMLInputElement>('[data-testid="knowledge-source-policy"] input')?.click()
		await vi.waitFor(() => expect(getDialog().style.display).toBe('none'))
		expect(document.activeElement).toBe(trigger.element)

		await trigger.trigger('click')
		await flushPromises()
		getDialog().querySelector<HTMLInputElement>('[data-testid="knowledge-source-benefits"] input')?.click()
		await vi.waitFor(() => expect(getDialog().style.display).toBe('none'))

		expect(store.selectedKnowledgeSourceId).toBe('benefits')
		expect(store.selectedScope).toBe('人事與福利')
		expect(document.activeElement).toBe(trigger.element)
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

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AdminAssistantLauncher from '../src/components/AdminAssistantLauncher.vue'
import AdminAssistantPanel from '../src/components/AdminAssistantPanel.vue'
import { ASSISTANT_MOCK_RESPONSE_MS, useAdminAssistantStore } from '../src/stores/adminAssistant'
import { useNotebooksStore } from '../src/stores/notebooks'
import { buildKnowledgeSourceOptions } from '../src/utils/knowledgeSources'

globalThis.ResizeObserver = class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
} as typeof ResizeObserver

function createTestVuetify() {
	return createVuetify({ components, directives })
}

describe('admin assistant launcher', () => {
	it('should toggle on click but not after a drag gesture', async () => {
		const wrapper = mount(AdminAssistantLauncher, {
			props: { position: { x: 1128, y: 728 }, edge: 'right' },
			global: { stubs: { VIcon: true } },
		})
		const launcher = wrapper.get('button')
		Object.assign(launcher.element, {
			setPointerCapture: vi.fn(),
			releasePointerCapture: vi.fn(),
		})

		await launcher.trigger('click')
		expect(wrapper.emitted('toggle')).toHaveLength(1)

		await launcher.trigger('pointerdown', { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 1150, clientY: 750 })
		await launcher.trigger('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 800, clientY: 500 })
		await wrapper.setProps({ position: { x: 778, y: 478 }, edge: 'right' })
		await launcher.trigger('pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 800, clientY: 500 })
		await launcher.trigger('click')

		expect(wrapper.emitted('position-change')?.length).toBeGreaterThan(1)
		expect(wrapper.emitted('toggle')).toHaveLength(1)
	})
})

describe('admin assistant panel', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		let id = 0
		vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `component-id-${++id}`) })
	})

	it('should ignore Enter during IME composition and prevent duplicate sends while responding', async () => {
		vi.useFakeTimers()
		const pinia = createPinia()
		setActivePinia(pinia)
		const wrapper = mount(AdminAssistantPanel, {
			props: {
				pageTitle: '通知管理',
				routePath: '/admin/notifications',
				sources: buildKnowledgeSourceOptions([]),
				remainingLabel: '',
			},
			global: { plugins: [pinia, createTestVuetify()] },
		})
		const store = useAdminAssistantStore()
		const field = wrapper.get('textarea')
		await field.setValue('通知怎麼設定？')

		await field.trigger('keydown', { key: 'Enter', isComposing: true })
		expect(store.messages).toHaveLength(0)

		await field.trigger('keydown', { key: 'Enter', isComposing: false })
		expect(store.messages).toHaveLength(1)
		expect(store.isResponding).toBe(true)
		expect(wrapper.get('button[aria-label="送出問題"]').attributes('disabled')).toBeDefined()

		await vi.advanceTimersByTimeAsync(ASSISTANT_MOCK_RESPONSE_MS)
		expect(store.messages).toHaveLength(2)
		vi.useRealTimers()
	})

	it('should block sending when the selected notebook has no documents', async () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const notebooksStore = useNotebooksStore()
		const emptyNotebook = buildKnowledgeSourceOptions(notebooksStore.notebooks).find((source) => source.id === 'notebook-onboarding')!
		const store = useAdminAssistantStore()
		store.selectKnowledgeSource(emptyNotebook)
		const wrapper = mount(AdminAssistantPanel, {
			props: {
				pageTitle: '文件管理',
				routePath: '/admin/documents',
				sources: [emptyNotebook],
				remainingLabel: '',
			},
			global: { plugins: [pinia, createTestVuetify()] },
		})

		expect(wrapper.text()).toContain('這本筆記本目前沒有文件')
		expect(wrapper.get('textarea').attributes('disabled')).toBeDefined()
	})

	it('should show front-style source and web search controls', async () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const sources = buildKnowledgeSourceOptions([])
		const wrapper = mount(AdminAssistantPanel, {
			props: {
				pageTitle: '管理總覽',
				routePath: '/admin',
				sources,
				remainingLabel: '',
			},
			global: { plugins: [pinia, createTestVuetify()] },
		})
		const store = useAdminAssistantStore()
		const sourceControl = wrapper.get('[data-testid="assistant-source-control"]')
		const webSearchControl = wrapper.get('[data-testid="assistant-web-search-control"]')

		expect(sourceControl.text()).toContain('模型一般知識')
		expect(webSearchControl.text()).toContain('網路搜尋：不可用')
		expect(webSearchControl.attributes('disabled')).toBeDefined()

		store.selectKnowledgeSource(sources.find((source) => source.id === 'benefits')!)
		await wrapper.vm.$nextTick()
		expect(sourceControl.text()).toContain('人事流程')
		expect(webSearchControl.text()).toContain('網路搜尋：開')
		expect(webSearchControl.text()).toContain('預設')

		await webSearchControl.trigger('click')
		expect(store.isWebSearchEnabled).toBe(false)
		expect(webSearchControl.text()).toContain('網路搜尋：關')
		expect(webSearchControl.text()).toContain('已調整')
	})

	it('should open the knowledge source dialog from the source control', async () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const wrapper = mount(AdminAssistantPanel, {
			props: {
				pageTitle: '管理總覽',
				routePath: '/admin',
				sources: buildKnowledgeSourceOptions([]),
				remainingLabel: '',
			},
			global: {
				plugins: [pinia, createTestVuetify()],
				stubs: {
					VDialog: {
						props: ['modelValue'],
						template: '<div v-if="modelValue"><slot /></div>',
					},
				},
			},
		})
		const sourceControl = wrapper.get('[data-testid="assistant-source-control"]')

		expect(sourceControl.attributes('aria-expanded')).toBe('false')
		await sourceControl.trigger('click')
		expect(sourceControl.attributes('aria-expanded')).toBe('true')
		expect(wrapper.text()).toContain('切換來源會套用該來源的網路搜尋預設值')
	})
})

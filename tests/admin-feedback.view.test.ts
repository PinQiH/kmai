import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import { VApp } from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.ResizeObserver = class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
} as typeof ResizeObserver

Object.defineProperty(globalThis, 'visualViewport', {
	configurable: true,
	value: { addEventListener: vi.fn(), removeEventListener: vi.fn(), width: 1024, height: 768, scale: 1 },
})

type FeedbackMock = typeof import('@/mocks/feedbackAdmin')

// NOTE: 案件是模組層級的 reactive 狀態，每個測試重新載入模組避免互相污染
async function mountView(query = ''): Promise<{ wrapper: VueWrapper; feedback: FeedbackMock }> {
	vi.resetModules()
	const feedback = await import('@/mocks/feedbackAdmin')
	const { default: AdminFeedbackView } = await import('@/views/admin/AdminFeedbackView.vue')
	const pinia = createPinia()
	setActivePinia(pinia)
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [
			{ path: '/admin/feedback', component: AdminFeedbackView },
			{ path: '/admin/:rest(.*)', component: { template: '<div />' } },
		],
	})
	await router.push(`/admin/feedback${query}`)
	await router.isReady()
	// @ VNavigationDrawer 需要 VApp 提供的版面配置
	const Host = defineComponent({ render: () => h(VApp, () => h(AdminFeedbackView)) })
	const wrapper = mount(Host, {
		attachTo: document.body,
		global: { plugins: [pinia, createVuetify({ components, directives }), router] },
	})
	await flushPromises()
	return { wrapper, feedback }
}

function findButton(wrapper: VueWrapper, text: string) {
	const button = wrapper.findAll('button').find((item) => item.text().trim() === text)
	if (!button) throw new Error(`找不到按鈕「${text}」`)
	return button
}

describe('AdminFeedbackView', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
		Element.prototype.scrollIntoView = vi.fn()
	})

	it('should summarise open cases on the overview tab', async () => {
		const { wrapper, feedback } = await mountView()
		const openCount = feedback.feedbackAdminState.cases.filter(feedback.isOpen).length

		expect(wrapper.get('[aria-label="回饋處理概況"]').text()).toContain(`待處理${openCount}`)
		expect(wrapper.text()).toContain('AI 回答滿意度')
	})

	it('should filter the queue by keyword and clear the filter', async () => {
		const { wrapper, feedback } = await mountView('?tab=queue')
		const openCount = feedback.feedbackAdminState.cases.filter(feedback.isOpen).length
		const target = feedback.getCase('fb-1049')!

		await wrapper.get('[data-testid="feedback-search"] input').setValue(target.title)

		expect(wrapper.text()).toContain(`符合 1 / ${openCount} 筆`)
		expect(wrapper.find('[data-testid="case-fb-1049"]').exists()).toBe(true)

		await findButton(wrapper, '清除條件').trigger('click')

		expect(wrapper.text()).toContain(`共 ${openCount} 筆待處理`)
	})

	it('should show an empty state when no case matches', async () => {
		const { wrapper } = await mountView('?tab=queue')

		await wrapper.get('[data-testid="feedback-search"] input').setValue('完全不會出現的關鍵字')

		expect(wrapper.text()).toContain('沒有符合條件的案件')
	})

	it('should open the case drawer from the url and start handling it', async () => {
		const { wrapper, feedback } = await mountView('?tab=queue&case=fb-1049')
		const drawer = wrapper.get('[data-testid="feedback-drawer"]')
		expect(drawer.text()).toContain(feedback.getCase('fb-1049')!.title)

		await wrapper.get('[data-testid="feedback-start"]').trigger('click')

		expect(feedback.getCase('fb-1049')!.status).toBe('investigating')
		const { useToastStore } = await import('@/stores/toast')
		expect(useToastStore().items[0]?.title).toContain('已開始處理。')
	})

	it('should require a cause before closing a case', async () => {
		const { wrapper, feedback } = await mountView('?tab=queue&case=fb-1049')

		await wrapper.get('[data-testid="feedback-close"]').trigger('submit')

		expect(wrapper.get('[data-testid="feedback-drawer"] p.text-error').text()).toBe('請選擇問題原因，之後才能統計哪類問題最常發生。')
		expect(feedback.isOpen(feedback.getCase('fb-1049')!)).toBe(true)
	})

	it('should open a case from the queue list and close the drawer', async () => {
		const { wrapper } = await mountView('?tab=queue')

		await wrapper.get('[data-testid="case-fb-1049"]').trigger('click')
		expect(wrapper.find('[data-testid="feedback-drawer"]').exists()).toBe(true)

		await wrapper.get('[data-testid="feedback-drawer"] button[aria-label="關閉"]').trigger('click')
		expect(wrapper.find('[data-testid="feedback-drawer"]').exists()).toBe(false)
	})

	it('should list closed cases and search them', async () => {
		const { wrapper, feedback } = await mountView('?tab=closed')
		const closedCount = feedback.feedbackAdminState.cases.filter((item) => !feedback.isOpen(item)).length

		expect(wrapper.text()).toContain(`共 ${closedCount} 筆`)

		await wrapper.get('input[aria-label="搜尋已結案案件"], [aria-label="搜尋已結案案件"] input').setValue('完全不會出現的關鍵字')

		expect(wrapper.text()).toContain('沒有符合條件的案件')
	})

	it('should hand a case over to the admin assistant for retesting', async () => {
		const { wrapper } = await mountView('?tab=queue&case=fb-1049')
		const { useAdminAssistantStore } = await import('@/stores/adminAssistant')
		const assistant = useAdminAssistantStore()
		const startRetest = vi.spyOn(assistant, 'startRetest')

		await wrapper.get('[data-testid="feedback-retest"]').trigger('click')

		expect(startRetest).toHaveBeenCalledOnce()
		expect(startRetest.mock.calls[0]![0]).toMatchObject({ caseId: 'fb-1049' })
		expect(wrapper.find('[data-testid="feedback-drawer"]').exists()).toBe(false)
	})
})

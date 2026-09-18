import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { nextTick } from 'vue'
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

// NOTE: 假資料是模組層級的 reactive 狀態，每個測試重新載入模組避免互相污染
async function mountView(query = ''): Promise<{ wrapper: VueWrapper; resources: typeof import('@/mocks/systemResources') }> {
	vi.resetModules()
	const resources = await import('@/mocks/systemResources')
	const { default: AdminSystemResourcesView } = await import('@/views/admin/AdminSystemResourcesView.vue')
	const pinia = createPinia()
	setActivePinia(pinia)
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [
			{ path: '/admin/system-resources', component: AdminSystemResourcesView },
			{ path: '/admin/:rest(.*)', component: { template: '<div />' } },
		],
	})
	await router.push(`/admin/system-resources${query}`)
	await router.isReady()
	const wrapper = mount(AdminSystemResourcesView, {
		attachTo: document.body,
		global: { plugins: [pinia, createVuetify({ components, directives }), router] },
	})
	await flushPromises()
	return { wrapper, resources }
}

function findButton(wrapper: VueWrapper, text: string) {
	const button = wrapper.findAll('button').find((item) => item.text().trim() === text)
	if (!button) throw new Error(`找不到按鈕「${text}」`)
	return button
}

function dialogText(): string {
	return document.querySelector('.v-overlay--active .v-card')?.textContent ?? ''
}

function dialogButton(text: string): HTMLButtonElement {
	const button = [...document.querySelectorAll<HTMLButtonElement>('.v-overlay--active .v-card button')].find((item) => item.textContent?.trim() === text)
	if (!button) throw new Error(`對話框內找不到按鈕「${text}」`)
	return button
}

describe('AdminSystemResourcesView', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
		Element.prototype.scrollIntoView = vi.fn()
		window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
	})

	it('should narrow the profile list by keyword and restore it after clearing filters', async () => {
		const { wrapper, resources } = await mountView()

		await wrapper.get('[data-testid="profile-search"] input').setValue('Claude')

		expect(wrapper.text()).toContain(`符合 2 / ${resources.aiProfiles.length} 個設定檔`)
		expect(wrapper.find('[data-testid="profile-row-llm-claude"]').exists()).toBe(true)
		expect(wrapper.find('[data-testid="profile-row-emb-default"]').exists()).toBe(false)

		await findButton(wrapper, '清除條件').trigger('click')

		expect(wrapper.text()).toContain(`共 ${resources.aiProfiles.length} 個設定檔`)
	})

	it('should show an empty state when no profile matches the filters', async () => {
		const { wrapper } = await mountView()

		await wrapper.get('[data-testid="profile-search"] input').setValue('不存在的模型名稱')

		expect(wrapper.text()).toContain('找不到符合條件的設定檔。')
	})

	it('should select the profile given in the url query', async () => {
		const { wrapper } = await mountView('?profile=llm-haiku')

		expect(wrapper.get('[data-testid="profile-row-llm-haiku"]').attributes('aria-current')).toBe('true')
		expect(wrapper.get('.profile-editor h2').text()).toBe('Claude Haiku')
	})

	it('should block saving when the profile name is empty', async () => {
		const { wrapper, resources } = await mountView('?profile=llm-haiku')

		await wrapper.get('.profile-editor input[maxlength="30"]').setValue('   ')
		await wrapper.get('[data-testid="profile-save"]').trigger('click')

		expect(wrapper.get('p.text-error').text()).toBe('請輸入設定檔名稱，方便在其他頁面辨認。')
		expect(resources.getProfile('llm-haiku')?.name).toBe('Claude Haiku')
	})

	it('should save an edited profile and warn which usages are affected', async () => {
		const { wrapper, resources } = await mountView('?profile=llm-standard')

		await wrapper.get('.profile-editor input[maxlength="30"]').setValue('GPT-4.1 mini（主要）')
		expect(wrapper.text()).toContain('儲存後會影響：生成回答、問題規劃')

		await wrapper.get('[data-testid="profile-save"]').trigger('click')

		expect(resources.getProfile('llm-standard')?.name).toBe('GPT-4.1 mini（主要）')
		expect(wrapper.text()).toContain('已儲存「GPT-4.1 mini（主要）」，生成回答、問題規劃會一起套用')
	})

	it('should create a new profile from the add menu', async () => {
		const { wrapper, resources } = await mountView()
		const before = resources.aiProfiles.length

		await findButton(wrapper, '新增設定檔').trigger('click')
		await flushPromises()
		const reranker = wrapper.findAllComponents({ name: 'VListItem' }).find((item) => item.text() === resources.resourceKindLabels.reranker)
		await reranker!.trigger('click')
		await nextTick()

		await wrapper.get('.profile-editor input[maxlength="30"]').setValue('測試重新排序')
		// @ 模型參數區第一個欄位是模型名稱
		const modelInput = wrapper.findAll('.profile-editor fieldset')[1]?.find('input')
		await modelInput!.setValue('rerank-test')
		await wrapper.get('[data-testid="profile-save"]').trigger('click')

		expect(resources.aiProfiles).toHaveLength(before + 1)
		expect(wrapper.text()).toContain('已建立「測試重新排序」')
	})

	it('should refuse to delete a profile that is still in use', async () => {
		const { wrapper, resources } = await mountView('?profile=llm-standard')

		await findButton(wrapper, '刪除').trigger('click')
		await flushPromises()

		expect(dialogText()).toContain('這個設定檔仍在使用中，無法刪除')
		expect(dialogText()).toContain('用途「生成回答」')
		expect(resources.getProfile('llm-standard')).toBeDefined()
	})

	it('should delete an unused profile after confirmation', async () => {
		const { wrapper, resources } = await mountView('?profile=llm-deepseek')
		expect(resources.getProfileUsages('llm-deepseek')).toHaveLength(0)

		await findButton(wrapper, '刪除').trigger('click')
		await flushPromises()
		expect(dialogText()).toContain('刪除後無法復原')

		dialogButton('確認刪除').click()
		await flushPromises()

		expect(resources.getProfile('llm-deepseek')).toBeUndefined()
		expect(wrapper.text()).toContain('已刪除「DeepSeek V3」。')
	})

	it('should report the result of a connection test', async () => {
		const { wrapper } = await mountView()

		await findButton(wrapper, '服務連線').trigger('click')
		await flushPromises()
		await findButton(wrapper, '測試連線').trigger('click')

		expect(wrapper.text()).toMatch(/「OpenAI」連線(正常|失敗)/)
	})
})

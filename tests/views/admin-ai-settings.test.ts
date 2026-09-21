import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it } from 'vitest'

import {
	aiSettingsState,
	cloneAiSettings,
	diffAiSettings,
	resetAiSettingsState,
	restoreAiSettingsRevision,
	saveAiSettings,
	validateAiSettings,
} from '@/mocks/aiSettings'
import { usageAssignments } from '@/mocks/systemResources'
import AdminAiSettingsView from '@/views/admin/AdminAiSettingsView.vue'

globalThis.ResizeObserver = class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
} as typeof ResizeObserver

// @ jsdom 沒有 visualViewport，Vuetify 的 Dialog 定位會直接取用
Object.defineProperty(globalThis, 'visualViewport', {
	configurable: true,
	value: { addEventListener: () => undefined, removeEventListener: () => undefined, height: 768, width: 1024, offsetLeft: 0, offsetTop: 0 } satisfies Partial<VisualViewport>,
})

const ACTOR = '林怡君'

beforeEach(() => resetAiSettingsState())

describe('ai settings state', () => {
	it('01. 語意與關鍵字搜尋同時關閉時不可儲存', () => {
		const draft = cloneAiSettings(aiSettingsState.current)
		draft.channels.vectorEnabled = false
		draft.channels.keywordEnabled = false
		expect(validateAiSettings(draft).channels).toContain('不能同時關閉')
		expect(saveAiSettings(draft, ACTOR)).toMatchObject({ ok: false })
	})

	it('02. 候選上限少於引用筆數、啟用工具調度卻沒有工具時回報錯誤', () => {
		const draft = cloneAiSettings(aiSettingsState.current)
		draft.merge.candidateLimit = 3
		draft.agent.tools = []
		const errors = validateAiSettings(draft)
		expect(errors.merge).toContain('不能少於')
		expect(errors.agent).toContain('至少要開放一個工具')
	})

	it('03. 儲存後記錄差異、正規化專有名詞，並同步系統資源的模型指派', () => {
		const draft = cloneAiSettings(aiSettingsState.current)
		draft.citation.minScore = 0.65
		draft.models.answer = 'llm-claude'
		draft.prompts.glossary.push(' syscom cubi ', '新產品')
		const result = saveAiSettings(draft, ACTOR, '回饋門檻過高')
		if (!result.ok) throw new Error(result.message)
		expect(result.revision.changes.map((change) => change.label)).toEqual(expect.arrayContaining(['引用最低分數', '回答模型', '專有名詞']))
		expect(aiSettingsState.current.prompts.glossary.filter((term) => term.toLowerCase() === 'syscom cubi')).toHaveLength(1)
		expect(usageAssignments.answer).toBe('llm-claude')
		usageAssignments.answer = 'llm-standard'
	})

	it('04. 沒有變更時不產生紀錄；還原會新增紀錄而非刪除', () => {
		const seeded = aiSettingsState.revisions.length
		expect(seeded).toBeGreaterThan(0)
		expect(aiSettingsState.revisions.every((revision) => revision.changes.length > 0)).toBe(true)
		expect(saveAiSettings(cloneAiSettings(aiSettingsState.current), ACTOR)).toMatchObject({ ok: false })
		const draft = cloneAiSettings(aiSettingsState.current)
		draft.citation.limit = 4
		const saved = saveAiSettings(draft, ACTOR)
		if (!saved.ok) throw new Error(saved.message)
		const restored = restoreAiSettingsRevision(saved.revision.id, ACTOR)
		expect(restored.ok).toBe(true)
		expect(aiSettingsState.current.citation.limit).toBe(6)
		expect(aiSettingsState.revisions).toHaveLength(seeded + 2)
	})

	it('05. 系統提示詞只改幾個字也列入差異', () => {
		const draft = cloneAiSettings(aiSettingsState.current)
		draft.prompts.systemBase = `${draft.prompts.systemBase}。`
		expect(diffAiSettings(aiSettingsState.current, draft).some((change) => change.section === 'prompt')).toBe(true)
	})

})

describe('AdminAiSettingsView', () => {
	async function mountView(path = '/admin/ai-settings') {
		const router = createRouter({
			history: createMemoryHistory(),
			routes: [
				{ path: '/admin/ai-settings', component: AdminAiSettingsView },
				{ path: '/admin/system-resources', component: { template: '<div />' } },
				{ path: '/admin/feedback', component: { template: '<div />' } },
			],
		})
		await router.push(path)
		await router.isReady()
		const wrapper = mount({ template: '<VApp><RouterView /></VApp>' }, { global: { plugins: [createPinia(), router, createVuetify({ components, directives })] }, attachTo: document.body })
		await flushPromises()
		return { wrapper, router }
	}

	it('07. 顯示回答流程，修改後出現儲存列並可確認儲存', async () => {
		const seeded = aiSettingsState.revisions.length
		const { wrapper } = await mountView()
		expect(wrapper.find('[data-testid="ai-flow-map"]').text()).toContain('決定引用')
		expect(wrapper.find('[data-testid="ai-save-bar"]').exists()).toBe(false)

		const switches = wrapper.findAll('input[type="checkbox"]')
		const graphSwitch = switches.find((input) => input.element.closest('.v-input')?.textContent?.includes('知識圖譜擴充'))
		await graphSwitch!.setValue(false)
		expect(wrapper.find('[data-testid="ai-save-bar"]').text()).toContain('1 項未儲存變更')

		await wrapper.find('[data-testid="ai-save"]').trigger('click')
		await flushPromises()
		;(document.querySelector('[data-testid="ai-save-confirm"]') as HTMLElement).click()
		await flushPromises()
		expect(aiSettingsState.current.channels.graphEnabled).toBe(false)
		expect(aiSettingsState.revisions).toHaveLength(seeded + 1)
		wrapper.unmount()
	})

	it('08. 未儲存時離開頁面會被攔下', async () => {
		const { wrapper, router } = await mountView()
		const switches = wrapper.findAll('input[type="checkbox"]')
		await switches.find((input) => input.element.closest('.v-input')?.textContent?.includes('跨文件路線'))!.setValue(false)
		await router.push('/admin/feedback')
		await flushPromises()
		expect(router.currentRoute.value.path).toBe('/admin/ai-settings')
		expect(document.body.textContent).toContain('離開前要放棄變更嗎？')
		wrapper.unmount()
	})

	it('09. 以 ?section=agent 開啟時切換到工具調度分頁', async () => {
		const { wrapper } = await mountView('/admin/ai-settings?section=agent')
		await flushPromises()
		expect(wrapper.text()).toContain('可用工具')
		wrapper.unmount()
	})
})

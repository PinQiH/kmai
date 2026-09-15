import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
	advanceRebuild,
	decideCandidate,
	getDocumentGraphSummary,
	getEntity,
	getOrphanEntities,
	getRetiredOnlyEntities,
	getUnappliedDecisions,
	revertEntityEdits,
	graphAdminState,
	resetGraphAdminState,
	startRebuild,
	updateEntity,
} from '@/mocks/graphAdmin'
import AdminGraphView from '@/views/admin/AdminGraphView.vue'

globalThis.ResizeObserver = class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
} as typeof ResizeObserver

beforeEach(() => resetGraphAdminState())

describe('graph admin state', () => {
	it('01. 合併決定在快速重建後仍未套用，完整重建後才合併', () => {
		decideCandidate('mc-02', 'merge', '測試')
		expect(getUnappliedDecisions('all')).toHaveLength(1)

		const quick = startRebuild('all', 'quick', '測試')
		if (typeof quick === 'string') throw new Error(quick)
		advanceRebuild(quick.id, 100)
		expect(getEntity('x-hr-full')?.status).toBe('active')

		const full = startRebuild('all', 'full', '測試')
		if (typeof full === 'string') throw new Error(full)
		advanceRebuild(full.id, 100)
		expect(getEntity('x-hr-full')).toMatchObject({ status: 'merged', mergedInto: 'n-hr' })
		expect(getEntity('n-hr')?.aliases).toContain('人力資源部')
		expect(full.result?.merged).toBe(1)
		expect(getUnappliedDecisions('all')).toHaveLength(0)
	})

	it('02. 同時間只允許一個重建工作', () => {
		startRebuild('all', 'quick', '測試')
		expect(startRebuild('policy', 'full', '測試')).toBeTypeOf('string')
	})

	it('03. 同主題重名時拒絕更新，並正規化別名', () => {
		expect(updateEntity('n-per-diem', { label: '住宿費上限', type: '專有名詞', aliases: [] })).toContain('已有')
		expect(updateEntity('n-per-diem', { label: '日支費', type: '專有名詞', aliases: [' 出差日支 ', '出差日支', '日支費'] })).toBe('')
		expect(getEntity('n-per-diem')).toMatchObject({ aliases: ['出差日支'], manuallyEdited: true })
	})

	it('07. 只有全部來源都下架的實體才列入，重建後移除', () => {
		getEntity('n-per-diem')!.documentIds = ['doc-001', 'doc-008']
		const ids = getRetiredOnlyEntities('all').map((entity) => entity.id)
		expect(ids).toContain('x-access-card')
		expect(ids).not.toContain('n-per-diem')

		const job = startRebuild('all', 'quick', '測試')
		if (typeof job === 'string') throw new Error(job)
		advanceRebuild(job.id, 100)
		expect(getEntity('x-access-card')).toBeUndefined()
		expect(getEntity('n-per-diem')).toBeDefined()
	})

	it('08. 還原為擷取結果會恢復名稱並清掉人工修正標記', () => {
		updateEntity('n-per-diem', { label: '出差日支費', type: '專有名詞', aliases: [] })
		expect(revertEntityEdits('n-per-diem')).toBe('')
		expect(getEntity('n-per-diem')).toMatchObject({ label: '日支費', manuallyEdited: false })
	})

	it('09. 改回與擷取結果相同時不標記人工修正', () => {
		updateEntity('n-per-diem', { label: '出差日支費', type: '專有名詞', aliases: [] })
		updateEntity('n-per-diem', { label: '日支費', type: '專有名詞', aliases: [] })
		expect(getEntity('n-per-diem')?.manuallyEdited).toBe(false)
	})

	it('10. 文件圖譜摘要只計入該文件的實體，並統計待覆核數', () => {
		const summary = getDocumentGraphSummary('doc-003')
		const ids = summary.entities.map((entity) => entity.id)
		expect(ids).toEqual(expect.arrayContaining(['n-security-policy', 'x-it-office']))
		expect(ids).not.toContain('n-per-diem')
		expect(summary.relationCount).toBeGreaterThan(0)
		expect(summary.pendingReviewCount).toBeGreaterThan(0)
	})

	it('04. 孤立實體排除待覆核的合併對象', () => {
		const ids = getOrphanEntities('all').map((entity) => entity.id)
		expect(ids).toEqual(expect.arrayContaining(['x-access-card', 'x-spec-code']))
		expect(ids).not.toContain('x-hr-full')
	})
})

describe('AdminGraphView', () => {
	afterEach(() => vi.useRealTimers())

	async function mountView(path = '/admin/graph') {
		setActivePinia(createPinia())
		const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/admin/graph', component: AdminGraphView }, { path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
		await router.push(path)
		await router.isReady()
		const wrapper = mount({ components: { AdminGraphView }, template: '<VApp><AdminGraphView /></VApp>' }, { global: { plugins: [createPinia(), createVuetify({ components, directives }), router] } })
		await flushPromises()
		return { wrapper, router }
	}

	it('05. 健康檢查列出待覆核與孤立實體', async () => {
		const { wrapper } = await mountView()
		const text = wrapper.find('[data-testid="graph-health"]').text()
		expect(text).toContain('待覆核的合併建議')
		expect(text).toContain('孤立實體')
	})

	it('06. 從網址直接開啟合併覆核，決定後出現待套用提示', async () => {
		const { wrapper } = await mountView('/admin/graph?tab=review')
		await wrapper.find('[data-testid="merge-mc-01"]').trigger('click')
		await flushPromises()
		expect(graphAdminState.candidates.find((candidate) => candidate.id === 'mc-01')?.decision).toBe('merge')
		expect(wrapper.text()).toContain('1 項合併覆核決定尚未套用')
	})

	it('11. 網址帶 documentId 時只列出該文件的實體，清除後恢復', async () => {
		const { wrapper, router } = await mountView('/admin/graph?tab=entities&documentId=doc-008')
		expect(wrapper.find('[data-testid="entity-document-filter"]').exists()).toBe(true)
		expect(wrapper.text()).toContain('門禁卡')
		expect(wrapper.text()).not.toContain('日支費')

		await wrapper.find('[data-testid="entity-document-filter"] .v-chip__close').trigger('click')
		await flushPromises()
		expect(wrapper.find('[data-testid="entity-document-filter"]').exists()).toBe(false)
		// NOTE: router.replace 需要多輪微任務，flushPromises 不一定等得到
		await vi.waitFor(() => expect(router.currentRoute.value.query.documentId).toBeUndefined())
	})
})

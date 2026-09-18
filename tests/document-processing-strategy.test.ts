import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'

import { enqueueDocumentProcessing, getDocumentProcessingRecord, reprocessJob } from '@/mocks/documentProcessing'
import {
	DEFAULT_STRATEGY_OPTIONS,
	documentOverrideEnabled,
	fileTypeOverrideEnabled,
	getEarliestPendingStage,
	getFileTypeId,
	markStrategyChanged,
	resolveStrategy,
	saveStrategy,
} from '@/mocks/documentStrategies'
import DocumentChunkEditor from '@/components/DocumentChunkEditor.vue'
import DocumentLifecycleTrail from '@/components/DocumentLifecycleTrail.vue'
import { getWorkspaceVersions, workspaceDocuments } from '@/mocks/documentWorkspace'
import { isDocumentProcessing, planBatchReprocess, reprocessAllVersions, runBatchReprocess } from '@/mocks/documentReprocess'
import AdminProcessingView from '@/views/admin/AdminProcessingView.vue'

globalThis.ResizeObserver = class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
} as typeof ResizeObserver

async function mountProcessingView(path: string) {
	const pinia = createPinia()
	setActivePinia(pinia)
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [
			{ path: '/admin/processing', component: AdminProcessingView },
			{ path: '/admin/documents/:id/manage', component: { template: '<div />' } },
		],
	})
	await router.push(path)
	await router.isReady()
	const wrapper = mount(
		{ components: { AdminProcessingView }, template: '<VApp><AdminProcessingView /></VApp>' },
		{ global: { plugins: [pinia, createVuetify({ components, directives }), router] } },
	)
	await flushPromises()
	return wrapper
}

describe('處理策略的檔案類型層', () => {
	it('should map extensions and source types to file type groups', () => {
		expect(getFileTypeId({ type: 'file', fileName: 'a.DOCX', mimeType: '', extension: 'DOCX' })).toBe('word')
		expect(getFileTypeId({ type: 'url', url: 'https://a.test', domain: 'a.test', capturedAt: '', snapshot: '' })).toBe('web')
		expect(getFileTypeId({ type: 'file', fileName: 'a.zip', mimeType: '', extension: 'zip' })).toBeUndefined()
	})

	it('should resolve document over file type over global', () => {
		// doc-001 是 PDF
		fileTypeOverrideEnabled.pdf = true
		saveStrategy([{ stageId: 'parse', strategyId: 'ocr', options: { ...DEFAULT_STRATEGY_OPTIONS } }], undefined, 'pdf')

		const fromFileType = resolveStrategy('doc-001').find((stage) => stage.stageId === 'parse')
		expect(fromFileType).toMatchObject({ strategyId: 'ocr', source: 'fileType' })
		expect(resolveStrategy('doc-001').find((stage) => stage.stageId === 'chunk')?.source).toBe('global')

		documentOverrideEnabled['doc-001'] = true
		saveStrategy([{ stageId: 'parse', strategyId: 'builtin', options: { ...DEFAULT_STRATEGY_OPTIONS } }], 'doc-001')
		expect(resolveStrategy('doc-001').find((stage) => stage.stageId === 'parse')).toMatchObject({ strategyId: 'builtin', source: 'document' })
	})

	it('should ignore file type overrides while that file type switch is off', () => {
		fileTypeOverrideEnabled.sheet = false
		saveStrategy([{ stageId: 'chunk', strategyId: 'sliding_window', options: { ...DEFAULT_STRATEGY_OPTIONS } }], undefined, 'sheet')

		expect(resolveStrategy(undefined, 'sheet').find((stage) => stage.stageId === 'chunk')?.source).toBe('global')
	})
})

describe('策略變更後重新處理', () => {
	it('should start from the earliest changed stage in pipeline order', () => {
		markStrategyChanged('doc-002', ['summarize', 'chunk'])

		expect(getEarliestPendingStage('doc-002')).toBe('chunk')
	})

	it('should keep finished steps before the start stage and rerun the rest', () => {
		const record = getDocumentProcessingRecord('doc-002')!
		reprocessJob(record.jobId, 'chunk')

		const steps = getDocumentProcessingRecord('doc-002')!.steps
		expect(steps[0]).toMatchObject({ id: 'parse', state: '已完成' })
		expect(steps.slice(1).every((step) => step.state === '等待中')).toBe(true)
		expect(getDocumentProcessingRecord('doc-002')!.progress).toBe(Math.round((1 / steps.length) * 100))
	})
})

describe('逐檔案處理步驟', () => {
	it('should give each attachment its own steps stopping at its failed stage', () => {
		const record = getDocumentProcessingRecord('doc-003')!
		const failed = record.files!.find((file) => file.state === '失敗')!

		expect(failed.steps![0]).toMatchObject({ id: 'parse', state: '失敗' })
		expect(failed.steps!.slice(1).every((step) => step.state === '未執行')).toBe(true)
		expect(record.files!.find((file) => file.role === '主文件')!.steps!.every((step) => step.state === '已完成')).toBe(true)
	})

	it('should switch the step panel to the selected attachment', async () => {
		const wrapper = mount(DocumentLifecycleTrail, {
			props: { status: '待審核', record: getDocumentProcessingRecord('doc-003'), showStages: false },
			global: { plugins: [createVuetify({ components, directives })] },
		})

		// 預設打開失敗的附件
		expect(wrapper.text()).toContain('正在查看：舊版分級說明（掃描）.pdf')
		expect(wrapper.text()).toContain('OCR 無法辨識')

		await wrapper.get('[data-testid="processing-file-doc-003-main"]').trigger('click')
		expect(wrapper.text()).toContain('正在查看：intranet.example.com/security/customer-data')
		expect(wrapper.text()).not.toContain('OCR 無法辨識')
	})
})

describe('重新處理範圍', () => {
	it('should rerun only the chosen attachment and leave the main file untouched', () => {
		const before = getDocumentProcessingRecord('doc-001')!
		const attachment = before.files!.find((file) => file.role === '附件')!
		reprocessJob(before.jobId, 'embed', undefined, attachment.id)

		const after = getDocumentProcessingRecord('doc-001')!
		const rerun = after.files!.find((file) => file.id === attachment.id)!
		expect(rerun.state).toBe('等待中')
		expect(rerun.steps!.slice(0, 2).every((step) => step.state === '已完成')).toBe(true)
		expect(rerun.steps!.slice(2).every((step) => step.state === '等待中')).toBe(true)
		expect(after.steps.every((step) => step.state === '已完成')).toBe(true)
	})
})

describe('附件切塊', () => {
	it('should show chunk status per file and explain why a failed attachment has no chunks', async () => {
		const document = workspaceDocuments.find((item) => item.id === 'doc-003')!
		const wrapper = mount(DocumentChunkEditor, {
			props: { document, version: getWorkspaceVersions(document)[0]! },
			global: { plugins: [createPinia(), createVuetify({ components, directives })] },
		})

		expect(wrapper.get('[data-testid="chunk-file-doc-003-att-1"]').text()).toContain('3 個切塊')
		expect(wrapper.get('[data-testid="chunk-file-doc-003-att-2"]').text()).toContain('無法切塊')

		await wrapper.get('[data-testid="chunk-file-doc-003-att-2"]').trigger('click')
		expect(wrapper.get('[data-testid="chunk-unavailable"]').text()).toContain('「文字抽取」失敗')

		await wrapper.get('[data-testid="chunk-file-doc-003-att-1"]').trigger('click')
		expect(wrapper.text()).toContain('附件原文：資料分級對照表.xlsx')
		expect(wrapper.text()).toContain('切塊（3）')
	})
})

describe('AdminProcessingView 列表', () => {
	it('should flag a document whose attachment failed as partially failed', async () => {
		const wrapper = await mountProcessingView('/admin/processing')
		const rows = wrapper.findAll('[data-testid="processing-job"]').map((row) => row.text())

		expect(rows.some((text) => text.includes('客戶資料存取與分享規範') && text.includes('部分失敗') && text.includes('1 失敗'))).toBe(true)
	})

	it('should filter jobs by document or attachment name', async () => {
		const wrapper = await mountProcessingView('/admin/processing?tab=all')
		await wrapper.get('[data-testid="processing-search"] input').setValue('住宿費用')
		await flushPromises()
		const rows = wrapper.findAll('[data-testid="processing-job"]')

		expect(rows).toHaveLength(1)
		expect(rows[0]!.text()).toContain('員工差旅與費用報支辦法')
	})

	it('should paginate the all-jobs list', async () => {
		for (let index = 0; index < 12; index += 1) enqueueDocumentProcessing(`doc-page-${index}`, '1.0', '測試')
		const wrapper = await mountProcessingView('/admin/processing?tab=all')

		expect(wrapper.findAll('[data-testid="processing-job"]')).toHaveLength(10)
		expect(wrapper.text()).toMatch(/共 \d+ 筆，顯示第 1–10 筆/)
	})
})

describe('批次重新處理', () => {
	it('should skip running and archived documents', () => {
		const plan = planBatchReprocess(['doc-004', 'doc-006', 'doc-008'], 'auto', 'active')

		expect(plan.find((item) => item.documentId === 'doc-004')?.status).toBe('running')
		expect(plan.find((item) => item.documentId === 'doc-006')).toMatchObject({ status: 'ready', fromStage: 'parse' })
		expect(plan.find((item) => item.documentId === 'doc-008')?.status).toBe('archived')
		expect(runBatchReprocess(plan)).toBe(1)
	})

	it('should start from the earliest changed stage and keep the flag when starting later', () => {
		markStrategyChanged('doc-003', ['chunk'])

		expect(planBatchReprocess(['doc-003'], 'auto', 'active')[0]).toMatchObject({ status: 'ready', fromStage: 'chunk', hasPendingStrategy: true })

		expect(runBatchReprocess(planBatchReprocess(['doc-003'], 'diagnose', 'active'))).toBe(1)
		expect(getEarliestPendingStage('doc-003')).toBe('chunk')
	})
})

describe('批次重新處理的版本範圍', () => {
	it('should include pending new versions by default and history only when asked', () => {
		const document = workspaceDocuments.find((item) => item.id === 'doc-002')!
		const history = getWorkspaceVersions(document).filter((entry) => entry.version !== document.version)
		expect(history.length).toBeGreaterThan(0)

		const active = planBatchReprocess(['doc-002'], 'auto', 'active')
		expect(active.map((item) => item.versionRole)).toEqual(['有效版本'])

		const all = planBatchReprocess(['doc-002'], 'auto', 'all')
		expect(all).toHaveLength(history.length + 1)
		expect(all.filter((item) => item.versionRole === '歷史版本').every((item) => item.status === 'create')).toBe(true)
	})

	it('should create jobs for history versions without records', () => {
		const plan = planBatchReprocess(['doc-001'], 'auto', 'all').filter((item) => item.status === 'create')
		expect(plan.length).toBeGreaterThan(0)

		runBatchReprocess(plan)
		expect(getDocumentProcessingRecord('doc-001', plan[0]!.version)).toBeDefined()
	})
})

describe('批次核准', () => {
	it('should not count a document under reprocessing as approvable', () => {
		const document = workspaceDocuments.find((item) => item.status === '待審核')!
		const record = getDocumentProcessingRecord(document.id, document.version)!
		reprocessJob(record.jobId, 'parse')

		expect(isDocumentProcessing(document.id)).toBe(true)
	})
})

describe('歷史版本也會被檢索', () => {
	it('should keep the pending flag when only the active versions are reprocessed', () => {
		markStrategyChanged('doc-002', ['embed'])
		runBatchReprocess(planBatchReprocess(['doc-002'], 'auto', 'active'))

		expect(getEarliestPendingStage('doc-002')).toBeDefined()
	})

	it('should clear the pending flag once every version is queued from the changed stage', () => {
		// doc-005 在這個測試檔裡還沒被重跑過，每個版本都能排入
		markStrategyChanged('doc-005', ['embed'])
		const document = workspaceDocuments.find((item) => item.id === 'doc-005')!
		const queued = reprocessAllVersions('doc-005', 'embed')

		expect(queued).toBe(getWorkspaceVersions(document).length)
		expect(getEarliestPendingStage('doc-005')).toBeUndefined()
	})
})

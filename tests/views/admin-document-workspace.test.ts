import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { documentChunks, saveDocumentChunks } from '@/mocks/documentChunks'
import { prepareVersionFiles, versionFiles } from '@/mocks/documentFiles'
import { getDocumentProcessingRecord, processingStages } from '@/mocks/documentProcessing'
import { chunkOptionsError, DEFAULT_STRATEGY_OPTIONS, documentOverrideEnabled, resolveStrategy, saveStrategy } from '@/mocks/documentStrategies'
import { addWorkspaceVersion, getWorkspaceVersions, suggestVersion, workspaceDocuments } from '@/mocks/documentWorkspace'
import { fetchEmployeeDocuments } from '@/repositories/knowledge.repository'
import type { KnowledgeDocument } from '@/types'
import AdminUploadView from '@/views/admin/AdminUploadView.vue'

globalThis.ResizeObserver = class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
} as typeof ResizeObserver

let wrapper: VueWrapper | null = null

function findDocument(documentId: string): KnowledgeDocument {
	const document = workspaceDocuments.find((item) => item.id === documentId)
	if (!document) throw new Error(`測試資料缺少文件 ${documentId}`)
	return document
}

async function createEmptyFiles(): Promise<Awaited<ReturnType<typeof prepareVersionFiles>>> {
	return prepareVersionFiles({ type: 'text', format: 'plain-text', content: '第二版全文內容' })
}

describe('文件版本工作階段', () => {
	it('should suggest the next minor version from the existing history', () => {
		expect(suggestVersion([{ version: '3.2', date: '', author: '', summary: '', changes: [] }])).toBe('3.3')
		expect(suggestVersion([{ version: '1.0.4', date: '', author: '', summary: '', changes: [] }])).toBe('1.0.5')
		expect(suggestVersion([])).toBe('1.0')
	})

	it('should keep a newly uploaded version out of the portal version list until it is processed', async () => {
		const document = findDocument('doc-001')
		const files = await createEmptyFiles()

		addWorkspaceVersion(document, '3.3', '補充旺季住宿標準與例外說明。', files)

		const adminVersions = getWorkspaceVersions(document)
		expect(adminVersions[0]?.version).toBe('3.3')
		expect(adminVersions[0]?.status).toBe('等待處理')
		expect(adminVersions[0]?.isCurrent).toBe(false)
		expect(versionFiles['doc-001']?.['3.3']).toBeDefined()

		// @ 前台只看得到已處理完成的版本，待處理版本不得混入。
		const employeeVersions = adminVersions.filter((entry) => entry.status !== '等待處理')
		expect(employeeVersions.some((entry) => entry.version === '3.3')).toBe(false)
		expect(employeeVersions[0]?.isCurrent).toBe(true)
	})

	it('should reject a duplicate version number or a missing version note', async () => {
		const document = findDocument('doc-002')
		const files = await createEmptyFiles()

		expect(() => addWorkspaceVersion(document, document.version, '重複版本', files)).toThrow('此版本號已存在。')
		expect(() => addWorkspaceVersion(document, '9.9', '   ', files)).toThrow('請填寫有效的版本號與版本說明。')
		expect(() => addWorkspaceVersion(document, 'v9', '格式錯誤', files)).toThrow('請填寫有效的版本號與版本說明。')
	})
})

describe('切塊編輯', () => {
	it('should store edited chunks per version and flag the downstream stages for reprocessing', () => {
		saveDocumentChunks('doc-001', '3.2', [
			{ id: 'chunk-1', heading: '一、適用範圍', body: '  國內外出差皆適用。  ' },
			{ id: 'chunk-2', heading: '二、核銷期限', body: '返程後十個工作天內完成。' },
		])

		const saved = documentChunks['doc-001:3.2']
		expect(saved?.chunks).toHaveLength(2)
		expect(saved?.chunks[0]?.body).toBe('國內外出差皆適用。')
		expect(saved?.needsReprocessing).toBe(true)
		expect(documentChunks['doc-001:3.3']).toBeUndefined()
	})

	it('should refuse to save an empty chunk set or a blank chunk', () => {
		expect(() => saveDocumentChunks('doc-002', '2.0', [])).toThrow('每個切塊都需要內容')
		expect(() => saveDocumentChunks('doc-002', '2.0', [{ id: 'chunk-1', heading: '空白', body: '   ' }]))
			.toThrow('每個切塊都需要內容')
	})
})

describe('處理策略', () => {
	it('should cover all seven processing stages', () => {
		expect(processingStages.map((stage) => stage.name)).toEqual([
			'文字抽取', '切段', '向量化', '建索引', '知識圖譜', 'AI 摘要', '品質診斷',
		])
		expect(getDocumentProcessingRecord('doc-001')?.steps.map((step) => step.name))
			.toEqual(processingStages.map((stage) => stage.name))
	})

	it('should fall back to the global strategy until a document overrides it', () => {
		const globalParse = resolveStrategy().find((stage) => stage.stageId === 'parse')!
		expect(resolveStrategy('doc-001').find((stage) => stage.stageId === 'parse')?.strategyId).toBe(globalParse.strategyId)

		documentOverrideEnabled['doc-001'] = true
		saveStrategy([{ stageId: 'parse', strategyId: 'ocr', options: { ...DEFAULT_STRATEGY_OPTIONS } }], 'doc-001')

		const overridden = resolveStrategy('doc-001').find((stage) => stage.stageId === 'parse')
		expect(overridden?.strategyId).toBe('ocr')
		expect(overridden?.source).toBe('document')
		expect(resolveStrategy('doc-002').find((stage) => stage.stageId === 'parse')?.source).toBe('global')
	})

	it('should ignore document overrides while the override switch is off', () => {
		documentOverrideEnabled['doc-004'] = false
		saveStrategy([{ stageId: 'chunk', strategyId: 'sliding_window', options: { ...DEFAULT_STRATEGY_OPTIONS } }], 'doc-004')

		expect(resolveStrategy('doc-004').find((stage) => stage.stageId === 'chunk')?.source).toBe('global')
	})

	it('should explain an out-of-range chunk length or overlap', () => {
		expect(chunkOptionsError({ ...DEFAULT_STRATEGY_OPTIONS, maxChunkLength: 50 })).toContain('最大段落長度')
		expect(chunkOptionsError({ ...DEFAULT_STRATEGY_OPTIONS, maxChunkLength: 800, chunkOverlap: 800 })).toContain('重疊字數')
		expect(chunkOptionsError({ ...DEFAULT_STRATEGY_OPTIONS, maxChunkLength: 800, chunkOverlap: 120 })).toBe('')
	})
})

describe('AdminUploadView 三種文件來源', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
	})

	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
	})

	function createTestRouter(): Router {
		return createRouter({
			history: createMemoryHistory(),
			routes: [
				{ path: '/admin/documents/upload', component: AdminUploadView },
				{ path: '/:pathMatch(.*)*', component: defineComponent({ template: '<main>fallback</main>' }) },
			],
		})
	}

	async function mountUploadView(): Promise<VueWrapper> {
		const router = createTestRouter()
		await router.push('/admin/documents/upload')
		await router.isReady()

		wrapper = mount(AdminUploadView, {
			global: { plugins: [createVuetify({ components, directives }), router] },
		})
		await flushPromises()
		return wrapper
	}

	async function chooseSource(view: VueWrapper, label: string): Promise<void> {
		await view.findAll('button').find((button) => button.text() === label)!.trigger('click')
		await flushPromises()
	}

	it('should offer file, text and URL as document sources', async () => {
		const view = await mountUploadView()

		expect(view.text()).toContain('上傳檔案')
		expect(view.text()).toContain('輸入文字')
		expect(view.text()).toContain('貼上網址')
	})

	it('should block a non-HTTP url and accept an https one', async () => {
		const view = await mountUploadView()
		await chooseSource(view, '貼上網址')

		const urlField = view.findAll('input').find((input) => input.attributes('type') !== 'file')!
		await urlField.setValue('javascript:alert(1)')
		await flushPromises()
		expect(view.text()).toContain('請輸入有效的 HTTP 或 HTTPS 網址')

		await urlField.setValue('https://intranet.example.com/policy')
		await flushPromises()
		expect(view.text()).not.toContain('請輸入有效的 HTTP 或 HTTPS 網址')
	})

	it('should create a text document with its initial version note and keep it out of the employee library', async () => {
		const view = await mountUploadView()
		const documentCountBefore = workspaceDocuments.length
		await chooseSource(view, '輸入文字')

		await view.find('textarea').setValue('# 測試文字文件\n\n這是以文字建立的文件內容。')
		await flushPromises()
		await view.find('[data-testid="upload-next"]').trigger('click')
		await flushPromises()

		await view.findAll('input').find((input) => input.attributes('id') === undefined || input.attributes('type') === 'text')!.setValue('文字建立的測試文件')
		await view.find('[data-testid="initial-version-note"] textarea').setValue('初版：整理測試用的文字內容。')
		await flushPromises()
		await view.find('[data-testid="upload-next"]').trigger('click')
		await flushPromises()
		await view.find('[data-testid="upload-next"]').trigger('click')
		await flushPromises()

		// @ 建立文件改為非同步，等寫入完成
		await vi.waitFor(() => expect(workspaceDocuments.length).toBe(documentCountBefore + 1))
		const created = workspaceDocuments[0]!
		expect(created.title).toBe('文字建立的測試文件')
		expect(created.source.type).toBe('text')
		expect(created.status).toBe('處理中')
		expect(created.summary).toBe('初版：整理測試用的文字內容。')
		expect(getWorkspaceVersions(created)[0]?.status).toBe('等待處理')
		expect(getDocumentProcessingRecord(created.id)?.steps).toHaveLength(processingStages.length)
		// @ 還在處理中的文件不該出現在前台知識庫。
		expect((await fetchEmployeeDocuments()).some((item) => item.id === created.id)).toBe(false)
	})
})

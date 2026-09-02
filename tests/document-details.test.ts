import { flushPromises, mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { documentVersionHistoryById } from '@/mocks/data'
import { getDocumentKnowledgeContext, getDocumentVersionDetail } from '@/mocks/documentDetails'
import DocumentView from '@/views/DocumentView.vue'

globalThis.ResizeObserver = class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
} as typeof ResizeObserver

Object.defineProperty(globalThis, 'visualViewport', {
	configurable: true,
	value: {
		addEventListener: () => undefined,
		height: 768,
		offsetLeft: 0,
		offsetTop: 0,
		removeEventListener: () => undefined,
		width: 1024,
	} satisfies Partial<VisualViewport>,
})

afterEach(() => {
	vi.useRealTimers()
})

describe('document detail data', () => {
	it('should return distinct content and AI summary for each selected version', () => {
		const currentVersion = getDocumentVersionDetail({
			documentId: 'doc-001',
			version: '3.2',
			versionSummary: '',
		})
		const previousVersion = getDocumentVersionDetail({
			documentId: 'doc-001',
			version: '3.1',
			versionSummary: '',
		})

		expect(currentVersion.aiSummary).toContain('3,000 元')
		expect(previousVersion.aiSummary).toContain('2,800 元')
		expect(previousVersion.sections.map((section) => section.body).join(' ')).toContain('七個工作天')
		expect(previousVersion.sections).not.toEqual(currentVersion.sections)
	})

	it('should provide readable content for every version of each employee-visible document', () => {
		for (const documentId of ['doc-001', 'doc-002', 'doc-005']) {
			const summaries = documentVersionHistoryById[documentId].map((version) => {
				const detail = getDocumentVersionDetail({
					documentId,
					version: version.version,
					versionSummary: version.summary,
				})
				expect(detail.sections.length).toBeGreaterThan(0)
				expect(detail.keyPoints.length).toBeGreaterThan(0)
				return detail.aiSummary
			})

			expect(new Set(summaries).size).toBe(documentVersionHistoryById[documentId].length)
		}
	})

	it('should derive readable related documents from the knowledge graph context', () => {
		const context = getDocumentKnowledgeContext('doc-002')

		expect(context.focusNodeId).toBe('n-onboarding')
		expect(context.topics.some((topic) => topic.label === '試用期')).toBe(true)
		expect(context.relatedDocuments.map((item) => item.document.id)).toEqual(['doc-005', 'doc-001'])
		expect(context.relatedDocuments.every((item) => item.document.status === '已發布')).toBe(true)
	})
})

describe('DocumentView', () => {
	it('should switch the document body and AI summary when another version is selected', async () => {
		vi.useFakeTimers()
		const router = createRouter({
			history: createMemoryHistory(),
			routes: [
				{ path: '/documents/:id', component: DocumentView },
				{ path: '/library', component: { template: '<div />' } },
				{ path: '/ask', component: { template: '<div />' } },
				{ path: '/graph', component: { template: '<div />' } },
			],
		})
		await router.push('/documents/doc-001')
		await router.isReady()
		const wrapper = mount(
			{
				components: { DocumentView },
				template: '<VApp><DocumentView /></VApp>',
			},
			{
				global: {
					plugins: [createVuetify({ components, directives }), router],
				},
			},
		)

		await vi.advanceTimersByTimeAsync(320)
		await flushPromises()

		expect(wrapper.text()).toContain('依第 3.2 版全文產生')
		expect(wrapper.text()).toContain('國內住宿每晚以新台幣 3,000 元為原則')
		expect(wrapper.text()).toContain('這份文件的知識關聯')

		const previousVersionButton = wrapper.findAll('.version-option').find((button) => button.text().includes('第 3.1 版'))
		expect(previousVersionButton).toBeDefined()
		await previousVersionButton?.trigger('click')

		expect(wrapper.text()).toContain('依第 3.1 版全文產生')
		expect(wrapper.text()).toContain('國內住宿每晚以新台幣 2,800 元為原則')
		expect(wrapper.text()).toContain('你正在閱讀歷史版本')
		expect(wrapper.find('a[href="/documents/doc-005"]').exists()).toBe(true)

		wrapper.unmount()
	})
})

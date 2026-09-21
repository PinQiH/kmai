import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { describe, expect, it } from 'vitest'

import NotebookKnowledgeGraph from '@/components/NotebookKnowledgeGraph.vue'
import { buildNotebookKnowledgeGraph } from '@/mocks/notebookKnowledgeGraph'

function createFileSource(fileName: string) {
	return { type: 'file' as const, fileName, mimeType: 'application/pdf', extension: 'pdf' }
}

describe('NotebookKnowledgeGraph', () => {
	it('should render the notebook graph summary and visible nodes when documents exist', () => {
		const context = buildNotebookKnowledgeGraph({
			id: 'notebook-product',
			name: '產品研究筆記',
			documents: [{
				id: 'nb-doc-001',
				name: '2026-Q3-市場觀察.pdf',
				size: '2.4 MB',
				uploadedAt: '2026-08-18',
				status: 'ready',
				source: createFileSource('2026-Q3-市場觀察.pdf'),
			}],
		})
		const wrapper = mount(NotebookKnowledgeGraph, {
			props: { context, canUpload: true },
			global: { plugins: [createVuetify({ components, directives })] },
		})

		expect(wrapper.get('[data-testid="notebook-knowledge-graph"]').attributes('aria-label')).toBe('這本筆記本的知識圖譜')
		expect(wrapper.find('h2').exists()).toBe(false)
		expect(wrapper.get('[aria-label="圖譜摘要"]').text()).toContain('1 份可用文件 · 4 個主題')
		expect(wrapper.get('[data-testid="notebook-knowledge-canvas"]').text()).toContain('產品研究筆記')
		expect(wrapper.text()).toContain('2026-Q3-市場觀察.pdf')
		expect(wrapper.text()).toContain('市場趨勢')
		expect(wrapper.findAll('svg line')).toHaveLength(5)
		expect(wrapper.get('.notebook-related-node--document').attributes('title')).toBe('2026-Q3-市場觀察.pdf')
	})

	it('should render guidance without duplicating the page upload action when the graph is empty', () => {
		const context = buildNotebookKnowledgeGraph({
			id: 'notebook-empty',
			name: '空白筆記本',
			documents: [],
		})
		const wrapper = mount(NotebookKnowledgeGraph, {
			props: { context, canUpload: true },
			global: { plugins: [createVuetify({ components, directives })] },
		})

		expect(wrapper.get('[data-testid="notebook-knowledge-empty"]').text()).toContain('上傳文件後就會建立知識圖譜')
		expect(wrapper.find('[data-testid="notebook-graph-upload"]').exists()).toBe(false)
	})

	it('should preserve the full file name as a title when the visible label is clamped', () => {
		const longFileName = `${'季度市場與競品研究報告'.repeat(8)}.pdf`
		const context = buildNotebookKnowledgeGraph({
			id: 'notebook-long-name',
			name: '長檔名測試',
			documents: [{ id: 'long-name', name: longFileName, size: '1 MB', uploadedAt: '2026-09-02', status: 'ready', source: createFileSource(longFileName) }],
		})
		const wrapper = mount(NotebookKnowledgeGraph, {
			props: { context, canUpload: true },
			global: { plugins: [createVuetify({ components, directives })] },
		})

		expect(wrapper.get('.notebook-related-node--document').attributes('title')).toBe(longFileName)
	})

	it('should explain processing and failed documents without showing graph nodes', () => {
		const context = buildNotebookKnowledgeGraph({
			id: 'notebook-unavailable',
			name: '處理中的筆記本',
			documents: [
				{ id: 'processing', name: '處理中.pdf', size: '1 MB', uploadedAt: '2026-09-02', status: 'processing', source: createFileSource('處理中.pdf') },
				{ id: 'failed', name: '失敗.pdf', size: '1 MB', uploadedAt: '2026-09-02', status: 'failed', source: createFileSource('失敗.pdf') },
			],
		})
		const wrapper = mount(NotebookKnowledgeGraph, {
			props: { context, canUpload: true },
			global: { plugins: [createVuetify({ components, directives })] },
		})

		expect(wrapper.get('[data-testid="notebook-knowledge-empty"]').text()).toContain('文件處理完成後會建立知識圖譜')
		expect(wrapper.text()).toContain('1 份正在處理，1 份處理失敗')
		expect(wrapper.find('[data-testid="notebook-knowledge-canvas"]').exists()).toBe(false)
	})

	it('should guide a viewer to contact the owner when an empty notebook cannot be edited', () => {
		const context = buildNotebookKnowledgeGraph({
			id: 'notebook-viewer-empty',
			name: '唯讀筆記本',
			documents: [],
		})
		const wrapper = mount(NotebookKnowledgeGraph, {
			props: { context, canUpload: false },
			global: { plugins: [createVuetify({ components, directives })] },
		})

		expect(wrapper.get('[data-testid="notebook-knowledge-empty"]').text()).toContain('這本筆記本還沒有可查看的圖譜')
		expect(wrapper.text()).toContain('請聯絡筆記本擁有者')
	})
})

import { describe, expect, it } from 'vitest'

import { buildNotebookKnowledgeGraph } from '@/mocks/notebookKnowledgeGraph'
import type { NotebookDocument } from '@/types'

function createDocument(id: string, name = `${id}.pdf`): NotebookDocument {
	return {
		id,
		name,
		size: '1 MB',
		uploadedAt: '2026-09-02',
		status: 'ready',
		source: { type: 'file', fileName: name, mimeType: 'application/pdf', extension: 'pdf' },
	}
}

function buildGraph(documents: NotebookDocument[]) {
	return buildNotebookKnowledgeGraph({
		id: 'notebook-product',
		name: '產品研究筆記',
		documents,
	})
}

describe('buildNotebookKnowledgeGraph', () => {
	it('should include the notebook, document, topics, and relations when mock topics exist', () => {
		const graph = buildGraph([createDocument('nb-doc-001', '2026-Q3-市場觀察.pdf')])

		expect(graph.documentCount).toBe(1)
		expect(graph.topicCount).toBe(4)
		expect(graph.totalNodeCount).toBe(6)
		expect(graph.hiddenNodeCount).toBe(0)
		expect(graph.nodes.map((node) => node.label)).toEqual([
			'2026-Q3-市場觀察.pdf',
			'市場趨勢',
			'競品動態',
			'客群需求',
			'產品機會',
		])
		expect(graph.edges).toHaveLength(5)
	})

	it('should add only a document node when an uploaded document has no topic mapping', () => {
		const graph = buildGraph([createDocument('uploaded-document', '訪談逐字稿.md')])

		expect(graph.topicCount).toBe(0)
		expect(graph.nodes).toEqual([
			{ id: 'document:uploaded-document', label: '訪談逐字稿.md', kind: 'document' },
		])
		expect(graph.edges).toEqual([
			{
				id: 'notebook:notebook-product:document:uploaded-document',
				sourceId: 'notebook:notebook-product',
				targetId: 'document:uploaded-document',
			},
		])
	})

	it('should cap visible related nodes and report hidden nodes when a notebook is large', () => {
		const documents = [
			createDocument('nb-doc-001'),
			...Array.from({ length: 6 }, (_, index) => createDocument(`uploaded-${index}`)),
		]
		const graph = buildGraph(documents)

		expect(graph.nodes).toHaveLength(6)
		expect(graph.totalNodeCount).toBe(12)
		expect(graph.hiddenNodeCount).toBe(5)
	})

	it('should return an empty graph context when the notebook has no documents', () => {
		const graph = buildGraph([])

		expect(graph.totalNodeCount).toBe(0)
		expect(graph.nodes).toEqual([])
		expect(graph.edges).toEqual([])
	})

	it('should exclude processing and failed documents from graph nodes and topics', () => {
		const processingDocument = { ...createDocument('nb-doc-001'), status: 'processing' as const }
		const failedDocument = { ...createDocument('failed-document'), status: 'failed' as const }
		const graph = buildGraph([processingDocument, failedDocument])

		expect(graph.documentCount).toBe(0)
		expect(graph.processingDocumentCount).toBe(1)
		expect(graph.failedDocumentCount).toBe(1)
		expect(graph.topicCount).toBe(0)
		expect(graph.totalNodeCount).toBe(0)
		expect(graph.nodes).toEqual([])
	})
})

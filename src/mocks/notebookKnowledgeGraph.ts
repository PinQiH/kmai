import type { Notebook } from '@/types'

export type NotebookKnowledgeNodeKind = 'document' | 'topic'

export interface NotebookKnowledgeNode {
	id: string
	label: string
	kind: NotebookKnowledgeNodeKind
}

export interface NotebookKnowledgeEdge {
	id: string
	sourceId: string
	targetId: string
}

export interface NotebookKnowledgeGraphContext {
	notebookId: string
	notebookName: string
	notebookNodeId: string
	documentCount: number
	processingDocumentCount: number
	failedDocumentCount: number
	topicCount: number
	totalNodeCount: number
	hiddenNodeCount: number
	nodes: NotebookKnowledgeNode[]
	edges: NotebookKnowledgeEdge[]
}

interface TopicDefinition {
	id: string
	label: string
}

const MAX_VISIBLE_RELATED_NODES = 6
const MAX_VISIBLE_DOCUMENT_NODES = 3

const topicsByDocumentId: Record<string, TopicDefinition[]> = {
	'nb-doc-001': [
		{ id: 'market-trends', label: '市場趨勢' },
		{ id: 'competitor-movements', label: '競品動態' },
		{ id: 'customer-needs', label: '客群需求' },
		{ id: 'product-opportunities', label: '產品機會' },
	],
}

function getDocumentNodeId(documentId: string): string {
	return `document:${documentId}`
}

function getTopicNodeId(topicId: string): string {
	return `topic:${topicId}`
}

export function buildNotebookKnowledgeGraph(
	notebook: Pick<Notebook, 'id' | 'name' | 'documents'>,
): NotebookKnowledgeGraphContext {
	const notebookNodeId = `notebook:${notebook.id}`
	const readyDocuments = notebook.documents.filter((document) => document.status === 'ready')
	const processingDocumentCount = notebook.documents.filter((document) => document.status === 'processing').length
	const failedDocumentCount = notebook.documents.filter((document) => document.status === 'failed').length
	const allTopics = new Map<string, TopicDefinition>()

	for (const document of readyDocuments) {
		for (const topic of topicsByDocumentId[document.id] ?? []) {
			allTopics.set(topic.id, topic)
		}
	}

	if (readyDocuments.length === 0) {
		return {
			notebookId: notebook.id,
			notebookName: notebook.name,
			notebookNodeId,
			documentCount: 0,
			processingDocumentCount,
			failedDocumentCount,
			topicCount: 0,
			totalNodeCount: 0,
			hiddenNodeCount: 0,
			nodes: [],
			edges: [],
		}
	}

	const visibleDocuments = readyDocuments.slice(0, MAX_VISIBLE_DOCUMENT_NODES)
	const visibleDocumentNodes: NotebookKnowledgeNode[] = visibleDocuments.map((document) => ({
		id: getDocumentNodeId(document.id),
		label: document.name,
		kind: 'document',
	}))
	const visibleTopicLimit = MAX_VISIBLE_RELATED_NODES - visibleDocumentNodes.length
	const visibleTopics = new Map<string, TopicDefinition>()

	for (const document of visibleDocuments) {
		for (const topic of topicsByDocumentId[document.id] ?? []) {
			if (visibleTopics.size >= visibleTopicLimit) break
			visibleTopics.set(topic.id, topic)
		}
		if (visibleTopics.size >= visibleTopicLimit) break
	}

	const visibleTopicNodes: NotebookKnowledgeNode[] = Array.from(visibleTopics.values()).map((topic) => ({
		id: getTopicNodeId(topic.id),
		label: topic.label,
		kind: 'topic',
	}))
	const edges: NotebookKnowledgeEdge[] = visibleDocuments.map((document) => ({
		id: `${notebookNodeId}:${getDocumentNodeId(document.id)}`,
		sourceId: notebookNodeId,
		targetId: getDocumentNodeId(document.id),
	}))

	for (const document of visibleDocuments) {
		for (const topic of topicsByDocumentId[document.id] ?? []) {
			if (!visibleTopics.has(topic.id)) continue
			edges.push({
				id: `${getDocumentNodeId(document.id)}:${getTopicNodeId(topic.id)}`,
				sourceId: getDocumentNodeId(document.id),
				targetId: getTopicNodeId(topic.id),
			})
		}
	}

	const nodes = [...visibleDocumentNodes, ...visibleTopicNodes]
	const totalNodeCount = 1 + readyDocuments.length + allTopics.size

	return {
		notebookId: notebook.id,
		notebookName: notebook.name,
		notebookNodeId,
		documentCount: readyDocuments.length,
		processingDocumentCount,
		failedDocumentCount,
		topicCount: allTopics.size,
		totalNodeCount,
		hiddenNodeCount: Math.max(0, totalNodeCount - nodes.length - 1),
		nodes,
		edges,
	}
}

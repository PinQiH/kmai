import { documents } from '@/mocks/data'
import type { KnowledgeDocument, UserDocumentSource } from '@/types'

const MOCK_DELAY_MS = 320

function canEmployeeReadDocument(document: KnowledgeDocument): boolean {
	return document.status === '已發布' && document.visibility === '全公司'
}

function cloneDocumentSource(source: UserDocumentSource): UserDocumentSource {
	switch (source.type) {
		case 'file':
			return { ...source }
		case 'text':
			return { ...source }
		case 'url':
			return { ...source }
	}
}

function cloneKnowledgeDocument(document: KnowledgeDocument): KnowledgeDocument {
	return {
		...document,
		source: cloneDocumentSource(document.source),
		tags: [...document.tags],
	}
}

/** 取得員工目前可見的文件快照，避免 View 直接依賴 Mock 資料來源。 */
export function getEmployeeDocumentsSnapshot(): KnowledgeDocument[] {
	return documents.filter(canEmployeeReadDocument).map(cloneKnowledgeDocument)
}

/** 取得員工在指定公司知識庫中目前可用的文件。 */
export function getEmployeeDocumentsBySourceId(sourceId: string): KnowledgeDocument[] {
	return getEmployeeDocumentsSnapshot().filter((document) => document.knowledgeSourceId === sourceId)
}

/**
 * 取得符合關鍵字的知識文件。
 * @param query 使用者輸入的搜尋文字。
 * @returns 符合文件標題、摘要、部門、分類或標籤的文件。
 */
export async function searchDocuments(query: string): Promise<KnowledgeDocument[]> {
	// TODO(api-integration): 改為呼叫後端知識搜尋 API。
	await new Promise((resolve) => window.setTimeout(resolve, MOCK_DELAY_MS))
	const normalizedQuery = query.trim().toLocaleLowerCase('zh-Hant')

	if (!normalizedQuery) return documents.filter(canEmployeeReadDocument)

	return documents.filter((document) => {
		if (!canEmployeeReadDocument(document)) return false
		const searchableText = [
			document.title,
			document.summary,
			document.department,
			document.category,
			...document.tags,
		].join(' ').toLocaleLowerCase('zh-Hant')

		return searchableText.includes(normalizedQuery)
	})
}

/**
 * 依識別碼取得文件。
 * @param documentId 文件識別碼。
 * @returns 文件或 undefined。
 */
export async function getDocumentById(documentId: string): Promise<KnowledgeDocument | undefined> {
	// TODO(api-integration): 改為呼叫後端文件詳情 API。
	await new Promise((resolve) => window.setTimeout(resolve, MOCK_DELAY_MS))
	const document = documents.find((item) => item.id === documentId && canEmployeeReadDocument(item))
	return document ? cloneKnowledgeDocument(document) : undefined
}

import type { KnowledgeSourceOption, Notebook } from '@/types'

export const MODEL_ONLY_SOURCE_ID = 'model'

export const MODEL_ONLY_SOURCE: KnowledgeSourceOption = {
	id: MODEL_ONLY_SOURCE_ID,
	name: '模型一般知識',
	description: '不檢索知識庫或筆記本，直接使用模型既有知識。',
	kind: 'model',
	defaultWebSearchEnabled: false,
	supportsWebSearch: false,
}

export const COMPANY_KNOWLEDGE_SOURCES: KnowledgeSourceOption[] = [
	{
		id: 'company',
		name: '全公司知識',
		description: '使用目前可見的公司知識庫。',
		kind: 'knowledge-base',
		defaultWebSearchEnabled: false,
		supportsWebSearch: true,
	},
	{
		id: 'policy',
		name: '公司制度',
		description: '優先搜尋公司制度與作業規範。',
		kind: 'knowledge-base',
		defaultWebSearchEnabled: false,
		supportsWebSearch: true,
	},
	{
		id: 'benefits',
		name: '人事與福利',
		description: '搜尋內部規章，並預設補充外部法規資訊。',
		kind: 'knowledge-base',
		defaultWebSearchEnabled: true,
		supportsWebSearch: true,
	},
]

/**
 * 建立前台與後台共用的知識來源選項。
 * @param notebooks 目前使用者可見的個人筆記本。
 * @param includeModel 是否包含僅使用模型一般知識的選項。
 * @returns 可供來源選擇器使用的完整清單。
 */
export function buildKnowledgeSourceOptions(
	notebooks: Notebook[],
	includeModel = true,
): KnowledgeSourceOption[] {
	const notebookSources = notebooks.map<KnowledgeSourceOption>((notebook) => ({
		id: notebook.id,
		name: notebook.name,
		description: `個人筆記本 · ${notebook.documents.length} 份文件`,
		kind: 'notebook',
		defaultWebSearchEnabled: notebook.defaultWebSearchEnabled,
		supportsWebSearch: true,
		documentCount: notebook.documents.length,
	}))

	return [
		...(includeModel ? [{ ...MODEL_ONLY_SOURCE }] : []),
		...COMPANY_KNOWLEDGE_SOURCES.map((source) => ({ ...source })),
		...notebookSources,
	]
}

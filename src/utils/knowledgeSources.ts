import type { KnowledgeDocument, KnowledgeSourceOption, Notebook } from '@/types'

export const MODEL_ONLY_SOURCE_ID = 'model'
export const DEFAULT_ASK_SOURCE_ID = 'policy'

export interface KnowledgeSourceGroup {
	id: 'syscom-library' | 'personal-notebooks' | 'model-only'
	label: string
	sources: KnowledgeSourceOption[]
}

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
		name: '人事流程',
		description: '搜尋到職、福利與人事相關流程。',
		kind: 'knowledge-base',
		defaultWebSearchEnabled: true,
		supportsWebSearch: true,
	},
	{
		id: 'information-security',
		name: '資訊安全',
		description: '搜尋資料存取、分享與資訊安全規範。',
		kind: 'knowledge-base',
		defaultWebSearchEnabled: false,
		supportsWebSearch: true,
	},
	{
		id: 'operations',
		name: '作業流程',
		description: '搜尋採購、請款與內部標準作業流程。',
		kind: 'knowledge-base',
		defaultWebSearchEnabled: false,
		supportsWebSearch: true,
	},
]

/** 依識別碼取得可供問答使用的公司知識來源。 */
export function getCompanyKnowledgeSourceById(sourceId: string): KnowledgeSourceOption | undefined {
	return COMPANY_KNOWLEDGE_SOURCES.find((source) => source.id === sourceId)
}

/** 取得公司文件所屬的知識來源。 */
export function getCompanyKnowledgeSourceForDocument(document: KnowledgeDocument): KnowledgeSourceOption | undefined {
	return getCompanyKnowledgeSourceById(document.knowledgeSourceId)
}

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

/**
 * 建立員工前台 AI 問答的分組來源，排除過度寬泛的全公司來源。
 * @param notebooks 目前使用者可見的個人筆記本。
 * @returns 依凌群知識庫、個人筆記本與模型一般知識分組的來源。
 */
export function buildAskKnowledgeSourceGroups(
	notebooks: Notebook[],
): KnowledgeSourceGroup[] {
	const sources = buildKnowledgeSourceOptions(notebooks)
	return [
		{
			id: 'syscom-library',
			label: '凌群知識庫',
			sources: sources.filter(
				(source) => source.kind === 'knowledge-base' && source.id !== 'company',
			),
		},
		{
			id: 'personal-notebooks',
			label: '我的筆記本',
			sources: sources.filter((source) => source.kind === 'notebook'),
		},
		{
			id: 'model-only',
			label: '其他',
			sources: sources.filter((source) => source.kind === 'model'),
		},
	]
}

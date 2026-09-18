import { reactive } from 'vue'

// > 系統資源：服務連線、模型與解析設定檔只在這裡定義，各管理頁面只選用設定檔 id

export type ResourceKind = 'llm' | 'embedding' | 'reranker' | 'parser'
export type ConnectionStatus = 'ok' | 'untested' | 'error'

export const resourceKindLabels: Record<ResourceKind, string> = {
	llm: '語言模型',
	embedding: '嵌入模型',
	reranker: '重新排序模型',
	parser: '文件解析',
}

export interface AiConnection {
	id: string
	name: string
	/** 只顯示主機名稱；完整網址與金鑰由後端保存。 */
	endpointHint: string
	kinds: ResourceKind[]
	status: ConnectionStatus
	checkedAt: string
	statusNote?: string
}

export interface LlmParams {
	temperature: number
	contextWindow: number
	maxOutputTokens: number
}

export interface EmbeddingParams {
	dimensions: number
	batchSize: number
}

export interface RerankerParams {
	topN: number
	timeoutSeconds: number
}

export interface ParserParams {
	engine: 'docling' | 'ocr'
	ocrLanguage: string
	tableStructure: boolean
	imageDpi: number
}

interface ProfileBase {
	id: string
	name: string
	description: string
	connectionId: string
	model: string
	updatedAt: string
	/** 設定檔測試：連線通過之外，還要確認模型名稱與參數可用。 */
	testStatus: ConnectionStatus
	testedAt: string
	testNote?: string
}

export type AiProfile =
	| (ProfileBase & { kind: 'llm'; params: LlmParams })
	| (ProfileBase & { kind: 'embedding'; params: EmbeddingParams })
	| (ProfileBase & { kind: 'reranker'; params: RerankerParams })
	| (ProfileBase & { kind: 'parser'; params: ParserParams })

// @ 連線以服務提供者命名；未串接的提供者維持「尚未測試」，建立設定檔時仍可選用
export const aiConnections = reactive<AiConnection[]>([
	{ id: 'conn-openai', name: 'OpenAI', endpointHint: 'api.openai.com', kinds: ['llm', 'embedding'], status: 'ok', checkedAt: '今天 09:12' },
	{ id: 'conn-azure', name: 'Azure OpenAI', endpointHint: '*.openai.azure.com', kinds: ['llm', 'embedding'], status: 'untested', checkedAt: '尚未測試' },
	{ id: 'conn-anthropic', name: 'Anthropic Claude', endpointHint: 'api.anthropic.com', kinds: ['llm'], status: 'ok', checkedAt: '今天 09:12' },
	{ id: 'conn-gemini', name: 'Google Gemini', endpointHint: 'generativelanguage.googleapis.com', kinds: ['llm', 'embedding'], status: 'untested', checkedAt: '尚未測試' },
	{ id: 'conn-bedrock', name: 'AWS Bedrock', endpointHint: 'bedrock-runtime.*.amazonaws.com', kinds: ['llm', 'embedding', 'reranker'], status: 'untested', checkedAt: '尚未測試' },
	{ id: 'conn-mistral', name: 'Mistral AI', endpointHint: 'api.mistral.ai', kinds: ['llm', 'embedding'], status: 'untested', checkedAt: '尚未測試' },
	{ id: 'conn-deepseek', name: 'DeepSeek', endpointHint: 'api.deepseek.com', kinds: ['llm'], status: 'untested', checkedAt: '尚未測試' },
	{ id: 'conn-groq', name: 'Groq', endpointHint: 'api.groq.com', kinds: ['llm'], status: 'untested', checkedAt: '尚未測試' },
	{ id: 'conn-openrouter', name: 'OpenRouter', endpointHint: 'openrouter.ai', kinds: ['llm'], status: 'untested', checkedAt: '尚未測試' },
	{ id: 'conn-cohere', name: 'Cohere', endpointHint: 'api.cohere.com', kinds: ['llm', 'embedding', 'reranker'], status: 'ok', checkedAt: '今天 09:12' },
	{ id: 'conn-jina', name: 'Jina AI', endpointHint: 'api.jina.ai', kinds: ['embedding', 'reranker'], status: 'untested', checkedAt: '尚未測試' },
	{ id: 'conn-voyage', name: 'Voyage AI', endpointHint: 'api.voyageai.com', kinds: ['embedding', 'reranker'], status: 'untested', checkedAt: '尚未測試' },
	{ id: 'conn-ollama', name: 'Ollama', endpointHint: 'localhost:11434', kinds: ['llm', 'embedding'], status: 'ok', checkedAt: '今天 09:12' },
	{ id: 'conn-vllm', name: 'vLLM（OpenAI 相容）', endpointHint: 'vllm:8000', kinds: ['llm', 'embedding', 'reranker'], status: 'untested', checkedAt: '尚未測試' },
	{ id: 'conn-litellm', name: 'LiteLLM Proxy', endpointHint: 'litellm:4000', kinds: ['llm', 'embedding', 'reranker'], status: 'ok', checkedAt: '今天 09:12' },
	{ id: 'conn-docling', name: 'Docling Serve', endpointHint: 'docling:5001', kinds: ['parser'], status: 'error', checkedAt: '今天 08:40', statusNote: '連線逾時，已重試 3 次。' },
])

export const aiProfiles = reactive<AiProfile[]>([
	{ id: 'llm-standard', kind: 'llm', name: 'GPT-4.1 mini', description: '品質與速度平衡，用於直接面對使用者的回答。', connectionId: 'conn-openai', model: 'gpt-4.1-mini', params: { temperature: 0.2, contextWindow: 128000, maxOutputTokens: 2000 }, updatedAt: '9 月 2 日', testStatus: 'ok', testedAt: '今天 09:15' },
	{ id: 'llm-gpt41', kind: 'llm', name: 'GPT-4.1', description: '較高品質，用於複雜比較題。', connectionId: 'conn-openai', model: 'gpt-4.1', params: { temperature: 0.2, contextWindow: 128000, maxOutputTokens: 4000 }, updatedAt: '9 月 2 日', testStatus: 'ok', testedAt: '今天 09:15' },
	{ id: 'llm-o4mini', kind: 'llm', name: 'o4-mini 推理', description: '多步驟推理，回應較慢。', connectionId: 'conn-openai', model: 'o4-mini', params: { temperature: 1, contextWindow: 128000, maxOutputTokens: 8000 }, updatedAt: '9 月 3 日', testStatus: 'untested', testedAt: '尚未測試' },
	{ id: 'llm-azure', kind: 'llm', name: 'Azure GPT-4.1', description: '資料留在 Azure 租戶內。', connectionId: 'conn-azure', model: 'gpt-4.1', params: { temperature: 0.2, contextWindow: 128000, maxOutputTokens: 2000 }, updatedAt: '8 月 30 日', testStatus: 'untested', testedAt: '尚未測試' },
	{ id: 'llm-claude', kind: 'llm', name: 'Claude Sonnet', description: '長文件理解與推理較佳。', connectionId: 'conn-anthropic', model: 'claude-sonnet-5', params: { temperature: 0.2, contextWindow: 128000, maxOutputTokens: 4000 }, updatedAt: '9 月 5 日', testStatus: 'ok', testedAt: '今天 09:15' },
	{ id: 'llm-haiku', kind: 'llm', name: 'Claude Haiku', description: '速度快、成本低，適合摘要。', connectionId: 'conn-anthropic', model: 'claude-haiku-4-5', params: { temperature: 0.1, contextWindow: 128000, maxOutputTokens: 1500 }, updatedAt: '9 月 5 日', testStatus: 'ok', testedAt: '今天 09:15' },
	{ id: 'llm-gemini-pro', kind: 'llm', name: 'Gemini 2.5 Pro', description: '超長上下文，適合整本手冊。', connectionId: 'conn-gemini', model: 'gemini-2.5-pro', params: { temperature: 0.2, contextWindow: 128000, maxOutputTokens: 4000 }, updatedAt: '9 月 4 日', testStatus: 'untested', testedAt: '尚未測試' },
	{ id: 'llm-gemini-flash', kind: 'llm', name: 'Gemini 2.5 Flash', description: '低延遲備援。', connectionId: 'conn-gemini', model: 'gemini-2.5-flsh', params: { temperature: 0.2, contextWindow: 128000, maxOutputTokens: 2000 }, updatedAt: '9 月 4 日', testStatus: 'error', testedAt: '今天 09:16', testNote: '找不到模型「gemini-2.5-flsh」，請確認模型名稱。' },
	{ id: 'llm-deepseek', kind: 'llm', name: 'DeepSeek V3', description: '中文表現佳，成本低。', connectionId: 'conn-deepseek', model: 'deepseek-chat', params: { temperature: 0.2, contextWindow: 64000, maxOutputTokens: 2000 }, updatedAt: '8 月 25 日', testStatus: 'untested', testedAt: '尚未測試' },
	{ id: 'llm-economy', kind: 'llm', name: 'Qwen 2.5 14B（本機）', description: '成本低，適合大量背景處理。', connectionId: 'conn-ollama', model: 'qwen2.5:14b', params: { temperature: 0.1, contextWindow: 32000, maxOutputTokens: 1200 }, updatedAt: '8 月 28 日', testStatus: 'ok', testedAt: '今天 09:15' },
	{ id: 'llm-litellm-llama', kind: 'llm', name: 'Llama 3.3 70B（LiteLLM）', description: '經 LiteLLM 統一計費與限流。', connectionId: 'conn-litellm', model: 'llama-3.3-70b', params: { temperature: 0.2, contextWindow: 128000, maxOutputTokens: 2000 }, updatedAt: '9 月 6 日', testStatus: 'ok', testedAt: '今天 09:15' },
	{ id: 'emb-default', kind: 'embedding', name: 'text-embedding-3-large', description: '涵蓋大多數中英文件。', connectionId: 'conn-openai', model: 'text-embedding-3-large', params: { dimensions: 1536, batchSize: 32 }, updatedAt: '7 月 15 日', testStatus: 'ok', testedAt: '今天 09:15' },
	{ id: 'emb-small', kind: 'embedding', name: 'text-embedding-3-small', description: '成本較低的替代方案。', connectionId: 'conn-openai', model: 'text-embedding-3-small', params: { dimensions: 1536, batchSize: 64 }, updatedAt: '7 月 15 日', testStatus: 'untested', testedAt: '尚未測試' },
	{ id: 'emb-local', kind: 'embedding', name: 'BGE-M3（本機）', description: '資料不外傳，支援多國語言。', connectionId: 'conn-ollama', model: 'bge-m3', params: { dimensions: 1024, batchSize: 16 }, updatedAt: '8 月 3 日', testStatus: 'ok', testedAt: '今天 09:15' },
	{ id: 'emb-gemini', kind: 'embedding', name: 'Gemini Embedding', description: '多語嵌入。', connectionId: 'conn-gemini', model: 'gemini-embedding-001', params: { dimensions: 3072, batchSize: 32 }, updatedAt: '9 月 4 日', testStatus: 'untested', testedAt: '尚未測試' },
	{ id: 'rerank-cohere', kind: 'reranker', name: 'Cohere Rerank', description: '多語重新排序，引用準確度較高。', connectionId: 'conn-cohere', model: 'rerank-multilingual-v3.0', params: { topN: 12, timeoutSeconds: 8 }, updatedAt: '8 月 20 日', testStatus: 'ok', testedAt: '今天 09:15' },
	{ id: 'rerank-bge', kind: 'reranker', name: 'BGE Reranker（本機）', description: '以 vLLM 部署，資料不外傳。', connectionId: 'conn-vllm', model: 'bge-reranker-v2-m3', params: { topN: 12, timeoutSeconds: 8 }, updatedAt: '8 月 20 日', testStatus: 'untested', testedAt: '尚未測試' },
	{ id: 'rerank-jina', kind: 'reranker', name: 'Jina Reranker', description: '長文件重新排序。', connectionId: 'conn-jina', model: 'jina-reranker-v2-base-multilingual', params: { topN: 10, timeoutSeconds: 8 }, updatedAt: '8 月 22 日', testStatus: 'untested', testedAt: '尚未測試' },
	{ id: 'parse-standard', kind: 'parser', name: '一般文件', description: '文字型 PDF 與 Office 檔，保留表格結構。', connectionId: 'conn-docling', model: 'Docling', params: { engine: 'docling', ocrLanguage: '繁體中文＋英文', tableStructure: true, imageDpi: 150 }, updatedAt: '9 月 1 日', testStatus: 'error', testedAt: '今天 08:40', testNote: 'Docling Serve 連線逾時。' },
	{ id: 'parse-scan', kind: 'parser', name: '掃描檔 OCR', description: '圖片型 PDF，先辨識文字再解析。', connectionId: 'conn-docling', model: 'Docling + OCR', params: { engine: 'ocr', ocrLanguage: '繁體中文＋英文', tableStructure: false, imageDpi: 300 }, updatedAt: '9 月 1 日', testStatus: 'error', testedAt: '今天 08:40', testNote: 'Docling Serve 連線逾時。' },
])

// > 用途：系統中實際呼叫資源的地方；在各自的管理頁面選用設定檔

export type UsageId = 'answer' | 'planner' | 'rerank' | 'summarize' | 'graph' | 'embed' | 'parse'

export interface AiUsage {
	id: UsageId
	name: string
	kind: ResourceKind
	/** 選用設定檔的管理頁面。 */
	pageLabel: string
	pagePath: string
}

export const aiUsages: AiUsage[] = [
	{ id: 'answer', name: '生成回答', kind: 'llm', pageLabel: 'AI 與檢索設定', pagePath: '/admin/ai-settings' },
	{ id: 'planner', name: '問題規劃', kind: 'llm', pageLabel: 'AI 與檢索設定', pagePath: '/admin/ai-settings' },
	{ id: 'rerank', name: '重新排序', kind: 'reranker', pageLabel: 'AI 與檢索設定', pagePath: '/admin/ai-settings' },
	{ id: 'summarize', name: 'AI 摘要', kind: 'llm', pageLabel: '文件處理策略', pagePath: '/admin/processing' },
	{ id: 'graph', name: '知識圖譜抽取', kind: 'llm', pageLabel: '文件處理策略', pagePath: '/admin/processing' },
	{ id: 'embed', name: '向量化', kind: 'embedding', pageLabel: '文件處理策略', pagePath: '/admin/processing' },
	{ id: 'parse', name: '文件解析', kind: 'parser', pageLabel: '文件處理策略', pagePath: '/admin/processing' },
]

/**
 * 各用途目前選用的設定檔。
 * @ 問答類在「AI 與檢索設定」直接修改；處理類是全域策略未指定時的預設值。
 */
export const usageAssignments = reactive<Record<UsageId, string>>({
	answer: 'llm-standard',
	planner: 'llm-standard',
	rerank: 'rerank-cohere',
	summarize: 'llm-economy',
	graph: 'llm-economy',
	embed: 'emb-default',
	parse: 'parse-standard',
})

export function getProfile(profileId: string | null | undefined): AiProfile | undefined {
	return aiProfiles.find((profile) => profile.id === profileId)
}

export function getProfilesByKind(kind: ResourceKind): AiProfile[] {
	return aiProfiles.filter((profile) => profile.kind === kind)
}

export function getConnection(connectionId: string): AiConnection | undefined {
	return aiConnections.find((connection) => connection.id === connectionId)
}

export function getUsage(usageId: UsageId): AiUsage {
	return aiUsages.find((usage) => usage.id === usageId)!
}

export function getAssignedProfile(usageId: UsageId): AiProfile | undefined {
	return getProfile(usageAssignments[usageId])
}

/** 哪些用途選用了這個設定檔。 */
export function getProfileUsages(profileId: string): AiUsage[] {
	return aiUsages.filter((usage) => usageAssignments[usage.id] === profileId)
}

/** 將設定檔整理成一行摘要，供各頁選單顯示。 */
export function describeProfile(profile: AiProfile | undefined): string {
	if (!profile) return '尚未指定'
	const provider = getConnection(profile.connectionId)?.name ?? '未知連線'
	if (profile.kind === 'llm') return `${provider} · ${profile.model} · Temperature ${profile.params.temperature}`
	if (profile.kind === 'embedding') return `${provider} · ${profile.model} · ${profile.params.dimensions} 維`
	if (profile.kind === 'reranker') return `${provider} · ${profile.model} · 保留 ${profile.params.topN} 筆`
	return `${profile.params.engine === 'ocr' ? 'OCR 優先' : 'Docling'} · ${profile.params.ocrLanguage} · ${profile.params.imageDpi} dpi`
}

export function saveProfile(profile: AiProfile): void {
	const index = aiProfiles.findIndex((entry) => entry.id === profile.id)
	const previous = aiProfiles[index]
	// @ 模型或連線換了，先前的測試結果不再可信，改回尚未測試
	const needsRetest = !previous || previous.model !== profile.model || previous.connectionId !== profile.connectionId
	const next = { ...profile, updatedAt: '剛剛', ...(needsRetest ? { testStatus: 'untested', testedAt: '尚未測試', testNote: undefined } : {}) } as AiProfile
	if (index === -1) aiProfiles.push(next)
	else aiProfiles.splice(index, 1, next)
}

/** 刪除設定檔；仍被用途選用時拒絕並回傳 false。處理策略引用由呼叫端另外檢查。 */
export function deleteProfile(profileId: string): boolean {
	if (getProfileUsages(profileId).length) return false
	const index = aiProfiles.findIndex((profile) => profile.id === profileId)
	if (index === -1) return false
	aiProfiles.splice(index, 1)
	return true
}

export function testConnection(connectionId: string): ConnectionStatus {
	const connection = getConnection(connectionId)
	if (!connection) return 'error'
	// @ 假資料：Docling 固定模擬逾時，方便檢視錯誤狀態
	connection.status = connection.id === 'conn-docling' ? 'error' : 'ok'
	connection.checkedAt = '剛剛'
	return connection.status
}

/** 測試設定檔：先確認連線，再以設定檔的模型名稱實際呼叫一次。 */
export function testProfile(profileId: string): ConnectionStatus {
	const profile = getProfile(profileId)
	if (!profile) return 'error'
	const connectionStatus = testConnection(profile.connectionId)
	const connection = getConnection(profile.connectionId)
	profile.testedAt = '剛剛'
	if (connectionStatus === 'error') {
		profile.testStatus = 'error'
		profile.testNote = `${connection?.name ?? '服務'}連線失敗：${connection?.statusNote ?? '請確認服務是否啟動。'}`
	} else if (!profile.model.trim() || /flsh/.test(profile.model)) {
		// @ 假資料：模型名稱打錯時模擬「找不到模型」
		profile.testStatus = 'error'
		profile.testNote = `找不到模型「${profile.model}」，請確認模型名稱。`
	} else {
		profile.testStatus = 'ok'
		profile.testNote = undefined
	}
	return profile.testStatus
}

export function createProfileDraft(kind: ResourceKind): AiProfile {
	const base = { id: `${kind}-${Date.now()}`, name: '', description: '', model: '', updatedAt: '剛剛', testStatus: 'untested' as const, testedAt: '尚未測試' }
	if (kind === 'llm') return { ...base, kind, connectionId: 'conn-openai', params: { temperature: 0.2, contextWindow: 128000, maxOutputTokens: 2000 } }
	if (kind === 'embedding') return { ...base, kind, connectionId: 'conn-openai', params: { dimensions: 1536, batchSize: 32 } }
	if (kind === 'reranker') return { ...base, kind, connectionId: 'conn-cohere', params: { topN: 12, timeoutSeconds: 8 } }
	return { ...base, kind, connectionId: 'conn-docling', model: 'Docling', params: { engine: 'docling', ocrLanguage: '繁體中文＋英文', tableStructure: true, imageDpi: 150 } }
}

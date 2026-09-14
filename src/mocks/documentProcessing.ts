import { reactive } from 'vue'
import { documents } from '@/mocks/data'
import { documentChunks, getChunkKey } from '@/mocks/documentChunks'
import { versionFiles } from '@/mocks/documentFiles'
import type { DocumentProcessingFile, DocumentProcessingRecord, DocumentProcessingStep } from '@/types'

// TODO(api-integration): 改由文件處理狀態 API 提供，目前只供前端流程展示。
// > 文件處理紀錄
const processingRecords = reactive<DocumentProcessingRecord[]>([
	{
		documentId: 'doc-001',
		jobId: 'job-doc-001',
		progress: 100,
		uploadedBy: '林怡君',
		uploadedAt: '2026-05-18 09:12',
		startedAt: '2026-05-18 09:12',
		lastUpdatedAt: '2026-05-18 09:15',
		failureReason: null,
		reviewNote: null,
		steps: [
			{ id: 'parse', name: '檔案解析', state: '已完成', detail: '取得 24 頁內容', finishedAt: '09:13', durationLabel: '48 秒', warnings: ['第 18 頁為掃描影像，辨識信心 71%，建議抽查該頁文字。'] },
			{ id: 'chunk', name: '內容切塊', state: '已完成', detail: '產生 68 個內容區塊', finishedAt: '09:14', durationLabel: '12 秒' },
			{ id: 'embed', name: '向量化', state: '已完成', detail: '68 / 68 區塊完成', finishedAt: '09:15', durationLabel: '41 秒' },
			{ id: 'graph', name: '知識圖譜', state: '已完成', detail: '建立 12 個節點關聯', finishedAt: '09:15', durationLabel: '9 秒' },
		],
		files: [
			{ id: 'doc-001-main', name: '員工差旅與費用報支辦法.pdf', role: '主文件', extension: 'pdf', state: '已完成', progress: 100, stage: '品質診斷' },
			{ id: 'doc-001-att-1', name: '國內出差申請單.docx', role: '附件', extension: 'docx', state: '已完成', progress: 100, stage: '品質診斷' },
			{ id: 'doc-001-att-2', name: '住宿費用上限對照表.xlsx', role: '附件', extension: 'xlsx', state: '已完成', progress: 100, stage: '品質診斷' },
		],
	},
	{
		documentId: 'doc-002',
		jobId: 'job-doc-002',
		progress: 100,
		uploadedBy: '張雅雯',
		uploadedAt: '2026-06-02 14:31',
		startedAt: '2026-06-02 14:31',
		lastUpdatedAt: '2026-06-02 14:33',
		failureReason: null,
		reviewNote: null,
		steps: [
			{ id: 'parse', name: '檔案解析', state: '已完成', detail: '取得 9 個章節', finishedAt: '14:31' },
			{ id: 'chunk', name: '內容切塊', state: '已完成', detail: '產生 31 個內容區塊', finishedAt: '14:32' },
			{ id: 'embed', name: '向量化', state: '已完成', detail: '31 / 31 區塊完成', finishedAt: '14:33' },
			{ id: 'graph', name: '知識圖譜', state: '已完成', detail: '建立 8 個節點關聯', finishedAt: '14:33' },
		],
	},
	{
		documentId: 'doc-003',
		jobId: 'job-doc-003',
		progress: 100,
		uploadedBy: '陳柏宇',
		uploadedAt: '2026-08-06 11:02',
		startedAt: '2026-08-06 11:02',
		lastUpdatedAt: '2026-08-07 09:20',
		failureReason: null,
		reviewNote: '調整了客戶資料分級定義，需由資安主管確認後再發布。',
		steps: [
			{ id: 'parse', name: '檔案解析', state: '已完成', detail: '取得 16 頁內容', finishedAt: '11:03' },
			{ id: 'chunk', name: '內容切塊', state: '已完成', detail: '產生 42 個內容區塊', finishedAt: '11:04' },
			{ id: 'embed', name: '向量化', state: '已完成', detail: '42 / 42 區塊完成', finishedAt: '11:05' },
			{ id: 'graph', name: '知識圖譜', state: '已完成', detail: '建立 15 個節點關聯', finishedAt: '11:06' },
		],
		files: [
			{ id: 'doc-003-main', name: 'intranet.example.com/security/customer-data', role: '主文件', extension: 'url', state: '已完成', progress: 100, stage: '品質診斷' },
			{ id: 'doc-003-att-1', name: '資料分級對照表.xlsx', role: '附件', extension: 'xlsx', state: '已完成', progress: 100, stage: '品質診斷' },
			{ id: 'doc-003-att-2', name: '舊版分級說明（掃描）.pdf', role: '附件', extension: 'pdf', state: '失敗', progress: 14, stage: '文字抽取', note: 'OCR 無法辨識：影像解析度過低（72 dpi），請提供 200 dpi 以上的掃描檔。' },
		],
	},
	{
		documentId: 'doc-004',
		jobId: 'job-doc-004',
		progress: 64,
		uploadedBy: '王志明',
		uploadedAt: '2026-08-05 10:18',
		startedAt: '2026-08-05 10:18',
		lastUpdatedAt: '2 分鐘前',
		failureReason: null,
		reviewNote: null,
		steps: [
			{ id: 'parse', name: '檔案解析', state: '已完成', detail: '取得 12 頁內容', finishedAt: '10:19' },
			{ id: 'chunk', name: '內容切塊', state: '已完成', detail: '產生 75 個內容區塊', finishedAt: '10:22' },
			{ id: 'embed', name: '向量化', state: '進行中', detail: '48 / 75 區塊完成', finishedAt: null, durationLabel: '已執行 6 分鐘' },
			{ id: 'graph', name: '知識圖譜', state: '等待中', detail: '等待向量化完成', finishedAt: null },
		],
		files: [
			{ id: 'doc-004-main', name: '採購請款標準作業流程.docx', role: '主文件', extension: 'docx', state: '進行中', progress: 72, stage: '向量化' },
			{ id: 'doc-004-att-1', name: '系統架構圖.pptx', role: '附件', extension: 'pptx', state: '進行中', progress: 35, stage: '切段' },
		],
	},
	{
		documentId: 'doc-006',
		jobId: 'job-doc-006',
		progress: 22,
		uploadedBy: '黃筱雯',
		uploadedAt: '2026-08-31 10:31',
		startedAt: '2026-08-31 10:31',
		lastUpdatedAt: '8 分鐘前',
		failureReason: '檔案受到密碼保護，解析器無法讀取內容。請移除密碼後重新上傳，或改用可讀取的版本。',
		reviewNote: null,
		steps: [
			{ id: 'parse', name: '檔案解析', state: '失敗', detail: '檔案受密碼保護', finishedAt: '10:32' },
			{ id: 'chunk', name: '內容切塊', state: '未執行', detail: '前一步驟失敗', finishedAt: null },
			{ id: 'embed', name: '向量化', state: '未執行', detail: '前一步驟失敗', finishedAt: null },
			{ id: 'graph', name: '知識圖譜', state: '未執行', detail: '前一步驟失敗', finishedAt: null },
		],
	},
	{
		documentId: 'doc-007',
		jobId: 'job-doc-007',
		progress: 0,
		uploadedBy: '蔡宜靜',
		uploadedAt: '2026-08-31 08:37',
		startedAt: '2026-08-31 08:37',
		lastUpdatedAt: '17 分鐘前',
		failureReason: null,
		reviewNote: '已等待 2 小時 12 分鐘，需要確認處理資源是否足夠。',
		steps: [
			{ id: 'parse', name: '檔案解析', state: '等待中', detail: '等待處理資源', finishedAt: null },
			{ id: 'chunk', name: '內容切塊', state: '等待中', detail: '等待解析完成', finishedAt: null },
			{ id: 'embed', name: '向量化', state: '等待中', detail: '等待切塊完成', finishedAt: null },
			{ id: 'graph', name: '知識圖譜', state: '等待中', detail: '等待向量化完成', finishedAt: null },
		],
	},
	{
		documentId: 'doc-008',
		jobId: 'job-doc-008',
		progress: 100,
		uploadedBy: '鄭凱翔',
		uploadedAt: '2024-03-11 16:40',
		startedAt: '2024-03-11 16:40',
		lastUpdatedAt: '2026-02-20 09:05',
		failureReason: null,
		reviewNote: '已由總務新版規範取代，2026-02-20 下架。',
		steps: [
			{ id: 'parse', name: '檔案解析', state: '已完成', detail: '取得 6 頁內容', finishedAt: '16:40' },
			{ id: 'chunk', name: '內容切塊', state: '已完成', detail: '產生 14 個內容區塊', finishedAt: '16:41' },
			{ id: 'embed', name: '向量化', state: '已完成', detail: '14 / 14 區塊完成', finishedAt: '16:41' },
			{ id: 'graph', name: '知識圖譜', state: '已完成', detail: '建立 5 個節點關聯', finishedAt: '16:42' },
		],
	},
])

export type ProcessingStageId = 'parse' | 'chunk' | 'embed' | 'index' | 'graph' | 'summarize' | 'diagnose'

export interface ProcessingStrategyOption {
	id: string
	name: string
	description: string
	/** 是否有可調整的參數，有的話策略設定會出現「參數」入口。 */
	hasOptions?: boolean
	/** 尚未在系統中設定連線或金鑰的策略不可選用。 */
	notConfigured?: boolean
}

export interface ProcessingStage {
	id: ProcessingStageId
	name: string
	description: string
	strategies: ProcessingStrategyOption[]
}

// > 七個處理步驟；步驟代號與策略命名沿用既有系統，方便日後對接。
export const processingStages: ProcessingStage[] = [
	{
		id: 'parse',
		name: '文字抽取',
		description: '從原始檔案抽取純文字與版面結構，是後續所有步驟的輸入。',
		strategies: [
			{ id: 'auto', name: '自動偵測', description: '依副檔名與內容自動挑選解析器。' },
			{ id: 'builtin', name: '內建解析器', description: '純文字與 Office 檔案的預設解析器，速度最快。' },
			{ id: 'ocr', name: 'OCR 優先', description: '掃描檔與圖片型 PDF 先做文字辨識。', hasOptions: true },
			{ id: 'docling', name: 'Docling', description: '保留表格與版面結構的進階解析器。', hasOptions: true, notConfigured: true },
		],
	},
	{
		id: 'chunk',
		name: '切段',
		description: '將全文切成可檢索的段落；可在「原文與切塊」分頁人工調整。',
		strategies: [
			{ id: 'heading_aware', name: '標題感知切段', description: '依標題與段落邊界切分，長段落再依長度上限拆開。', hasOptions: true },
			{ id: 'paragraph', name: '段落切段', description: '以自然段落為單位，適合條列與規範類文件。', hasOptions: true },
			{ id: 'sliding_window', name: '滑動視窗', description: '固定長度加重疊，適合沒有明確結構的長文。', hasOptions: true },
		],
	},
	{
		id: 'embed',
		name: '向量化',
		description: '把每個切塊轉成向量，決定語意搜尋找不找得到這份文件。',
		strategies: [
			{ id: 'default_embed', name: '預設嵌入模型', description: '通用中英文模型，涵蓋大多數內部文件。', hasOptions: true },
			{ id: 'multilingual', name: '多語嵌入模型', description: '文件含多國語言時使用。', hasOptions: true },
			{ id: 'long_context', name: '長文本嵌入模型', description: '單一切塊超過兩千字時保留更完整語意。', hasOptions: true, notConfigured: true },
		],
	},
	{
		id: 'index',
		name: '建索引',
		description: '建立檢索索引，讓關鍵字與語意搜尋都能命中。',
		strategies: [
			{ id: 'hybrid', name: '混合索引', description: '同時建立關鍵字與向量索引，檢索品質最穩定。' },
			{ id: 'vector_only', name: '向量索引', description: '只建立語意索引，寫入速度較快。' },
			{ id: 'keyword_only', name: '全文索引', description: '只建立關鍵字索引，適合法規條號查找。' },
		],
	},
	{
		id: 'graph',
		name: '知識圖譜',
		description: '抽取實體與關係，供知識圖譜與延伸閱讀使用。',
		strategies: [
			{ id: 'entity_relation', name: '實體與關係', description: '抽取人、單位、制度與其關聯。' },
			{ id: 'topic_only', name: '章節與主題', description: '只建立章節與主題節點，成本較低。' },
			{ id: 'graph_off', name: '不建立圖譜', description: '略過這個步驟。' },
		],
	},
	{
		id: 'summarize',
		name: 'AI 摘要',
		description: '產生文件與各章節摘要，顯示在閱讀頁右側。',
		strategies: [
			{ id: 'key_points', name: '重點摘要', description: '整份文件一段摘要加重點條列。', hasOptions: true },
			{ id: 'per_section', name: '逐章摘要', description: '每個章節各產生一段摘要。', hasOptions: true },
			{ id: 'qa_pairs', name: '問答摘要', description: '產生常見問答，適合流程與規範。', hasOptions: true },
		],
	},
	{
		id: 'diagnose',
		name: '品質診斷',
		description: '檢查抽取完整度、切塊品質與引用可追溯性，異常會回報到這裡。',
		strategies: [
			{ id: 'full_check', name: '完整診斷', description: '抽取完整度、切塊品質與引用可追溯性全部檢查。' },
			{ id: 'basic_check', name: '基本完整性', description: '只檢查是否成功抽取文字與切塊。' },
			{ id: 'citation_check', name: '引用與切段檢查', description: '著重引用可追溯性與切段邊界。' },
		],
	},
]

for (const record of processingRecords) {
	const oldSteps = record.steps
	record.steps = processingStages.map((stage) => {
		const existing = oldSteps.find((step) => step.id === stage.id)
		if (existing) return { ...existing, name: stage.name }
		const state = record.progress === 100 ? '已完成' : record.failureReason ? '未執行' : '等待中'
		return { id: stage.id, name: stage.name, state, detail: state === '已完成' ? '示範處理結果已完成' : '等待前序步驟', finishedAt: null }
	})
}

/** 由上傳的主檔與附件建立檔案清單；純文字與網址來源只有主文件。 */
function buildQueuedFiles(documentId: string, version: string): DocumentProcessingFile[] | undefined {
	const files = versionFiles[documentId]?.[version]
	if (!files) return undefined
	const source = files.source
	const mainName = source.type === 'file' ? source.fileName : source.type === 'url' ? source.url : '貼上的文字'
	const mainExtension = source.type === 'file' ? source.extension : source.type
	return [
		{ id: `${documentId}-${version}-main`, name: mainName, role: '主文件', extension: mainExtension, state: '等待中', progress: 0, stage: '等待處理' },
		...files.attachments.map((file, index) => ({
			id: `${documentId}-${version}-att-${index + 1}`, name: file.name, role: '附件' as const,
			extension: file.name.split('.').pop()?.toLowerCase() ?? '', state: '等待中' as const, progress: 0, stage: '等待處理',
		})),
	]
}

export function enqueueDocumentProcessing(documentId: string, version: string, owner: string, strategies: Record<string, string> = {}): void {
	processingRecords.unshift({
		documentId, version, jobId: `mock-${documentId}-${version}-${Date.now()}`, progress: 0,
		uploadedBy: owner, uploadedAt: new Date().toISOString(), startedAt: '', lastUpdatedAt: '剛剛',
		failureReason: null, reviewNote: '前端示範佇列，尚未執行後端處理。',
		steps: processingStages.map((stage) => ({ id: stage.id, name: stage.name, state: '等待中', detail: strategies[stage.id] ? `等待處理 · 策略：${strategies[stage.id]}` : '等待處理', finishedAt: null })),
		files: buildQueuedFiles(documentId, version),
	})
}

export function updateProcessingJob(jobId: string, action: 'retry' | 'cancel'): void {
	if (action === 'retry') {
		reprocessJob(jobId, 'parse', '示範工作已重新排入佇列')
		return
	}
	const record = processingRecords.find((item) => item.jobId === jobId)
	if (!record) return
	record.cancelled = true
	record.progress = 0
	record.failureReason = null
	record.lastUpdatedAt = '剛剛'
	record.reviewNote = '已取消示範工作'
	record.steps = record.steps.map((step) => ({ ...step, state: '未執行', detail: '工作已取消', finishedAt: null, warnings: undefined }))
	record.files = record.files?.map((file) => ({ ...file, state: '未執行', progress: 0, stage: '已取消', note: undefined, steps: undefined }))
}

/** 重新處理的範圍：整份文件、只有主文件，或指定某個附件的代號。 */
export type ReprocessScope = 'all' | 'main' | string

const REUSED_SUFFIX = '（沿用上次結果）'

/** 起始步驟之前已完成的沿用，其餘改為等待；上次沒完成的步驟無法沿用，只能一併重跑。 */
function resetStepsFrom(steps: DocumentProcessingStep[], startIndex: number): DocumentProcessingStep[] {
	return steps.map((step, index) => (index < startIndex && step.state === '已完成'
		? { ...step, detail: step.detail.endsWith(REUSED_SUFFIX) ? step.detail : `${step.detail}${REUSED_SUFFIX}` }
		: { ...step, state: '等待中', detail: '等待重新處理', finishedAt: null, durationLabel: undefined, warnings: undefined }))
}

function getProgress(steps: DocumentProcessingStep[]): number {
	return Math.round((steps.filter((step) => step.state === '已完成').length / steps.length) * 100)
}

function getRecordVersion(record: DocumentProcessingRecord): string | undefined {
	return record.version ?? documents.find((item) => item.id === record.documentId)?.version
}

/** 手動修改的切塊已被重新處理吸收，清掉「待重新處理」標記。 */
function clearEditedChunks(record: DocumentProcessingRecord, fileId?: string): void {
	const key = getChunkKey(record.documentId, getRecordVersion(record) ?? '', fileId)
	if (documentChunks[key]) documentChunks[key].needsReprocessing = false
}

function reprocessAttachment(record: DocumentProcessingRecord, file: DocumentProcessingFile, startIndex: number): void {
	file.steps = resetStepsFrom(file.steps ?? deriveFileSteps(file), startIndex)
	file.state = '等待中'
	file.progress = getProgress(file.steps)
	file.stage = '等待重新處理'
	file.note = undefined
	clearEditedChunks(record, file.id)
}

/**
 * 從指定步驟開始重新處理；起始步驟之前已完成的結果沿用，之後的步驟全部重跑。
 * @param scope 'all' 整份文件（主文件＋全部附件）、'main' 只有主文件，或附件代號只跑那個附件。
 * @param note 顯示在紀錄上的說明，未提供時自動產生。
 */
export function reprocessJob(jobId: string, fromStageId: ProcessingStageId, note?: string, scope: ReprocessScope = 'all'): void {
	const record = processingRecords.find((item) => item.jobId === jobId)
	if (!record) return
	const startIndex = Math.max(0, processingStages.findIndex((stage) => stage.id === fromStageId))
	const startName = processingStages[startIndex]?.name ?? ''
	record.lastUpdatedAt = '剛剛'

	const attachment = record.files?.find((file) => file.id === scope && file.role === '附件')
	if (attachment) {
		reprocessAttachment(record, attachment, startIndex)
		return
	}

	record.cancelled = false
	record.failureReason = null
	record.reviewNote = note ?? (startIndex === 0 ? '已排入重新處理，所有步驟重跑。' : `已排入重新處理，從「${startName}」開始；前面步驟沿用上次結果。`)
	record.steps = resetStepsFrom(record.steps, startIndex)
	record.progress = getProgress(record.steps)
	clearEditedChunks(record)
	for (const file of record.files ?? []) {
		if (file.role === '主文件') {
			Object.assign(file, { state: '等待中', progress: record.progress, stage: '等待重新處理', note: undefined })
		} else if (scope === 'all') {
			reprocessAttachment(record, file, startIndex)
		}
	}
}

/** 只重新處理單一附件，從它失敗（或尚未完成）的步驟開始，不動主文件與其他附件。 */
export function retryProcessingFile(jobId: string, fileId: string): void {
	const record = processingRecords.find((item) => item.jobId === jobId)
	const file = record?.files?.find((item) => item.id === fileId)
	if (!record || !file) return
	const steps = file.steps ?? deriveFileSteps(file)
	const startIndex = Math.max(0, steps.findIndex((step) => step.state !== '已完成'))
	reprocessJob(jobId, processingStages[startIndex]!.id, undefined, fileId)
}

function findVersionRecord(documentId: string, version: string): DocumentProcessingRecord | undefined {
	return processingRecords.find((item) => item.documentId === documentId && (item.version ?? documents.find((document) => document.id === documentId)?.version) === version)
}

/** 補上傳附件時，把附件加進該版本的處理工作；主文件不受影響。 */
export function enqueueAttachmentProcessing(documentId: string, version: string, fileNames: string[], mainFileName: string): void {
	const record = findVersionRecord(documentId, version)
	if (!record || !fileNames.length) return
	// @ 舊紀錄沒有檔案清單，代表只有主文件；主文件狀態沿用整份工作的進度
	const mainState = record.progress === 100 ? '已完成' as const : record.failureReason ? '失敗' as const : '進行中' as const
	const existing = record.files ?? [{
		id: `${documentId}-${version}-main`, name: mainFileName, role: '主文件' as const, extension: mainFileName.split('.').pop()?.toLowerCase() ?? '',
		state: mainState, progress: record.progress, stage: record.steps.find((step) => step.state !== '已完成')?.name ?? '品質診斷',
	}]
	const offset = existing.filter((file) => file.role === '附件').length
	record.files = [
		...existing,
		...fileNames.map((name, index) => ({
			id: `${documentId}-${version}-att-${Date.now()}-${offset + index + 1}`, name, role: '附件' as const,
			extension: name.split('.').pop()?.toLowerCase() ?? '', state: '等待中' as const, progress: 0, stage: '等待處理',
		})),
	]
	record.lastUpdatedAt = '剛剛'
}

/** 刪除附件時一併移除它的處理項目，避免處理頁殘留已不存在的附件。 */
export function removeProcessingFile(documentId: string, version: string, fileName: string): void {
	const record = findVersionRecord(documentId, version)
	if (!record?.files) return
	const index = record.files.findIndex((file) => file.role === '附件' && file.name === fileName)
	if (index >= 0) record.files.splice(index, 1)
}

/**
 * 由附件的目前狀態推出它的步驟清單：目前步驟之前都已完成，目前步驟是附件狀態，之後依是否失敗決定未執行或等待。
 * TODO(api-integration): 後端應直接回傳每個檔案的步驟紀錄，這裡只是示範資料的推導。
 */
function deriveFileSteps(file: DocumentProcessingFile): DocumentProcessingStep[] {
	const currentIndex = processingStages.findIndex((stage) => stage.name === file.stage)
	return processingStages.map((stage, index) => {
		if (file.state === '已完成' || (currentIndex >= 0 && index < currentIndex)) {
			return { id: stage.id, name: stage.name, state: '已完成', detail: '示範處理結果已完成', finishedAt: null }
		}
		if (index === currentIndex) {
			return { id: stage.id, name: stage.name, state: file.state, detail: file.note ?? (file.state === '進行中' ? `進度 ${file.progress}%` : '等待處理'), finishedAt: null }
		}
		const blocked = file.state === '失敗' || file.state === '未執行'
		return { id: stage.id, name: stage.name, state: blocked ? '未執行' : '等待中', detail: blocked ? '前一步驟失敗' : '等待前序步驟', finishedAt: null }
	})
}

function cloneProcessingRecord(record: DocumentProcessingRecord): DocumentProcessingRecord {
	const version = record.version ?? documents.find((item) => item.id === record.documentId)?.version
	const changed = documentChunks[getChunkKey(record.documentId, version ?? '')]?.needsReprocessing
	const cloned: DocumentProcessingRecord = {
		...record, version,
		progress: changed ? Math.min(record.progress, 29) : record.progress,
		steps: record.steps.map((step, index) => changed && index >= 2
			? { ...step, state: '等待中', detail: '切塊已修改，待重新處理', finishedAt: null }
			: { ...step, warnings: step.warnings ? [...step.warnings] : undefined }),
	}
	// @ 主文件的步驟就是整份工作的步驟（含切塊修改後的待重跑狀態），附件用自己的步驟
	cloned.files = record.files?.map((file) => {
		if (file.role === '主文件') return { ...file, steps: cloned.steps.map((step) => ({ ...step })) }
		// @ 附件切塊被人工修改時，只有該附件的下游步驟需要重跑
		const edited = documentChunks[getChunkKey(record.documentId, version ?? '', file.id)]?.needsReprocessing
		const steps = (file.steps ?? deriveFileSteps(file)).map((step, index) => (edited && index >= 2
			? { ...step, state: '等待中' as const, detail: '切塊已修改，待重新處理', finishedAt: null }
			: { ...step }))
		return { ...file, steps }
	})
	return cloned
}

/** 判斷這份文件的切塊是否被人工修改過、尚未重新處理。 */
export function hasEditedChunks(documentId: string, version?: string, fileId?: string): boolean {
	const resolvedVersion = version ?? documents.find((item) => item.id === documentId)?.version ?? ''
	return Boolean(documentChunks[getChunkKey(documentId, resolvedVersion, fileId)]?.needsReprocessing)
}

/** 取得指定文件的處理紀錄；沒有紀錄時回傳 undefined。 */
export function getDocumentProcessingRecord(documentId: string, version?: string): DocumentProcessingRecord | undefined {
	const record = processingRecords.find((item) => item.documentId === documentId && (!version || (item.version ?? documents.find((document) => document.id === documentId)?.version) === version))
	return record ? cloneProcessingRecord(record) : undefined
}

/** 取得全部文件處理紀錄快照。 */
export function getDocumentProcessingRecords(): DocumentProcessingRecord[] {
	return processingRecords.map(cloneProcessingRecord)
}

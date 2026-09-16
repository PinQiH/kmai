// > 回饋與問題（後台）的工作階段資料
// @ 員工在問答頁按倒讚、在帳號頁回報問題時會寫進這裡，重新整理後回到預設資料
// TODO(api-integration): 整組改由後端提供；案件、指派、處理紀錄、檢索快照與診斷線索都應是伺服器狀態，並檢查知識管理員權限
import { reactive } from 'vue'

import { workspaceDocuments } from '@/mocks/documentWorkspace'
import { CURRENT_NOTIFICATION_USER_ID, notificationUsers } from '@/mocks/notifications'
import { pinia } from '@/stores'
import { useNotificationsStore } from '@/stores/notifications'
import type { AnswerModelId, AnswerStyleId, AnswerTrace, Citation } from '@/types'
import { getAnswerModelLabel, getAnswerStyleLabel } from '@/utils/answerSettings'

export type FeedbackKind = 'answer' | 'issue'
export type FeedbackStatus = 'new' | 'investigating' | 'resolved' | 'dismissed'
export type FeedbackCause = 'outdated-document' | 'missing-content' | 'retrieval-miss' | 'answer-error' | 'access' | 'product-bug' | 'not-an-issue'
export type SignalTone = 'error' | 'warning' | 'info'

export interface FeedbackReporter {
	/** 對應通知收件人；外部匯入或已離職帳號可能沒有 */
	userId?: string
	name: string
	email: string
	department?: string
}

export interface FeedbackEvent {
	id: string
	at: string
	actor: string
	text: string
}

export interface FeedbackAttachment {
	id: string
	name: string
	type: string
	size: number
	/** Mock 使用 object URL 或 data URI；正式環境應為具時效的下載網址 */
	url: string
}

/** 使用者提問當下的問答設定 */
export interface AnswerRunSettings {
	sourceId: string
	sourceName: string
	/** 限定文件；空陣列代表整個來源 */
	documentIds: string[]
	documentNames: string[]
	answerStyleId: AnswerStyleId
	answerModelId: AnswerModelId
	webSearchEnabled: boolean
}

export interface RetrievalHit {
	documentId: string
	title: string
	section: string
	score: number
	/** 重新排序後是否被採用為引用 */
	kept?: boolean
}

export interface RetrievalStep {
	id: 'query' | 'semantic' | 'keyword' | 'graph' | 'rerank' | 'generate'
	label: string
	method: string
	elapsedMs: number
	summary: string
	params: Array<{ label: string; value: string }>
	hits?: RetrievalHit[]
}

/** 單次回答的完整執行快照，後端應在回答時依 requestId 保存 */
export interface AnswerRun {
	requestId: string
	settings: AnswerRunSettings
	citationThreshold: number
	totalMs: number
	steps: RetrievalStep[]
}

export interface FeedbackCase {
	id: string
	kind: FeedbackKind
	status: FeedbackStatus
	/** AI 回答回饋是使用者的提問；問題回報是標題 */
	title: string
	/** 倒讚原因或問題描述，使用者原話 */
	detail: string
	/** 問題回報的分類 */
	category?: string
	reporter: FeedbackReporter
	submittedAt: string
	answer?: string
	citations?: Citation[]
	conversationId?: string
	run?: AnswerRun
	attachments: FeedbackAttachment[]
	assignee?: string
	cause?: FeedbackCause
	resolution?: string
	closedAt?: string
	events: FeedbackEvent[]
}

export interface FeedbackSignal {
	id: string
	tone: SignalTone
	text: string
	documentId?: string
}

export const FEEDBACK_KIND_LABELS: Record<FeedbackKind, string> = {
	answer: 'AI 回答',
	issue: '問題回報',
}

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
	new: '未處理',
	investigating: '處理中',
	resolved: '已解決',
	dismissed: '不處理',
}

export const FEEDBACK_CAUSE_LABELS: Record<FeedbackCause, string> = {
	'outdated-document': '文件內容過時',
	'missing-content': '知識庫缺少內容',
	'retrieval-miss': '檢索沒找到正確段落',
	'answer-error': '回答整理錯誤',
	access: '權限設定',
	'product-bug': '系統功能問題',
	'not-an-issue': '非問題（使用說明或需求）',
}

// TODO(api-integration): 操作者取自登入身分，處理人清單取自具「回饋處理」權限的帳號
export const CURRENT_HANDLER = notificationUsers.find((user) => user.id === CURRENT_NOTIFICATION_USER_ID)!.name
export const FEEDBACK_HANDLERS = notificationUsers
	.filter((user) => user.id === CURRENT_NOTIFICATION_USER_ID || user.role !== 'user')
	.map((user) => ({ id: user.id, name: user.name }))
/** 超過這個天數仍未結案，就列為逾期 */
export const OVERDUE_DAYS = 3
export const RESOLUTION_MAX_LENGTH = 500

const DAY_MS = 86_400_000
const LOW_CONFIDENCE = 0.7
const FEEDBACK_ROUTE = '/admin/feedback'

function ago(days: number, hours = 0): string {
	return new Date(Date.now() - days * DAY_MS - hours * 3_600_000).toISOString()
}

function event(at: string, actor: string, text: string): FeedbackEvent {
	return { id: crypto.randomUUID(), at, actor, text }
}

interface RunSeed {
	requestId: string
	settings: AnswerRunSettings
	rewritten: string
	route: string
	semantic: RetrievalHit[]
	keyword: RetrievalHit[]
	graph: string
	rerank: RetrievalHit[]
	outputTokens: number
}

// - 以固定樣板組出六個步驟；正式資料由後端 trace 直接提供
function buildRun(seed: RunSeed): AnswerRun {
	const threshold = 0.72
	const kept = seed.rerank.filter((hit) => hit.kept)
	const steps: RetrievalStep[] = [
		{ id: 'query', label: '問題理解', method: '規則判斷＋查詢改寫', elapsedMs: 180, summary: `改寫為「${seed.rewritten}」`, params: [{ label: '問題路由', value: seed.route }, { label: '改寫後查詢', value: seed.rewritten }] },
		{ id: 'semantic', label: '語意檢索', method: 'bge-m3 向量檢索', elapsedMs: 320, summary: `取回 ${seed.semantic.length} 段`, params: [{ label: '候選數', value: '20' }, { label: '權重', value: '60%' }], hits: seed.semantic },
		{ id: 'keyword', label: '關鍵字檢索', method: 'BM25', elapsedMs: 90, summary: seed.keyword.length ? `取回 ${seed.keyword.length} 段` : '沒有命中', params: [{ label: '候選數', value: '20' }, { label: '權重', value: '40%' }], hits: seed.keyword },
		{ id: 'graph', label: '圖譜擴充', method: '實體展開 2 層', elapsedMs: 140, summary: seed.graph, params: [{ label: '展開層數', value: '2' }] },
		{ id: 'rerank', label: '重新排序', method: 'bge-reranker-v2-m3', elapsedMs: 410, summary: `${seed.rerank.length} 段候選，${kept.length} 段達門檻被採用`, params: [{ label: '引用門檻', value: `${Math.round(threshold * 100)}%` }, { label: '最多引用', value: '6 筆' }], hits: seed.rerank },
		{ id: 'generate', label: '生成回答', method: getAnswerModelLabel(seed.settings.answerModelId), elapsedMs: 1650, summary: `依 ${kept.length} 段引用產生回答`, params: [{ label: '回答風格', value: getAnswerStyleLabel(seed.settings.answerStyleId) }, { label: '輸出 tokens', value: String(seed.outputTokens) }] },
	]
	return { requestId: seed.requestId, settings: seed.settings, citationThreshold: threshold, totalMs: steps.reduce((sum, step) => sum + step.elapsedMs, 0), steps }
}

function settings(sourceId: string, sourceName: string, overrides: Partial<AnswerRunSettings> = {}): AnswerRunSettings {
	return { sourceId, sourceName, documentIds: [], documentNames: [], answerStyleId: 'balanced', answerModelId: 'gpt-4.1-mini', webSearchEnabled: false, ...overrides }
}

// @ 假資料：示意截圖，正式環境為使用者上傳的圖片
const MOBILE_PREVIEW_SCREENSHOT = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640" viewBox="0 0 360 640"><rect width="360" height="640" fill="#f5f4f0"/><rect width="360" height="56" fill="#315c91"/><text x="20" y="35" font-size="16" fill="#fff" font-family="sans-serif">文件預覽</text><rect x="16" y="80" width="328" height="520" rx="8" fill="#fff" stroke="#d7d5ce"/><g font-family="sans-serif" fill="#202428"><text x="32" y="116" font-size="13">附表二 海外住宿費用</text><text x="32" y="150" font-size="6">地區　　每晚上限　　備註</text><text x="32" y="166" font-size="6">日本　　4,500　　　含稅</text><text x="32" y="182" font-size="6">韓國　　4,500　　　含稅</text><text x="32" y="198" font-size="6">美國　　6,000　　　不含早餐</text></g><circle cx="180" cy="420" r="34" fill="none" stroke="#b42318" stroke-width="3"/><text x="96" y="480" font-size="12" fill="#b42318" font-family="sans-serif">雙指縮放沒有反應</text></svg>')}`

const seedCases: FeedbackCase[] = [
	{
		id: 'fb-1049',
		kind: 'answer',
		status: 'new',
		title: '門禁卡遺失要怎麼補辦？',
		detail: '回答說要填紙本申請單交給總務，可是現在都改在系統上申請了。',
		reporter: { userId: 'user-sales', name: '蔡佳穎', email: 'chiaying.tsai@company.com', department: '業務部' },
		submittedAt: ago(0, 4),
		answer: '門禁卡遺失時，請填寫「門禁卡補發申請單」紙本，經主管簽核後交至總務課，補發工本費新臺幣 200 元，約 3 個工作天可領取。',
		citations: [{ id: 'fb-1049-c1', documentId: 'doc-008', title: '辦公室門禁作業規範（2024 版）', section: '第五條 遺失與補發', excerpt: '門禁卡遺失者應填寫補發申請單，經主管簽核後送總務課辦理。', confidence: 0.88 }],
		conversationId: 'conversation-access-017',
		run: buildRun({
			requestId: 'req-qa-a41f20',
			settings: settings('policy', '公司制度'),
			rewritten: '門禁卡 遺失 補發 申請流程',
			route: '單一主題（公司制度）',
			semantic: [
				{ documentId: 'doc-008', title: '辦公室門禁作業規範（2024 版）', section: '第五條 遺失與補發', score: 0.86 },
				{ documentId: 'doc-004', title: '採購請款標準作業流程', section: '三、申請單填寫', score: 0.41 },
			],
			keyword: [{ documentId: 'doc-008', title: '辦公室門禁作業規範（2024 版）', section: '第五條 遺失與補發', score: 0.79 }],
			graph: '命中實體「門禁卡」，只連到已下架文件',
			rerank: [
				{ documentId: 'doc-008', title: '辦公室門禁作業規範（2024 版）', section: '第五條 遺失與補發', score: 0.88, kept: true },
				{ documentId: 'doc-004', title: '採購請款標準作業流程', section: '三、申請單填寫', score: 0.22, kept: false },
			],
			outputTokens: 96,
		}),
		attachments: [],
		events: [],
	},
	{
		id: 'fb-1050',
		kind: 'answer',
		status: 'new',
		title: '客戶資料可以用個人雲端硬碟分享給外包廠商嗎？',
		detail: '回答說主管同意就可以，但資安課程說一律禁止用個人雲端，兩邊說法不一樣。',
		reporter: { userId: 'user-hr', name: '吳承翰', email: 'chenghan.wu@company.com', department: '人力資源部' },
		submittedAt: ago(1, 6),
		answer: '若有業務需要，經直屬主管書面同意後，可將客戶資料分享給簽有保密協議的外包廠商。建議使用加密壓縮並設定密碼。',
		citations: [{ id: 'fb-1050-c1', documentId: 'doc-003', title: '客戶資料存取與分享規範', section: '第二章 對外分享', excerpt: '對外分享客戶資料須經權責主管同意，並確認對方已簽署保密協議。', confidence: 0.74 }],
		conversationId: 'conversation-security-004',
		run: buildRun({
			requestId: 'req-qa-b7c311',
			settings: settings('information-security', '資訊安全', { answerStyleId: 'concise' }),
			rewritten: '客戶資料 個人雲端 外包廠商 分享 規定',
			route: '單一主題（資訊安全）',
			semantic: [
				{ documentId: 'doc-003', title: '客戶資料存取與分享規範', section: '第二章 對外分享', score: 0.71 },
				{ documentId: 'doc-006', title: '資訊安全教育訓練教材', section: '單元四 雲端服務使用', score: 0.69 },
			],
			keyword: [{ documentId: 'doc-006', title: '資訊安全教育訓練教材', section: '單元四 雲端服務使用', score: 0.66 }],
			graph: '命中實體「個人雲端」「保密協議」，擴充 3 段',
			rerank: [
				{ documentId: 'doc-003', title: '客戶資料存取與分享規範', section: '第二章 對外分享', score: 0.74, kept: true },
				{ documentId: 'doc-006', title: '資訊安全教育訓練教材', section: '單元四 雲端服務使用', score: 0.68, kept: false },
			],
			outputTokens: 71,
		}),
		attachments: [],
		events: [],
	},
	{
		id: 'fb-1047',
		kind: 'answer',
		status: 'new',
		title: '新進人員要怎麼申請筆電？',
		detail: '回答說找不到相關資料，但到職指南裡明明有設備申請的段落。',
		reporter: { name: '張家豪', email: 'jh.chang@company.com', department: '研發一部' },
		submittedAt: ago(1, 2),
		answer: '目前知識庫中沒有找到新進人員筆電申請的相關規定。建議洽詢資訊部或你的直屬主管。',
		citations: [],
		conversationId: 'conversation-onboarding-011',
		run: buildRun({
			requestId: 'req-qa-c90e57',
			settings: settings('benefits', '人事流程', { webSearchEnabled: true }),
			rewritten: '新進人員 筆電 申請',
			route: '單一主題（人事流程）',
			semantic: [{ documentId: 'doc-002', title: '新進同仁到職指南', section: '第一週 設備與帳號', score: 0.63 }],
			keyword: [],
			graph: '沒有命中實體（圖譜中只有「電腦設備」）',
			rerank: [{ documentId: 'doc-002', title: '新進同仁到職指南', section: '第一週 設備與帳號', score: 0.58, kept: false }],
			outputTokens: 44,
		}),
		attachments: [],
		events: [],
	},
	{
		id: 'fb-1042',
		kind: 'answer',
		status: 'investigating',
		title: '海外出差的住宿上限是多少？',
		detail: '回答寫日本每晚 4,500 元，財務 9 月公告已經調成 5,500 元了，引用的是舊規定。',
		reporter: { userId: 'user-finance', name: '黃雅婷', email: 'yating.huang@company.com', department: '財務部' },
		submittedAt: ago(5, 3),
		answer: '依差旅辦法，海外出差住宿費依地區分級：日本、韓國每晚上限新臺幣 4,500 元；歐美地區每晚上限新臺幣 6,000 元。',
		citations: [{ id: 'fb-1042-c1', documentId: 'doc-001', title: '員工差旅與費用報支辦法', section: '附表二 海外住宿費用', excerpt: '日本、韓國地區每晚住宿上限新臺幣 4,500 元。', confidence: 0.91 }],
		conversationId: 'conversation-travel-008',
		run: buildRun({
			requestId: 'req-qa-d12a09',
			settings: settings('policy', '公司制度', { documentIds: ['doc-001'], documentNames: ['員工差旅與費用報支辦法'] }),
			rewritten: '海外出差 住宿費 上限 日本',
			route: '單一主題（限定 1 份文件）',
			semantic: [{ documentId: 'doc-001', title: '員工差旅與費用報支辦法', section: '附表二 海外住宿費用', score: 0.9 }],
			keyword: [{ documentId: 'doc-001', title: '員工差旅與費用報支辦法', section: '附表二 海外住宿費用', score: 0.84 }],
			graph: '限定文件時不做圖譜擴充',
			rerank: [{ documentId: 'doc-001', title: '員工差旅與費用報支辦法', section: '附表二 海外住宿費用', score: 0.91, kept: true }],
			outputTokens: 88,
		}),
		attachments: [],
		assignee: '林怡君',
		events: [
			event(ago(4, 20), '林怡君', '指派給 林怡君'),
			event(ago(4, 20), '林怡君', '開始處理'),
			event(ago(3, 1), '林怡君', '已向財務部索取 9 月公告，等待對方提供新版附表。'),
		],
	},
	{
		id: 'is-0824',
		kind: 'issue',
		status: 'new',
		title: '差旅費用明細表附件下載失敗',
		detail: '在「員工差旅與費用報支辦法」按附件的下載，出現「檔案不存在」。換 Chrome 和 Edge 都一樣。',
		category: '文件內容',
		reporter: { userId: 'user-finance', name: '黃雅婷', email: 'yating.huang@company.com', department: '財務部' },
		submittedAt: ago(0, 1),
		attachments: [],
		events: [],
	},
	{
		id: 'is-0821',
		kind: 'issue',
		status: 'investigating',
		title: '手機上文件預覽無法放大',
		detail: '用 iPhone Safari 開文件預覽，雙指縮放沒有反應，表格字太小看不清楚。',
		category: '其他',
		reporter: { userId: CURRENT_NOTIFICATION_USER_ID, name: '王小明', email: 'employee@company.com', department: '產品企劃部' },
		submittedAt: ago(4, 5),
		attachments: [{ id: 'is-0821-a1', name: 'iphone-preview.png', type: 'image/svg+xml', size: 48_213, url: MOBILE_PREVIEW_SCREENSHOT }],
		assignee: '陳志豪',
		events: [
			event(ago(3, 22), '陳志豪', '指派給 陳志豪'),
			event(ago(3, 22), '陳志豪', '開始處理'),
			event(ago(2, 4), '陳志豪', 'iOS 17 可重現，Android 正常，已轉給前端排入修正。'),
		],
	},
	{
		id: 'fb-1031',
		kind: 'answer',
		status: 'resolved',
		title: '國內出差住宿費用上限是多少？',
		detail: '回答還是 2,400 元，新版已經改成 3,000 元。',
		reporter: { userId: CURRENT_NOTIFICATION_USER_ID, name: '王小明', email: 'employee@company.com', department: '產品企劃部' },
		submittedAt: ago(12, 2),
		answer: '國內出差住宿每晚上限新臺幣 2,400 元。',
		citations: [{ id: 'fb-1031-c1', documentId: 'doc-001', title: '員工差旅與費用報支辦法', section: '第三章 住宿費用', excerpt: '國內住宿每晚以新臺幣 2,400 元為原則。', confidence: 0.93 }],
		conversationId: 'conversation-travel-001',
		run: buildRun({
			requestId: 'req-qa-e55b72',
			settings: settings('company', '全公司知識'),
			rewritten: '國內出差 住宿費 上限',
			route: '單一主題（公司制度）',
			semantic: [{ documentId: 'doc-001', title: '員工差旅與費用報支辦法', section: '第三章 住宿費用', score: 0.92 }],
			keyword: [{ documentId: 'doc-001', title: '員工差旅與費用報支辦法', section: '第三章 住宿費用', score: 0.88 }],
			graph: '命中實體「住宿費」，擴充 1 段',
			rerank: [{ documentId: 'doc-001', title: '員工差旅與費用報支辦法', section: '第三章 住宿費用', score: 0.93, kept: true }],
			outputTokens: 32,
		}),
		attachments: [],
		assignee: '林怡君',
		cause: 'outdated-document',
		resolution: '已上傳差旅辦法 3.2 版並完成處理，重新提問後回答為 3,000 元。',
		closedAt: ago(2, 0),
		events: [
			event(ago(11, 20), '林怡君', '指派給 林怡君'),
			event(ago(11, 20), '林怡君', '開始處理'),
			event(ago(2, 0), '林怡君', '標記為已解決（文件內容過時）'),
		],
	},
	{
		id: 'is-0810',
		kind: 'issue',
		status: 'dismissed',
		title: '希望搜尋能支援注音輸入',
		detail: '打注音的時候還沒選字就開始搜尋，結果都是亂碼。',
		category: '搜尋結果',
		reporter: { userId: 'user-sales', name: '蔡佳穎', email: 'chiaying.tsai@company.com', department: '業務部' },
		submittedAt: ago(15, 0),
		attachments: [],
		assignee: '陳志豪',
		cause: 'product-bug',
		resolution: '與 IS-0802 重複，已在 0.1.0 版修正選字期間不觸發搜尋。',
		closedAt: ago(14, 2),
		events: [
			event(ago(14, 2), '陳志豪', '標記為不處理（系統功能問題）'),
		],
	},
]

export const feedbackAdminState = reactive({
	cases: seedCases,
	nextAnswerNumber: 1051,
	nextIssueNumber: 825,
})

export function getCase(id: string): FeedbackCase | undefined {
	return feedbackAdminState.cases.find((item) => item.id === id)
}

export function isOpen(item: FeedbackCase): boolean {
	return item.status === 'new' || item.status === 'investigating'
}

export function getOpenCases(): FeedbackCase[] {
	return feedbackAdminState.cases.filter(isOpen)
}

export function ageInDays(iso: string, now = Date.now()): number {
	return Math.floor((now - new Date(iso).getTime()) / DAY_MS)
}

export function isOverdue(item: FeedbackCase, now = Date.now()): boolean {
	return isOpen(item) && ageInDays(item.submittedAt, now) >= OVERDUE_DAYS
}

/** 案件牽涉的文件：引用到的文件 */
export function getCaseDocumentIds(item: FeedbackCase): string[] {
	return [...new Set((item.citations ?? []).map((citation) => citation.documentId))]
}

/**
 * 由引用、檢索快照與文件目前狀態推出的診斷線索，幫處理人判斷先查哪裡。
 * TODO(api-integration): 改由後端在建立案件時計算並於文件狀態變動時重算，前端只負責顯示
 * @param item 案件。
 * @returns 依嚴重度排序的線索。
 */
export function getCaseSignals(item: FeedbackCase): FeedbackSignal[] {
	if (item.kind !== 'answer') return []
	const signals: FeedbackSignal[] = []
	const citations = item.citations ?? []
	if (!citations.length) {
		signals.push({ id: 'no-citation', tone: 'warning', text: '回答沒有引用任何文件：可能是知識庫缺內容，或檢索沒找到相關段落。' })
	}
	for (const documentId of getCaseDocumentIds(item)) {
		const document = workspaceDocuments.find((doc) => doc.id === documentId)
		if (!document) {
			signals.push({ id: `deleted-${documentId}`, tone: 'error', text: '引用的文件已被刪除。', documentId })
		} else if (document.status === '已下架') {
			signals.push({ id: `retired-${documentId}`, tone: 'error', text: `引用了已下架的「${document.title}」，回答可能依據舊規定。`, documentId })
		} else if (document.status === '待審核' || document.status === '處理中') {
			signals.push({ id: `pending-${documentId}`, tone: 'info', text: `「${document.title}」有版本${document.status}，新內容還沒有生效。`, documentId })
		}
		const others = getOpenCases().filter((other) => other.id !== item.id && getCaseDocumentIds(other).includes(documentId)).length
		if (others && document) signals.push({ id: `repeat-${documentId}`, tone: 'warning', text: `另有 ${others} 筆未結案回饋也引用「${document.title}」。`, documentId })
	}
	const best = Math.max(0, ...citations.map((citation) => citation.confidence))
	if (citations.length && best < LOW_CONFIDENCE) {
		signals.push({ id: 'low-confidence', tone: 'warning', text: `最高引用相關度只有 ${Math.round(best * 100)}%，回答依據偏弱。` })
	}
	// @ 檢索有找到、卻在重新排序被門檻擋掉，是「明明有寫卻說找不到」最常見的原因
	const run = item.run
	const dropped = run?.steps.find((step) => step.id === 'rerank')?.hits?.filter((hit) => !hit.kept && hit.score >= 0.5) ?? []
	for (const hit of dropped.slice(0, 2)) {
		signals.push({ id: `dropped-${hit.documentId}`, tone: 'warning', text: `檢索有找到「${hit.title}」${hit.section}，但重新排序分數 ${Math.round(hit.score * 100)}% 低於引用門檻 ${Math.round(run!.citationThreshold * 100)}%，沒有被採用。`, documentId: hit.documentId })
	}
	if (run?.steps.find((step) => step.id === 'keyword')?.hits?.length === 0) {
		signals.push({ id: 'keyword-miss', tone: 'info', text: '關鍵字檢索沒有命中，使用者的用詞可能和文件不同，可考慮補同義詞。' })
	}
	const order: Record<SignalTone, number> = { error: 0, warning: 1, info: 2 }
	return signals.sort((a, b) => order[a.tone] - order[b.tone])
}

export interface DocumentFeedbackSummary {
	documentId: string
	title: string
	version: string
	status: string
	openCount: number
	closedCount: number
	latestDetail: string
	latestAt: string
}

/** 依引用文件彙整回饋，找出最需要修正的文件 */
export function getDocumentSummaries(): DocumentFeedbackSummary[] {
	const map = new Map<string, DocumentFeedbackSummary>()
	for (const item of feedbackAdminState.cases) {
		for (const documentId of getCaseDocumentIds(item)) {
			const document = workspaceDocuments.find((doc) => doc.id === documentId)
			const summary = map.get(documentId) ?? {
				documentId,
				title: document?.title ?? item.citations?.find((citation) => citation.documentId === documentId)?.title ?? documentId,
				version: document?.version ?? '—',
				status: document?.status ?? '已刪除',
				openCount: 0,
				closedCount: 0,
				latestDetail: '',
				latestAt: '',
			}
			if (isOpen(item)) summary.openCount += 1
			else summary.closedCount += 1
			if (item.submittedAt > summary.latestAt) {
				summary.latestAt = item.submittedAt
				summary.latestDetail = item.detail
			}
			map.set(documentId, summary)
		}
	}
	return [...map.values()].sort((a, b) => b.openCount - a.openCount || b.latestAt.localeCompare(a.latestAt))
}

// > 站內通知（小鈴鐺）
// TODO(api-integration): 通知改由後端在案件狀態變動時發送

function notify(userIds: string[], input: { title: string; body: string; actionTo: string | null; actionLabel: string | null; sourceLabel: string }): void {
	const targets = [...new Set(userIds)].filter(Boolean)
	if (!targets.length) return
	useNotificationsStore(pinia).sendSystemNotification({ ...input, userIds: targets, priority: 'normal' })
}

function handlerIdByName(name: string): string | undefined {
	return FEEDBACK_HANDLERS.find((handler) => handler.name === name)?.id
}

/** 通知標題用的簡短引述；案件沒有編號，改以問題本身指認 */
function quote(title: string): string {
	return title.length > 24 ? `「${title.slice(0, 24)}…」` : `「${title}」`
}

function caseLink(item: FeedbackCase): string {
	return `${FEEDBACK_ROUTE}?case=${item.id}`
}

// > 處理動作；回傳空字串代表成功，否則為可顯示的錯誤訊息

export function assignCase(id: string, assignee: string | null, actor: string): string {
	const item = getCase(id)
	if (!item) return '找不到這筆案件，可能已被刪除。'
	if (!isOpen(item)) return '案件已結案，請先重新開啟再指派。'
	if ((item.assignee ?? null) === assignee) return ''
	if (assignee && !handlerIdByName(assignee)) return '這位處理人沒有回饋處理權限。'
	item.assignee = assignee ?? undefined
	item.events.push(event(new Date().toISOString(), actor, assignee ? `指派給 ${assignee}` : '取消指派'))
	if (assignee) {
		notify([handlerIdByName(assignee)!], {
			title: `你被指派處理${quote(item.title)}`,
			body: `${actor} 將「${item.title}」指派給你。回報者：${item.reporter.name}。`,
			actionTo: caseLink(item),
			actionLabel: '查看案件',
			sourceLabel: '回饋與問題',
		})
	}
	return ''
}

export function startCase(id: string, actor: string): string {
	const item = getCase(id)
	if (!item) return '找不到這筆案件，可能已被刪除。'
	if (item.status !== 'new') return '只有未處理的案件可以開始處理。'
	if (!item.assignee) assignCase(id, actor, actor)
	item.status = 'investigating'
	item.events.push(event(new Date().toISOString(), actor, '開始處理'))
	return ''
}

export function addCaseNote(id: string, note: string, actor: string): string {
	const item = getCase(id)
	const text = note.trim()
	if (!item) return '找不到這筆案件，可能已被刪除。'
	if (!text) return '請輸入處理備註。'
	if (text.length > RESOLUTION_MAX_LENGTH) return `備註最多 ${RESOLUTION_MAX_LENGTH} 個字。`
	item.events.push(event(new Date().toISOString(), actor, text))
	return ''
}

export function closeCase(id: string, status: 'resolved' | 'dismissed', cause: FeedbackCause | null, resolution: string, actor: string): string {
	const item = getCase(id)
	const text = resolution.trim()
	if (!item) return '找不到這筆案件，可能已被刪除。'
	if (!isOpen(item)) return '案件已結案。'
	if (!cause) return '請選擇問題原因，之後才能統計哪類問題最常發生。'
	if (!text) return status === 'resolved' ? '請說明做了哪些修正，這段文字會通知回報者。' : '請說明不處理的理由，這段文字會通知回報者。'
	if (text.length > RESOLUTION_MAX_LENGTH) return `說明最多 ${RESOLUTION_MAX_LENGTH} 個字。`
	const now = new Date().toISOString()
	item.status = status
	item.cause = cause
	item.resolution = text
	item.closedAt = now
	if (!item.assignee) item.assignee = actor
	item.events.push(event(now, actor, `標記為${FEEDBACK_STATUS_LABELS[status]}（${FEEDBACK_CAUSE_LABELS[cause]}）`))
	if (item.reporter.userId) {
		notify([item.reporter.userId], {
			title: status === 'resolved' ? `你回報的問題已處理：${item.title}` : `你回報的問題已審閱：${item.title}`,
			body: text,
			actionTo: item.kind === 'answer' ? '/ask' : null,
			actionLabel: item.kind === 'answer' ? '重新提問' : null,
			sourceLabel: '回饋與問題',
		})
		item.events.push(event(now, '系統', `已通知回報者 ${item.reporter.name}`))
	}
	return ''
}

export function reopenCase(id: string, reason: string, actor: string): string {
	const item = getCase(id)
	const text = reason.trim()
	if (!item) return '找不到這筆案件，可能已被刪除。'
	if (isOpen(item)) return ''
	if (!text) return '請說明重新開啟的原因。'
	item.status = 'investigating'
	item.closedAt = undefined
	item.events.push(event(new Date().toISOString(), actor, `重新開啟：${text}`))
	if (item.assignee && item.assignee !== actor) {
		notify([handlerIdByName(item.assignee) ?? ''], { title: `${quote(item.title)}已重新開啟`, body: `${actor}：${text}`, actionTo: caseLink(item), actionLabel: '查看案件', sourceLabel: '回饋與問題' })
	}
	return ''
}

// > 員工端送出的回饋

function notifyHandlersOfNewCase(item: FeedbackCase): void {
	const handlerIds = notificationUsers.filter((user) => user.role === 'knowledge-admin').map((user) => user.id)
	notify(handlerIds.filter((userId) => userId !== item.reporter.userId), {
		title: `新的${FEEDBACK_KIND_LABELS[item.kind]}待處理`,
		body: `${item.reporter.name}：${item.detail}`,
		actionTo: caseLink(item),
		actionLabel: '查看案件',
		sourceLabel: '回饋與問題',
	})
}

/**
 * 以問答頁的 trace 與引用組出執行快照。
 * TODO(api-integration): 後端應在回答當下以 requestId 保存完整 trace，倒讚時只需帶 requestId
 */
export function buildRunFromTrace(input: { trace?: AnswerTrace; citations: Citation[]; settings: AnswerRunSettings; question: string }): AnswerRun {
	const hits = input.citations.map((citation) => ({ documentId: citation.documentId, title: citation.title, section: citation.section, score: citation.confidence }))
	const run = buildRun({
		requestId: `req-qa-${crypto.randomUUID().slice(0, 6)}`,
		settings: input.settings,
		rewritten: input.question,
		route: input.settings.documentNames.length ? `單一主題（限定 ${input.settings.documentNames.length} 份文件）` : `單一主題（${input.settings.sourceName}）`,
		semantic: hits,
		keyword: hits.slice(0, 1),
		graph: `擴充 ${Math.min(hits.length, 2)} 段`,
		rerank: hits.map((hit) => ({ ...hit, kept: hit.score >= 0.72 })),
		outputTokens: 120,
	})
	for (const stage of input.trace?.stages ?? []) {
		const step = run.steps.find((item) => (stage.id === 'parse' && item.id === 'query') || (stage.id === 'retrieve' && item.id === 'semantic') || (stage.id === 'generate' && item.id === 'generate'))
		if (step) step.elapsedMs = stage.elapsedMs
	}
	if (input.trace) run.totalMs = input.trace.elapsedMs
	return run
}

export function reportAnswerFeedback(payload: { question: string; answer: string; reason: string; citations: Citation[]; conversationId?: string; run?: AnswerRun; reporter: FeedbackReporter }): FeedbackCase {
	const number = feedbackAdminState.nextAnswerNumber++
	const item: FeedbackCase = {
		id: `fb-${number}`,
		kind: 'answer',
		status: 'new',
		title: payload.question,
		detail: payload.reason,
		reporter: { ...payload.reporter },
		submittedAt: new Date().toISOString(),
		answer: payload.answer,
		citations: payload.citations.map((citation) => ({ ...citation })),
		conversationId: payload.conversationId,
		run: payload.run,
		attachments: [],
		events: [],
	}
	feedbackAdminState.cases.unshift(item)
	notifyHandlersOfNewCase(item)
	return item
}

export function reportIssue(payload: { category: string; title: string; description: string; attachments?: FeedbackAttachment[]; reporter: FeedbackReporter }): FeedbackCase {
	const number = feedbackAdminState.nextIssueNumber++
	const item: FeedbackCase = {
		id: `is-${String(number).padStart(4, '0')}`,
		kind: 'issue',
		status: 'new',
		title: payload.title.trim(),
		detail: payload.description.trim(),
		category: payload.category,
		reporter: { ...payload.reporter },
		submittedAt: new Date().toISOString(),
		attachments: [...(payload.attachments ?? [])],
		events: [],
	}
	feedbackAdminState.cases.unshift(item)
	notifyHandlersOfNewCase(item)
	return item
}

export function formatAge(iso: string, now = Date.now()): string {
	const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000)
	if (minutes < 1) return '剛剛'
	if (minutes < 60) return `${minutes} 分鐘前`
	if (minutes < 1440) return `${Math.floor(minutes / 60)} 小時前`
	return `${Math.floor(minutes / 1440)} 天前`
}

export function formatDateTime(iso: string): string {
	const date = new Date(iso)
	const pad = (value: number) => String(value).padStart(2, '0')
	return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatFileSize(bytes: number): string {
	return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

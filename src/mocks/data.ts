import type { ActivityItem, AnswerTrace, Citation, ConversationMessage, ConversationSummary, DocumentVersionEntry, HealthMetric, KnowledgeDocument } from '@/types'

// TODO(api-integration): 串接文件查詢 API 後移除此 Mock 資料。
export const documents: KnowledgeDocument[] = [
	{
		id: 'doc-001',
		knowledgeSourceId: 'policy',
		source: {
			type: 'file',
			fileName: '員工差旅與費用報支辦法.pdf',
			mimeType: 'application/pdf',
			extension: 'pdf',
		},
		title: '員工差旅與費用報支辦法',
		summary: '說明國內外出差申請、交通與住宿標準，以及費用核銷所需文件。',
		department: '財務部',
		category: '公司制度',
		tags: ['差旅', '報支', '費用'],
		updatedAt: '2026-08-12',
		version: '3.2',
		status: '已發布',
		visibility: '全公司',
		owner: '林怡君',
	},
	{
		id: 'doc-002',
		knowledgeSourceId: 'benefits',
		source: {
			type: 'text',
			format: 'markdown',
			content: '# 新進同仁到職指南\n\n## 第一週任務\n\n- 啟用公司帳號\n- 完成設備點交\n- 參加入職與資訊安全訓練\n\n> 若任務無法如期完成，請主動與直屬主管確認。',
		},
		title: '新進同仁到職指南',
		summary: '從帳號申請、設備領用到前三十天任務的完整到職流程。',
		department: '人力資源部',
		category: '人事流程',
		tags: ['到職', '新人', '帳號'],
		updatedAt: '2026-08-09',
		version: '2.0',
		status: '已發布',
		visibility: '全公司',
		owner: '張雅雯',
	},
	{
		id: 'doc-003',
		knowledgeSourceId: 'information-security',
		source: {
			type: 'url',
			url: 'https://intranet.example.com/security/customer-data',
			domain: 'intranet.example.com',
			capturedAt: '2026-08-07T15:30:00+08:00',
			snapshot: '內部資安入口網站的客戶資料分級、權限申請與對外分享規範快照。',
		},
		title: '客戶資料存取與分享規範',
		summary: '定義客戶資料的分級、存取授權、對外分享與異常回報流程。',
		department: '資訊安全部',
		category: '資訊安全',
		tags: ['客戶資料', '資安', '權限'],
		updatedAt: '2026-08-07',
		version: '4.1',
		status: '待審核',
		visibility: '指定群組',
		owner: '陳柏宇',
	},
	{
		id: 'doc-004',
		knowledgeSourceId: 'operations',
		source: {
			type: 'file',
			fileName: '採購請款標準作業流程.docx',
			mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			extension: 'docx',
		},
		title: '採購請款標準作業流程',
		summary: '整理需求提出、比價、簽核、驗收與請款各階段的負責人與文件。',
		department: '採購部',
		category: '作業流程',
		tags: ['採購', '簽核', '請款'],
		updatedAt: '2026-08-05',
		version: '1.8',
		status: '處理中',
		visibility: '全公司',
		owner: '王志明',
	},
	{
		id: 'doc-005',
		knowledgeSourceId: 'benefits',
		source: {
			type: 'url',
			url: 'https://intranet.example.com/hr/performance-faq',
			domain: 'intranet.example.com',
			capturedAt: '2026-07-30T10:15:00+08:00',
			snapshot: '人力資源入口網站的績效目標設定、期中檢視、評等與申覆常見問題快照。',
		},
		title: '年度績效評核常見問題',
		summary: '彙整績效目標設定、期中檢視、評等與申覆流程的常見問題。',
		department: '人力資源部',
		category: '常見問題',
		tags: ['績效', '評核', '目標'],
		updatedAt: '2026-07-30',
		version: '2.3',
		status: '已發布',
		visibility: '全公司',
		owner: '張雅雯',
	},
]

export const documentVersionHistoryById: Record<string, DocumentVersionEntry[]> = Object.fromEntries(
	documents.map((document, documentIndex) => [
		document.id,
		[
			{
				version: document.version,
				date: document.updatedAt,
				author: document.owner,
				summary: document.summary,
				changes: documentIndex % 2 === 0
					? ['更新主要內容與作業說明', '補充適用範圍與注意事項']
					: ['調整文件結構與閱讀順序', '更新相關規範與附件資訊'],
				isCurrent: true,
			},
			{
				version: documentIndex === 0 ? '3.1' : documentIndex === 1 ? '1.5' : documentIndex === 2 ? '4.0' : documentIndex === 3 ? '1.7' : '2.2',
				date: documentIndex === 0 ? '2026-02-03' : documentIndex === 1 ? '2025-12-18' : documentIndex === 2 ? '2026-04-22' : documentIndex === 3 ? '2026-03-14' : '2026-01-10',
				author: document.owner,
				summary: '依據使用回饋調整內容，讓操作步驟與規範更清楚。',
				changes: ['修正文句與名詞用法', '補充常見情境範例'],
			},
			{
				version: documentIndex === 0 ? '3.0' : documentIndex === 1 ? '1.0' : documentIndex === 2 ? '3.5' : documentIndex === 3 ? '1.0' : '2.0',
				date: documentIndex === 0 ? '2025-10-16' : documentIndex === 1 ? '2025-07-08' : documentIndex === 2 ? '2025-11-30' : documentIndex === 3 ? '2025-09-02' : '2025-08-21',
				author: document.owner,
				summary: '建立文件基準版本，整理當時適用的流程與參考資料。',
				changes: ['建立初始內容架構', '加入必要附件與參考來源'],
			},
		],
	]),
)

export const citations: Citation[] = [
	{
		id: 'cite-1',
		chunkId: 'doc-001-chunk-0042',
		documentId: 'doc-001',
		title: '員工差旅與費用報支辦法',
		section: '4.2 住宿費用',
		excerpt: '國內住宿每晚以新台幣 3,000 元為原則；特殊地區或旺季應於出差申請中事先說明。',
		confidence: 0.94,
	},
	{
		id: 'cite-2',
		chunkId: 'doc-001-chunk-0061',
		documentId: 'doc-001',
		title: '員工差旅與費用報支辦法',
		section: '6.1 核銷期限',
		excerpt: '出差結束後十個工作天內，應完成費用報支並檢附有效憑證。',
		confidence: 0.91,
	},
]

const onboardingCitation: Citation = {
	id: 'cite-onboarding-first-week',
	chunkId: 'doc-002-chunk-0018',
	documentId: 'doc-002',
	title: '新進同仁到職指南',
	section: '二、第一週任務（資訊安全訓練）',
	excerpt: '完成公司帳號啟用、設備點交與到職會談；資訊安全訓練應於到職後五個工作天內完成，紀錄同步至新人報到清單。',
	confidence: 0.93,
}

const travelVersionAccommodationCitation: Citation = {
	id: 'cite-travel-version-accommodation',
	chunkId: 'doc-001-chunk-0073',
	documentId: 'doc-001',
	title: '員工差旅與費用報支辦法',
	section: '3.2 版修訂摘要',
	excerpt: '3.2 版將國內住宿每晚原則上限調整為新台幣 3,000 元。',
	confidence: 0.96,
}

const travelVersionReimbursementCitation: Citation = {
	id: 'cite-travel-version-reimbursement',
	chunkId: 'doc-001-chunk-0074',
	documentId: 'doc-001',
	title: '員工差旅與費用報支辦法',
	section: '3.2 版修訂摘要',
	excerpt: '3.2 版將核銷期限調整為出差結束後十個工作天，並新增旺季例外申請欄位。',
	confidence: 0.95,
}

const customerDataCitation: Citation = {
	id: 'cite-customer-data-access',
	chunkId: 'doc-003-chunk-0024',
	documentId: 'doc-003',
	title: '客戶資料存取與分享規範',
	section: '二、存取與分享',
	excerpt: '客戶資料應依分級提出權限申請；對外分享前須確認接收者、使用目的與保存期限。',
	confidence: 0.92,
}

const procurementCitation: Citation = {
	id: 'cite-procurement-attachments',
	chunkId: 'doc-004-chunk-0031',
	documentId: 'doc-004',
	title: '採購請款標準作業流程',
	section: '五、請款附件',
	excerpt: '請款時應檢附驗收單、發票或收據，以及完成簽核的採購申請單。',
	confidence: 0.95,
}

const performanceAppealCitation: Citation = {
	id: 'cite-performance-appeal',
	chunkId: 'doc-005-chunk-0029',
	documentId: 'doc-005',
	title: '年度績效評核常見問題',
	section: '三、評等與申覆',
	excerpt: '評等公布後十個工作天內可向人力資源部提出申覆，逾期不再受理。',
	confidence: 0.9,
}

// TODO(api-integration): 串接歷史對話 API 後移除此 Mock 資料。
export const conversationHistory: ConversationSummary[] = [
	{
		id: 'conv-001',
		title: '國內出差住宿費用上限是多少？',
		updatedAt: '2026-08-17T10:42:00',
		messageCount: 2,
		previewAnswer: '依目前有效的差旅辦法，國內住宿每晚原則上限為新台幣 3,000 元。',
		isPinned: true,
		isArchived: false,
	},
	{
		id: 'conv-002',
		title: '新進同仁第一週要完成哪些事情？',
		updatedAt: '2026-08-16T15:08:00',
		messageCount: 4,
		previewAnswer: '新進同仁第一週應完成公司帳號啟用、設備點交、資訊安全訓練及主管安排的到職會談。',
		isPinned: false,
		isArchived: false,
	},
	{
		id: 'conv-003',
		title: '如何申請客戶資料存取權限？',
		updatedAt: '2026-08-14T09:20:00',
		messageCount: 2,
		previewAnswer: '客戶資料需依分級申請存取權限，對外分享前必須確認接收者、用途與保存期限。',
		isPinned: false,
		isArchived: false,
	},
	{
		id: 'conv-004',
		title: '比較差旅辦法 3.1 與 3.2 版差異',
		updatedAt: '2026-08-13T16:26:00',
		messageCount: 6,
		previewAnswer: '3.2 版調整了國內住宿上限與核銷期限，並新增旺季例外的申請欄位。',
		isPinned: true,
		isArchived: false,
	},
	{
		id: 'conv-005',
		title: '採購請款需要哪些附件？',
		updatedAt: '2026-08-11T11:03:00',
		messageCount: 2,
		previewAnswer: '請款需檢附驗收單、發票或收據，以及完成簽核的採購申請單。',
		isPinned: false,
		isArchived: true,
	},
	{
		id: 'conv-006',
		title: '年度績效申覆的時間限制',
		updatedAt: '2026-08-08T14:47:00',
		messageCount: 3,
		previewAnswer: '評等公布後十個工作天內可提出申覆，逾期不再受理。',
		isPinned: false,
		isArchived: true,
	},
]

type MockConversationMessage = Pick<ConversationMessage, 'role' | 'content' | 'citations'>

function createHistoryTrace(messageCitations: Citation[]): AnswerTrace {
	return {
		documentCount: new Set(messageCitations.map((citation) => citation.documentId)).size,
		citationCount: messageCitations.length,
		retrievedCount: 1284,
		elapsedMs: 1780,
		stages: [
			{ id: 'parse', label: '解析問題', detail: '拆解語意、時間範圍與適用對象', status: 'done', elapsedMs: 220 },
			{ id: 'retrieve', label: '檢索知識庫', detail: '從可搜尋文件中找出相關內容', status: 'done', elapsedMs: 760 },
			{ id: 'compare', label: '比對版本', detail: '確認生效版本與適用範圍', status: 'done', elapsedMs: 420 },
			{ id: 'generate', label: '生成回答', detail: '整理內容並標註引用來源', status: 'done', elapsedMs: 380 },
		],
	}
}

function createHistoryMessages({
	conversationId,
	updatedAt,
	messages,
}: {
	conversationId: string
	updatedAt: string
	messages: MockConversationMessage[]
}): ConversationMessage[] {
	return messages.map(({ citations: messageCitations = [], ...message }, index) => {
		const clonedCitations = messageCitations.map((citation) => ({ ...citation }))
		return {
			...message,
			id: `${conversationId}-message-${index + 1}`,
			createdAt: updatedAt,
			...(message.role === 'assistant'
				? {
					citations: clonedCitations,
					trace: createHistoryTrace(clonedCitations),
				}
				: {}),
		}
	})
}

// TODO(api-integration): 串接歷史對話 API 後，改由後端依對話 ID 取回完整訊息。
export const conversationMessagesById: Record<string, ConversationMessage[]> = {
	'conv-001': createHistoryMessages({
		conversationId: 'conv-001',
		updatedAt: '2026-08-17T10:42:00',
		messages: [
			{ role: 'user', content: '國內出差住宿費用上限是多少？' },
			{ role: 'assistant', content: '依目前有效的差旅辦法，國內住宿每晚原則上限為新台幣 3,000 元 [1]。', citations: [citations[0]] },
		],
	}),
	'conv-002': createHistoryMessages({
		conversationId: 'conv-002',
		updatedAt: '2026-08-16T15:08:00',
		messages: [
			{ role: 'user', content: '新進同仁第一週要完成哪些事情？' },
			{ role: 'assistant', content: '新進同仁第一週應完成公司帳號啟用、設備點交、資訊安全訓練及主管安排的到職會談 [1]。', citations: [onboardingCitation] },
			{ role: 'user', content: '資訊安全訓練需要在第幾天前完成？' },
			{ role: 'assistant', content: '請在到職後五個工作天內完成，完成紀錄會同步到新人報到清單 [1]。', citations: [onboardingCitation] },
		],
	}),
	'conv-003': createHistoryMessages({
		conversationId: 'conv-003',
		updatedAt: '2026-08-14T09:20:00',
		messages: [
			{ role: 'user', content: '如何申請客戶資料存取權限？' },
			{ role: 'assistant', content: '客戶資料需依分級申請存取權限，對外分享前必須確認接收者、用途與保存期限 [1]。', citations: [customerDataCitation] },
		],
	}),
	'conv-004': createHistoryMessages({
		conversationId: 'conv-004',
		updatedAt: '2026-08-13T16:26:00',
		messages: [
			{ role: 'user', content: '比較差旅辦法 3.1 與 3.2 版差異' },
			{ role: 'assistant', content: '3.2 版調整了國內住宿上限 [1] 與核銷期限 [2]，並新增旺季例外的申請欄位。', citations: [travelVersionAccommodationCitation, travelVersionReimbursementCitation] },
			{ role: 'user', content: '住宿上限調整成多少？' },
			{ role: 'assistant', content: '國內住宿每晚原則上限調整為新台幣 3,000 元 [1]。', citations: [travelVersionAccommodationCitation] },
			{ role: 'user', content: '核銷期限也有變更嗎？' },
			{ role: 'assistant', content: '有，3.2 版要求在出差結束後十個工作天內完成核銷 [1]。', citations: [travelVersionReimbursementCitation] },
		],
	}),
	'conv-005': createHistoryMessages({
		conversationId: 'conv-005',
		updatedAt: '2026-08-11T11:03:00',
		messages: [
			{ role: 'user', content: '採購請款需要哪些附件？' },
			{ role: 'assistant', content: '請款需檢附驗收單、發票或收據，以及完成簽核的採購申請單 [1]。', citations: [procurementCitation] },
		],
	}),
	'conv-006': createHistoryMessages({
		conversationId: 'conv-006',
		updatedAt: '2026-08-08T14:47:00',
		messages: [
			{ role: 'user', content: '年度績效申覆的時間限制' },
			{ role: 'assistant', content: '評等公布後十個工作天內可提出申覆，逾期不再受理 [1]。', citations: [performanceAppealCitation] },
			{ role: 'user', content: '申覆需要由主管提出嗎？' },
		],
	}),
}

export const healthMetrics: HealthMetric[] = [
	{ label: '可搜尋文件', value: '1,284', detail: '近 7 天新增 36 份', status: 'good' },
	{ label: '待審核', value: '12', detail: '3 份已等待超過 2 天', status: 'warning' },
	{ label: '處理成功率', value: '97.8%', detail: '過去 24 小時', status: 'good' },
	{ label: '需處理回饋', value: '8', detail: '2 筆標記為高優先', status: 'warning' },
]

export const recentActivities: ActivityItem[] = [
	{ id: 'a1', title: '差旅辦法更新至 3.2 版', detail: '財務部 · 林怡君', time: '2 小時前', type: 'document' },
	{ id: 'a2', title: '「海外出差住宿上限」回答收到負面回饋', detail: '等待知識管理員審查', time: '4 小時前', type: 'question' },
	{ id: 'a3', title: '批次文件處理完成', detail: '成功 24 份，失敗 1 份', time: '昨天', type: 'system' },
]

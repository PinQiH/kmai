import type { ActivityItem, Citation, ConversationSummary, DocumentVersionEntry, HealthMetric, KnowledgeDocument } from '@/types'

// TODO(api-integration): 串接文件查詢 API 後移除此 Mock 資料。
export const documents: KnowledgeDocument[] = [
	{
		id: 'doc-001',
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
		documentId: 'doc-001',
		title: '員工差旅與費用報支辦法',
		section: '4.2 住宿費用',
		excerpt: '國內住宿每晚以新台幣 3,000 元為原則；特殊地區或旺季應於出差申請中事先說明。',
		confidence: 0.94,
	},
	{
		id: 'cite-2',
		documentId: 'doc-001',
		title: '員工差旅與費用報支辦法',
		section: '6.1 核銷期限',
		excerpt: '出差結束後十個工作天內，應完成費用報支並檢附有效憑證。',
		confidence: 0.91,
	},
]

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

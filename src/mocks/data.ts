import type { ActivityItem, Citation, HealthMetric, KnowledgeDocument } from '@/types'

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

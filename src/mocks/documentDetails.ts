import { documents } from '@/mocks/data'
import { getDocumentContent } from '@/mocks/documentContent'
import { getNeighbors, graphNodes, type GraphNodeType } from '@/mocks/graph'
import type { DocumentContentSection, KnowledgeDocument } from '@/types'

export interface DocumentVersionDetail {
	aiSummary: string
	keyPoints: string[]
	sections: DocumentContentSection[]
}

export interface DocumentKnowledgeTopic {
	id: string
	label: string
	type: GraphNodeType
	relation: string
}

export interface RelatedKnowledgeDocument {
	document: KnowledgeDocument
	relation: string
	sharedTopics: string[]
}

export interface DocumentKnowledgeContext {
	focusNodeId: string
	focusLabel: string
	topics: DocumentKnowledgeTopic[]
	relatedDocuments: RelatedKnowledgeDocument[]
}

type VersionDetailByVersion = Record<string, DocumentVersionDetail>

// TODO(api-integration): 改由版本全文、AI 摘要與知識關聯 API 提供，目前只供前端流程展示。
const versionDetailsByDocumentId: Record<string, VersionDetailByVersion> = {
	'doc-001': {
		'3.2': {
			aiSummary: '現行辦法要求出差前完成主管核准，國內住宿原則上限為每晚新台幣 3,000 元，返程後需在十個工作天內完成核銷。旺季或特殊地區超出標準時，應在申請階段先說明。',
			keyPoints: ['出差前先取得主管核准', '國內住宿原則上限每晚 3,000 元', '返程後十個工作天內完成核銷'],
			sections: getDocumentContent({ documentId: 'doc-001', fallbackSummary: '' }),
		},
		'3.1': {
			aiSummary: '此版本採用每晚新台幣 2,800 元的國內住宿原則上限，核銷期限為返程後七個工作天；超額住宿需另附主管核准紀錄。',
			keyPoints: ['住宿原則上限每晚 2,800 元', '返程後七個工作天內核銷', '超額費用需另附核准紀錄'],
			sections: [
				{ id: 'purpose-and-scope', heading: '一、目的與適用範圍', body: '本辦法規範正式員工與約聘人員因公出差時的申請、費用標準與核銷程序。' },
				{ id: 'travel-expenses', heading: '二、申請與費用', body: '出差前應完成紙本或線上申請並取得主管核准。國內住宿每晚以新台幣 2,800 元為原則，超額時需另附主管核准紀錄。' },
				{ id: 'reimbursement-deadline', heading: '三、核銷期限', body: '出差結束後七個工作天內完成費用報支，並檢附交通、住宿與其他有效憑證。' },
			],
		},
		'3.0': {
			aiSummary: '基準版本將出差申請、住宿費與核銷憑證集中規範。國內住宿原則上限為每晚新台幣 2,500 元，核銷採七個工作天期限。',
			keyPoints: ['紙本申請須在出發前三天送出', '住宿原則上限每晚 2,500 元', '核銷需檢附紙本憑證'],
			sections: [
				{ id: 'purpose-and-scope', heading: '一、目的與適用範圍', body: '本辦法建立員工因公出差的申請與費用核銷基準，適用於正式員工。' },
				{ id: 'travel-expenses', heading: '二、申請與費用', body: '出差申請應於出發前三個工作天以紙本送交主管核准。國內住宿每晚以新台幣 2,500 元為原則。' },
				{ id: 'reimbursement-deadline', heading: '三、核銷期限', body: '返程後七個工作天內填寫費用報支單，並檢附紙本正本憑證送交財務部。' },
			],
		},
	},
	'doc-002': {
		'2.0': {
			aiSummary: '新版到職流程把帳號、設備、資安訓練與前三十天目標整合成單一清單。資訊安全訓練需在到職後五個工作天內完成。',
			keyPoints: ['到職前由人資啟動帳號與設備準備', '五個工作天內完成資安訓練', '前三十天與主管確認工作目標'],
			sections: [
				{ id: 'pre-arrival', heading: '一、到職前準備', body: '人力資源部會建立人員資料並通知資訊部門準備帳號與設備。直屬主管應指定到職協助人。' },
				{ id: 'first-week', heading: '二、第一週任務', body: '完成公司帳號啟用、設備點交與到職會談；資訊安全訓練應於到職後五個工作天內完成，紀錄同步至新人報到清單。' },
				{ id: 'first-thirty-days', heading: '三、前三十天', body: '與主管確認工作目標、認識主要協作窗口，並完成職務所需的基礎課程。' },
			],
		},
		'1.5': {
			aiSummary: '此版本已包含帳號、設備與到職會談，但資安訓練期限仍為十個工作天，前三十天目標由各部門自行追蹤。',
			keyPoints: ['帳號與設備由人資協調準備', '十個工作天內完成資安訓練', '部門自行維護到職追蹤表'],
			sections: [
				{ id: 'pre-arrival', heading: '一、到職前準備', body: '人力資源部於到職日前通知資訊部門建立帳號，直屬主管負責確認座位與工作設備。' },
				{ id: 'first-week', heading: '二、第一週任務', body: '完成設備點交、部門介紹與到職會談。資訊安全訓練應於到職後十個工作天內完成。' },
				{ id: 'follow-up', heading: '三、後續追蹤', body: '各部門依自己的到職追蹤表安排課程與工作目標，人力資源部於月底彙整完成情形。' },
			],
		},
		'1.0': {
			aiSummary: '初版以行政報到為主，涵蓋人員資料、帳號申請與設備簽收，尚未納入前三十天目標與統一的資安訓練期限。',
			keyPoints: ['報到當日填寫人員資料', '主管個別提出帳號申請', '設備以紙本簽收'],
			sections: [
				{ id: 'registration', heading: '一、行政報到', body: '新進同仁於報到當日向人力資源部繳交人員資料，並完成基本制度說明。' },
				{ id: 'account', heading: '二、帳號申請', body: '直屬主管依職務需求向資訊部門提出帳號與系統權限申請。' },
				{ id: 'equipment', heading: '三、設備領用', body: '資訊部門交付電腦與必要配件，新進同仁應在紙本設備清單上簽收。' },
			],
		},
	},
	'doc-005': {
		'2.3': {
			aiSummary: '現行問答涵蓋目標設定、期中調整、評等面談與申覆。工作內容改變時可在期中檢視同步修正目標，對程序有疑義則依公告期限提出申覆。',
			keyPoints: ['目標需具體且可衡量', '期中檢視可同步調整資源與目標', '評等後應安排面談並保留申覆管道'],
			sections: getDocumentContent({ documentId: 'doc-005', fallbackSummary: '' }),
		},
		'2.2': {
			aiSummary: '此版本說明年度目標、期中檢視與評等流程，並補充常見目標範例；申覆程序仍引用年度公告，未在文件內列出完整步驟。',
			keyPoints: ['年初與主管確認年度目標', '期中檢視聚焦進度與資源', '申覆期限依年度公告'],
			sections: [
				{ id: 'goal-setting', heading: '一、目標設定', body: '年度開始時由員工與主管確認具體、可衡量的工作目標，並記錄預期成果與完成期限。' },
				{ id: 'midyear-review', heading: '二、期中檢視', body: '主管與員工共同確認目前進度與所需資源；必要時可補充目標說明。' },
				{ id: 'rating', heading: '三、評等與溝通', body: '年度評等完成後由主管安排面談。若對程序有疑義，依當年度公告期限提出申覆。' },
			],
		},
		'2.0': {
			aiSummary: '初版常見問題聚焦目標建立與年度評等，期中檢視僅作進度確認，尚未明確說明目標調整與申覆方式。',
			keyPoints: ['年初建立年度目標', '年中確認執行進度', '年底由主管完成評等面談'],
			sections: [
				{ id: 'goal-setting', heading: '一、目標設定', body: '員工應於年度開始時與主管確認主要工作項目、預期成果與完成期限。' },
				{ id: 'progress-review', heading: '二、進度確認', body: '主管於年中確認工作進度，並記錄需要協助的事項。' },
				{ id: 'rating', heading: '三、年度評等', body: '年度結束後由主管依目標達成情形完成評等，並安排結果面談。' },
			],
		},
	},
}

const graphFocusByDocumentId: Record<string, string> = {
	'doc-001': 'n-travel-policy',
	'doc-002': 'n-onboarding',
	'doc-003': 'n-security-policy',
	'doc-004': 'n-payment',
	'doc-005': 'n-review-policy',
}

const relatedDocumentsByDocumentId: Record<string, Array<{ id: string, relation: string, sharedTopics: string[] }>> = {
	'doc-001': [
		{ id: 'doc-005', relation: '兩份文件都涉及主管審核、例外處理與申覆時程。', sharedTopics: ['主管核准', '例外處理'] },
		{ id: 'doc-002', relation: '新進同仁首次出差前，可先確認帳號、設備與公司流程準備。', sharedTopics: ['新進同仁', '流程準備'] },
	],
	'doc-002': [
		{ id: 'doc-005', relation: '從到職前三十天的工作目標，延伸閱讀年度績效設定與檢視。', sharedTopics: ['工作目標', '主管會談'] },
		{ id: 'doc-001', relation: '新進同仁開始執行出差任務前，可銜接申請與費用報支規範。', sharedTopics: ['申請流程', '公司制度'] },
	],
	'doc-005': [
		{ id: 'doc-002', relation: '回看新人到職前三十天如何建立第一階段工作目標。', sharedTopics: ['工作目標', '主管會談'] },
		{ id: 'doc-001', relation: '延伸理解其他需要主管核准與例外說明的公司制度。', sharedTopics: ['主管核准', '例外申請'] },
	],
}

// - 取得指定文件版本的全文與 AI 閱讀輔助
export function getDocumentVersionDetail({
	documentId,
	version,
	versionSummary,
}: {
	documentId: string
	version: string
	versionSummary: string
}): DocumentVersionDetail {
	const detail = versionDetailsByDocumentId[documentId]?.[version]
	if (detail) {
		return {
			...detail,
			keyPoints: [...detail.keyPoints],
			sections: detail.sections.map((section) => ({ ...section })),
		}
	}

	return {
		aiSummary: versionSummary,
		keyPoints: ['此版本已保留完整閱讀內容', '重要操作前請確認版本日期與適用範圍'],
		sections: getDocumentContent({ documentId, fallbackSummary: versionSummary }).map((section) => ({ ...section })),
	}
}

// - 取得文件在知識圖譜中的主題關聯與延伸閱讀
export function getDocumentKnowledgeContext(documentId: string): DocumentKnowledgeContext {
	const sourceDocument = documents.find((document) => document.id === documentId)
	const focusNodeId = graphFocusByDocumentId[documentId] ?? ''
	const focusNode = graphNodes.find((node) => node.id === focusNodeId)
	const topics = focusNode
		? getNeighbors(focusNode.id).slice(0, 4).map(({ node, label }) => ({
			id: node.id,
			label: node.label,
			type: node.type,
			relation: label,
		}))
		: (sourceDocument?.tags ?? []).slice(0, 4).map((tag, index) => ({
			id: `tag-${index}`,
			label: tag,
			type: '專有名詞' as const,
			relation: '文件標籤',
		}))

	const relatedDocuments = (relatedDocumentsByDocumentId[documentId] ?? [])
		.map((relation) => {
			const document = documents.find((item) => item.id === relation.id)
			if (!document || document.status !== '已發布' || document.visibility !== '全公司') return undefined
			return {
				document: { ...document, tags: [...document.tags] },
				relation: relation.relation,
				sharedTopics: [...relation.sharedTopics],
			}
		})
		.filter((relation): relation is RelatedKnowledgeDocument => Boolean(relation))

	return {
		focusNodeId,
		focusLabel: focusNode?.label ?? sourceDocument?.category ?? '文件主題',
		topics,
		relatedDocuments,
	}
}

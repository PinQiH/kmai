import type { DocumentContentSection } from '@/types'

// TODO: 串接文件全文 API 後移除此 Mock 資料。
export const documentContentById: Record<string, DocumentContentSection[]> = {
	'doc-001': [
		{
			id: 'purpose-and-scope',
			heading: '一、目的與適用範圍',
			body: '本辦法說明公司同仁因公出差時的申請、費用標準與核銷流程。所有正式員工與約聘人員均應遵循。',
		},
		{
			id: 'travel-expenses',
			heading: '二、申請與費用',
			body: '出差前應完成申請並取得主管核准。國內住宿每晚以新台幣 3,000 元為原則，特殊情況需事前說明。',
		},
		{
			id: 'reimbursement-deadline',
			heading: '三、核銷期限',
			body: '出差結束後十個工作天內完成費用報支，並檢附有效憑證。',
		},
		{
			id: 'version-3-2-summary',
			heading: '3.2 版修訂摘要',
			body: '3.2 版將國內住宿每晚原則上限調整為新台幣 3,000 元。3.2 版將核銷期限調整為出差結束後十個工作天，並新增旺季例外申請欄位。',
		},
	],
	'doc-002': [
		{
			id: 'pre-arrival',
			heading: '一、到職前準備',
			body: '人力資源部會建立人員資料並通知資訊部門準備帳號與設備。直屬主管應指定到職協助人。',
		},
		{
			id: 'first-week',
			heading: '二、第一週任務',
			body: '完成公司帳號啟用、設備點交、資訊安全訓練與直屬主管安排的到職會談。',
		},
		{
			id: 'first-thirty-days',
			heading: '三、前三十天',
			body: '與主管確認工作目標、認識主要協作窗口，並完成職務所需的基礎課程。',
		},
		{
			id: 'first-week-security-training',
			heading: '二、第一週任務（資訊安全訓練）',
			body: '完成公司帳號啟用、設備點交與到職會談；資訊安全訓練應於到職後五個工作天內完成，紀錄同步至新人報到清單。',
		},
	],
	'doc-005': [
		{
			id: 'goal-setting',
			heading: '一、目標設定',
			body: '年度開始時與主管確認具體、可衡量且與部門方向一致的工作目標。',
		},
		{
			id: 'midyear-review',
			heading: '二、期中檢視',
			body: '期中檢視用於確認進度與調整資源，不是最終評等。若工作內容變更，應同步更新目標。',
		},
		{
			id: 'rating-and-appeal',
			heading: '三、評等與申覆',
			body: '主管完成評等後會安排面談說明。如對程序有疑義，可依公告期限向人力資源部提出申覆。',
		},
	],
}

/**
 * 取得文件全文段落；沒有預覽內容時回傳文件摘要。
 * @param documentId 文件識別碼。
 * @param fallbackSummary 文件摘要。
 * @returns 可供文件頁與引用來源欄共用的全文段落。
 */
export function getDocumentContent({
	documentId,
	fallbackSummary,
}: {
	documentId: string
	fallbackSummary: string
}): DocumentContentSection[] {
	return documentContentById[documentId] ?? [{ id: 'document-summary', heading: '文件摘要', body: fallbackSummary }]
}

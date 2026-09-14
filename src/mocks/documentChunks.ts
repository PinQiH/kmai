import { reactive } from 'vue'
import type { DocumentContentSection } from '@/types'

export const documentChunks = reactive<Record<string, { chunks: DocumentContentSection[]; needsReprocessing: boolean }>>({})

/** 切塊儲存鍵；主文件沿用「文件:版本」，附件再加上檔案代號，避免與主文件互相覆蓋。 */
export function getChunkKey(documentId: string, version: string, fileId?: string): string {
	return fileId ? `${documentId}:${version}:${fileId}` : `${documentId}:${version}`
}

export function saveDocumentChunks(documentId: string, version: string, chunks: DocumentContentSection[], fileId?: string): void {
	if (!chunks.length || chunks.some((chunk) => !chunk.body.trim())) throw new Error('每個切塊都需要內容，至少保留一個切塊。')
	documentChunks[getChunkKey(documentId, version, fileId)] = { chunks: chunks.map((chunk) => ({ ...chunk, body: chunk.body.trim() })), needsReprocessing: true }
}

// TODO(api-integration): 附件的抽取文字與切塊應由處理服務提供，這裡只放示範內容。
const attachmentSamples: Record<string, string[]> = {
	'國內出差申請單.docx': [
		'申請人應於出差前三個工作天填寫本申請單，註明出差事由、地點、起訖日期與預估費用。',
		'申請單須經直屬主管核准；出差天數超過五日或預估費用超過新台幣三萬元者，另需部門主管加簽。',
	],
	'住宿費用上限對照表.xlsx': [
		'台北市、新北市：每晚上限新台幣 3,200 元；桃園市、台中市、高雄市：每晚上限新台幣 2,800 元。',
		'其他縣市：每晚上限新台幣 2,400 元。超過上限的部分需檢附說明，由財務部審核後始得核銷。',
	],
	'資料分級對照表.xlsx': [
		'機密級：客戶個資、合約金額與未公開財務資料，僅限指定人員存取，傳輸必須加密。',
		'內部級：內部流程文件與會議紀錄，限公司同仁存取，不得轉寄外部信箱。',
		'公開級：已對外發布的產品資訊與新聞稿，可自由分享。',
	],
	'系統架構圖.pptx': [
		'採購系統由請購、核准、請款三個子系統組成，透過共用的供應商主檔串接。',
	],
}

/** 取得附件抽取出的文字段落；沒有示範內容時以檔名產生一段佔位文字。 */
export function getAttachmentSections(fileId: string, fileName: string): DocumentContentSection[] {
	const bodies = attachmentSamples[fileName] ?? [`（示範）「${fileName}」抽取出的文字內容，串接處理服務後會顯示實際內容。`]
	return bodies.map((body, index) => ({ id: `${fileId}-section-${index + 1}`, heading: `段落 ${index + 1}`, body }))
}

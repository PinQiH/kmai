import { defineStore } from 'pinia'

import { citations } from '@/mocks/data'
import type { ConversationMessage } from '@/types'

interface ConversationState {
	messages: ConversationMessage[]
	isResponding: boolean
	selectedScope: string
	errorMessage: string
}

function createMockAnswer(question: string, scope: string): ConversationMessage {
	const normalizedQuestion = question.toLowerCase()
	let content = `我在「${scope}」範圍內找到幾份可能相關的資料。這是展示回答；正式環境會依實際檢索結果整理答案並附上對應引用。`
	if (normalizedQuestion.includes('出差') || normalizedQuestion.includes('住宿') || normalizedQuestion.includes('差旅')) {
		content = '依目前有效的差旅辦法，國內住宿每晚原則上限為新台幣 3,000 元。若遇特殊地區或旺季，請在出差申請時事先說明。出差結束後，需在十個工作天內完成核銷並附上有效憑證。'
	} else if (normalizedQuestion.includes('新進') || normalizedQuestion.includes('到職')) {
		content = '新進同仁第一週應完成公司帳號啟用、設備點交、資訊安全訓練及主管安排的到職會談。完整清單請參考《新進同仁到職指南》。'
	} else if (normalizedQuestion.includes('資安') || normalizedQuestion.includes('客戶資料')) {
		content = '客戶資料需依分級申請存取權限，對外分享前必須確認接收者、用途與保存期限。若發現異常存取，請立即通知資訊安全部。'
	}

	return {
		id: crypto.randomUUID(),
		role: 'assistant',
		content,
		createdAt: new Date().toISOString(),
		citations,
	}
}

export const useConversationStore = defineStore('conversation', {
	state: (): ConversationState => ({
		messages: [],
		isResponding: false,
		selectedScope: '自動判斷',
		errorMessage: '',
	}),
	actions: {
		async askQuestion(question: string): Promise<void> {
			const trimmedQuestion = question.trim()
			if (!trimmedQuestion || this.isResponding) return

			this.messages.push({
				id: crypto.randomUUID(),
				role: 'user',
				content: trimmedQuestion,
				createdAt: new Date().toISOString(),
			})
			this.isResponding = true
			this.errorMessage = ''

			try {
				// TODO(api-integration): 改為串接 AI 串流回答 API。
				await new Promise((resolve) => window.setTimeout(resolve, 900))
				this.messages.push(createMockAnswer(trimmedQuestion, this.selectedScope))
			} catch {
				this.errorMessage = '目前無法產生回答，請稍後重新送出問題。'
			} finally {
				this.isResponding = false
			}
		},
		clearConversation(): void {
			this.messages = []
		},
	},
})

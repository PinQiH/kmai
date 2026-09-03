import { defineStore } from 'pinia'

export interface FavoriteAnswer {
	id: string
	conversationId: string
	question: string
	answer: string
	date: string
}

interface FavoritesState {
	items: FavoriteAnswer[]
}

export const useFavoritesStore = defineStore('favorites', {
	state: (): FavoritesState => ({
		items: [
			{ id: 'conv-001-message-2', conversationId: 'conv-001', question: '國內出差住宿費用上限是多少？', answer: '依目前有效的差旅辦法，國內住宿每晚原則上限為新台幣 3,000 元 [1]。', date: '2026-08-17' },
			{ id: 'conv-002-message-2', conversationId: 'conv-002', question: '新進同仁第一週要完成哪些事情？', answer: '新進同仁第一週應完成公司帳號啟用、設備點交、資訊安全訓練及主管安排的到職會談 [1]。', date: '2026-08-16' },
		],
	}),
	actions: {
		toggle(item: FavoriteAnswer): void {
			const existingIndex = this.items.findIndex((favorite) => favorite.id === item.id)
			if (existingIndex >= 0) {
				this.items.splice(existingIndex, 1)
				return
			}
			this.items.unshift(item)
		},
		remove(id: string): void {
			this.items = this.items.filter((item) => item.id !== id)
		},
		isFavorite(id: string): boolean {
			return this.items.some((item) => item.id === id)
		},
	},
})

import { defineStore } from 'pinia'

export interface FavoriteAnswer {
	id: string
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
			{ id: 'f1', question: '國內出差住宿費用上限是多少？', answer: '原則上每晚新台幣 3,000 元；特殊情況需事先說明。', date: '2026-08-12' },
			{ id: 'f2', question: '新進同仁第一週要完成哪些事情？', answer: '完成公司帳號啟用、資安訓練、設備點交與直屬主管安排的到職會談。', date: '2026-08-09' },
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

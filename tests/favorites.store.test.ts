import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useFavoritesStore } from '../src/stores/favorites'

describe('favorites store', () => {
	beforeEach(() => setActivePinia(createPinia()))

	it('should add and remove the same answer through toggle', () => {
		const store = useFavoritesStore()
		const favorite = { id: 'answer-10', question: '測試問題', answer: '測試回答', date: '2026-08-14' }

		store.toggle(favorite)
		expect(store.isFavorite(favorite.id)).toBe(true)

		store.toggle(favorite)
		expect(store.isFavorite(favorite.id)).toBe(false)
	})

	it('should remove favorite by id', () => {
		const store = useFavoritesStore()
		const existingId = store.items[0]?.id

		if (existingId) store.remove(existingId)

		expect(store.items.some((item) => item.id === existingId)).toBe(false)
	})
})

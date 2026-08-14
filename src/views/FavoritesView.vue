<script setup lang="ts">
import { computed, ref } from 'vue'

import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'
import { useFavoritesStore } from '@/stores/favorites'

const search = ref('')
const favoritesStore = useFavoritesStore()

const visibleFavorites = computed(() => favoritesStore.items.filter((item) => `${item.question} ${item.answer}`.includes(search.value)))
</script>

<template>
	<div class="page-shell">
		<PageHeader title="我的收藏" description="保留需要重複查閱的回答，並隨時回到原始對話與引用。" />
		<VTextField v-model="search" label="搜尋收藏的問題或回答" prepend-inner-icon="mdi-magnify" clearable class="mb-6" />
		<StatePanel v-if="visibleFavorites.length === 0" icon="mdi-bookmark-outline" title="目前沒有符合的收藏" description="清除搜尋條件，或在 AI 回答下方按下收藏。" action-label="清除搜尋" @action="search = ''" />
		<div v-else class="d-grid ga-4">
			<VCard v-for="item in visibleFavorites" :key="item.id" class="surface-border pa-5">
				<div class="d-flex align-start ga-4">
					<div>
						<p class="text-caption text-medium-emphasis">收藏於 {{ item.date }}</p>
						<h2 class="section-heading mt-1">{{ item.question }}</h2>
						<p class="text-body-2 text-medium-emphasis mt-3">{{ item.answer }}</p>
					</div>
					<VSpacer />
					<VBtn icon="mdi-bookmark-remove-outline" variant="text" aria-label="取消收藏" @click="favoritesStore.remove(item.id)" />
				</div>
				<VBtn class="mt-4" variant="tonal" size="small" :to="{ path: '/ask', query: { q: item.question } }">重新開啟問題</VBtn>
			</VCard>
		</div>
	</div>
</template>

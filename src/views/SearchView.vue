<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import DocumentCard from '@/components/DocumentCard.vue'
import PageHeader from '@/components/PageHeader.vue'
import SearchInput from '@/components/SearchInput.vue'
import StatePanel from '@/components/StatePanel.vue'
import { searchDocuments } from '@/repositories/knowledge.repository'
import type { KnowledgeDocument } from '@/types'

const route = useRoute()
const router = useRouter()
const query = ref(String(route.query.q ?? ''))
const department = ref('全部部門')
const results = ref<KnowledgeDocument[]>([])
const isLoading = ref(false)
const errorMessage = ref('')
let latestRequestId = 0
const departments = ['全部部門', '財務部', '人力資源部', '資訊安全部', '採購部']

const filteredResults = computed(() => department.value === '全部部門'
	? results.value
	: results.value.filter((document) => document.department === department.value))

async function runSearch(updateUrl = true): Promise<void> {
	const requestId = ++latestRequestId
	isLoading.value = true
	errorMessage.value = ''
	try {
		const nextResults = await searchDocuments(query.value)
		if (requestId !== latestRequestId) return
		results.value = nextResults
		if (updateUrl && String(route.query.q ?? '') !== query.value) {
			await router.replace({ query: query.value ? { q: query.value } : {} })
		}
	} catch {
		if (requestId !== latestRequestId) return
		errorMessage.value = '目前無法載入搜尋結果，請檢查連線後再試一次。'
	} finally {
		if (requestId === latestRequestId) isLoading.value = false
	}
}

async function askWithResults(): Promise<void> {
	await router.push({ path: '/ask', query: { q: query.value } })
}

watch(() => route.query.q, (value, previousValue) => {
	const nextQuery = String(value ?? '')
	if (value === previousValue || nextQuery === query.value) return
	query.value = nextQuery
	void runSearch(false)
})

onMounted(runSearch)
</script>

<template>
	<div class="page-shell">
		<PageHeader title="搜尋公司知識" description="從文件標題、摘要、部門、分類與標籤尋找資料。" />
		<SearchInput v-model="query" :loading="isLoading" @search="runSearch" />

		<div class="search-toolbar my-6">
			<VSelect v-model="department" :items="departments" label="部門" hide-details class="filter-field" />
			<p class="text-body-2 text-medium-emphasis" aria-live="polite">{{ filteredResults.length }} 筆結果</p>
			<VSpacer />
			<VBtn v-if="query" color="primary" variant="tonal" prepend-icon="mdi-message-text-outline" @click="askWithResults">用這些結果詢問 AI</VBtn>
		</div>

		<VRow v-if="isLoading" aria-label="正在載入搜尋結果">
			<VCol v-for="index in 6" :key="index" cols="12" md="6"><VSkeletonLoader type="article" /></VCol>
		</VRow>
		<StatePanel v-else-if="errorMessage" icon="mdi-cloud-alert-outline" title="搜尋暫時無法使用" :description="errorMessage" action-label="重新搜尋" @action="runSearch" />
		<StatePanel v-else-if="filteredResults.length === 0" icon="mdi-file-search-outline" title="找不到符合的內容" description="試著減少關鍵字、改用較常見的說法，或清除部門篩選。" action-label="清除篩選" @action="department = '全部部門'" />
		<VRow v-else>
			<VCol v-for="document in filteredResults" :key="document.id" cols="12" md="6">
				<DocumentCard :document="document" />
			</VCol>
		</VRow>
	</div>
</template>

<style scoped>
.search-toolbar {
	display: flex;
	align-items: center;
	gap: 16px;
}

.filter-field {
	max-width: 220px;
}

@media (max-width: 700px) {
	.search-toolbar {
		align-items: stretch;
		flex-direction: column;
	}

	.filter-field {
		max-width: none;
	}
}
</style>

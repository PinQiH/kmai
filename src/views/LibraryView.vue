<script setup lang="ts">
import { computed, ref } from 'vue'

import DocumentCard from '@/components/DocumentCard.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'
import { getEmployeeDocumentsSnapshot } from '@/repositories/knowledge.repository'

const topics = ['全部', '公司制度', '人事流程', '資訊安全', '作業流程', '常見問題']
const selectedTopic = ref('全部')
const search = ref('')

const documents = getEmployeeDocumentsSnapshot()
const visibleDocuments = computed(() => documents.filter((document) => {
	const matchesTopic = selectedTopic.value === '全部' || document.category === selectedTopic.value
	const matchesSearch = !search.value || `${document.title} ${document.summary}`.includes(search.value)
	return matchesTopic && matchesSearch
}))
</script>

<template>
	<div class="page-shell">
		<PageHeader eyebrow="公司知識" title="知識庫" description="依主題瀏覽經審核並持續維護的公司文件。" />
		<div class="library-toolbar mb-6">
			<VTextField v-model="search" label="搜尋知識庫" prepend-inner-icon="mdi-magnify" hide-details clearable />
			<div class="d-flex flex-wrap ga-2" aria-label="知識主題">
				<VBtn v-for="topic in topics" :key="topic" :variant="selectedTopic === topic ? 'flat' : 'outlined'" :color="selectedTopic === topic ? 'primary' : undefined" size="small" @click="selectedTopic = topic">{{ topic }}</VBtn>
			</div>
		</div>
		<StatePanel v-if="visibleDocuments.length === 0" icon="mdi-bookshelf" title="找不到符合的文件" description="請修改搜尋文字或選擇其他知識主題。" action-label="清除條件" @action="search = ''; selectedTopic = '全部'" />
		<VRow v-else>
			<VCol v-for="document in visibleDocuments" :key="document.id" cols="12" md="6" lg="4">
				<DocumentCard :document="document" />
			</VCol>
		</VRow>
	</div>
</template>

<style scoped>
.library-toolbar {
	display: grid;
	grid-template-columns: minmax(260px, 380px) 1fr;
	align-items: center;
	gap: 20px;
}

@media (max-width: 800px) {
	.library-toolbar {
		grid-template-columns: 1fr;
	}
}
</style>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import DocumentCard from '@/components/DocumentCard.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'
import { getEmployeeDocumentsSnapshot } from '@/repositories/knowledge.repository'
import { useConversationStore } from '@/stores/conversation'
import { COMPANY_KNOWLEDGE_SOURCES } from '@/utils/knowledgeSources'

const router = useRouter()
const route = useRoute()
const conversationStore = useConversationStore()
const knowledgeSources = COMPANY_KNOWLEDGE_SOURCES.filter((source) => source.id !== 'company')
const requestedKnowledgeSourceId = typeof route.query.source === 'string' ? route.query.source : ''
const selectedKnowledgeSourceId = ref(knowledgeSources.some((source) => source.id === requestedKnowledgeSourceId) ? requestedKnowledgeSourceId : 'all')
const search = ref('')

const documents = getEmployeeDocumentsSnapshot()
const selectedKnowledgeSource = computed(() => knowledgeSources.find((source) => source.id === selectedKnowledgeSourceId.value) ?? null)
const visibleDocuments = computed(() => documents.filter((document) => {
	const matchesKnowledgeSource = selectedKnowledgeSourceId.value === 'all' || document.knowledgeSourceId === selectedKnowledgeSourceId.value
	const matchesSearch = !search.value || `${document.title} ${document.summary}`.includes(search.value)
	return matchesKnowledgeSource && matchesSearch
}))

async function askKnowledgeSource(): Promise<void> {
	if (!selectedKnowledgeSource.value) return
	conversationStore.startNewConversation()
	conversationStore.selectKnowledgeSource(selectedKnowledgeSource.value)
	conversationStore.clearSelectedDocuments()
	await router.push('/ask')
}
</script>

<template>
	<div class="page-shell">
		<PageHeader eyebrow="公司知識" title="知識庫" description="選擇知識庫，瀏覽經審核並持續維護的公司文件。">
			<template v-if="selectedKnowledgeSource" #actions>
				<VBtn color="primary" prepend-icon="mdi-message-question-outline" data-testid="ask-knowledge-base" @click="askKnowledgeSource">詢問這個知識庫</VBtn>
			</template>
		</PageHeader>
		<div class="library-toolbar mb-6">
			<VTextField v-model="search" label="搜尋知識庫" prepend-inner-icon="mdi-magnify" hide-details clearable />
			<div class="d-flex flex-wrap ga-2" role="group" aria-label="選擇知識庫">
				<VBtn :variant="selectedKnowledgeSourceId === 'all' ? 'flat' : 'outlined'" :color="selectedKnowledgeSourceId === 'all' ? 'primary' : undefined" size="small" :aria-pressed="selectedKnowledgeSourceId === 'all'" data-testid="library-source-all" @click="selectedKnowledgeSourceId = 'all'">全部</VBtn>
				<VBtn v-for="source in knowledgeSources" :key="source.id" :variant="selectedKnowledgeSourceId === source.id ? 'flat' : 'outlined'" :color="selectedKnowledgeSourceId === source.id ? 'primary' : undefined" size="small" :aria-pressed="selectedKnowledgeSourceId === source.id" :data-testid="`library-source-${source.id}`" @click="selectedKnowledgeSourceId = source.id">{{ source.name }}</VBtn>
			</div>
		</div>
		<StatePanel v-if="visibleDocuments.length === 0" icon="mdi-bookshelf" title="找不到符合的文件" description="請修改搜尋文字或選擇其他知識庫。" action-label="清除條件" @action="search = ''; selectedKnowledgeSourceId = 'all'" />
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

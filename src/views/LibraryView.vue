<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import FilterSearchField from '@/components/FilterSearchField.vue'
import DocumentCard from '@/components/DocumentCard.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'
import type { KnowledgeDocument } from '@/types'
import { useAsyncData } from '@/composables/useAsyncData'
import { fetchEmployeeDocuments } from '@/repositories/knowledge.repository'
import { useConversationStore } from '@/stores/conversation'
import { COMPANY_KNOWLEDGE_SOURCES } from '@/utils/knowledgeSources'
import GraphView from '@/views/GraphView.vue'

type LibraryViewMode = 'documents' | 'graph'

const router = useRouter()
const route = useRoute()
const conversationStore = useConversationStore()
const knowledgeSources = COMPANY_KNOWLEDGE_SOURCES.filter((source) => source.id !== 'company')

function resolveRequestedKnowledgeSourceId(): string {
	const sourceId = typeof route.query.source === 'string' ? route.query.source : ''
	return knowledgeSources.some((source) => source.id === sourceId) ? sourceId : 'all'
}

function resolveRequestedView(sourceId: string): LibraryViewMode {
	return (route.query.view === 'graph' || route.name === 'graph') && sourceId !== 'all'
		? 'graph'
		: 'documents'
}

const selectedKnowledgeSourceId = ref(resolveRequestedKnowledgeSourceId())
const activeView = ref<LibraryViewMode>(resolveRequestedView(selectedKnowledgeSourceId.value))
const search = ref('')

const { data: documents, isLoading, errorMessage, reload } = useAsyncData(fetchEmployeeDocuments, {
	initialValue: [] as KnowledgeDocument[],
	errorMessage: () => '目前無法載入知識庫文件，請稍後再試。',
})
const selectedKnowledgeSource = computed(() => knowledgeSources.find((source) => source.id === selectedKnowledgeSourceId.value) ?? null)
const visibleDocuments = computed(() => documents.value.filter((document) => {
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

function selectKnowledgeSource(sourceId: string): void {
	selectedKnowledgeSourceId.value = sourceId
	if (sourceId === 'all') activeView.value = 'documents'
}

watch(
	() => [route.name, route.query.source, route.query.view],
	() => {
		const sourceId = resolveRequestedKnowledgeSourceId()
		selectedKnowledgeSourceId.value = sourceId
		activeView.value = resolveRequestedView(sourceId)
	},
)
</script>

<template>
	<div class="page-shell">
		<PageHeader eyebrow="公司知識" title="知識庫" description="選擇知識庫，瀏覽經審核並持續維護的公司文件。">
			<template v-if="selectedKnowledgeSource" #actions>
				<VBtn color="primary" prepend-icon="mdi-message-question-outline" data-testid="ask-knowledge-base" @click="askKnowledgeSource">詢問這個知識庫</VBtn>
			</template>
		</PageHeader>
		<div class="library-toolbar mb-4" :class="{ 'is-graph': activeView === 'graph' }">
			<FilterSearchField v-if="activeView === 'documents'" v-model="search" label="搜尋知識庫" />
			<div class="d-flex flex-wrap ga-2" role="group" aria-label="選擇知識庫">
				<VBtn :variant="selectedKnowledgeSourceId === 'all' ? 'flat' : 'outlined'" :color="selectedKnowledgeSourceId === 'all' ? 'primary' : undefined" size="small" :aria-pressed="selectedKnowledgeSourceId === 'all'" data-testid="library-source-all" @click="selectKnowledgeSource('all')">全部</VBtn>
				<VBtn v-for="source in knowledgeSources" :key="source.id" :variant="selectedKnowledgeSourceId === source.id ? 'flat' : 'outlined'" :color="selectedKnowledgeSourceId === source.id ? 'primary' : undefined" size="small" :aria-pressed="selectedKnowledgeSourceId === source.id" :data-testid="`library-source-${source.id}`" @click="selectKnowledgeSource(source.id)">{{ source.name }}</VBtn>
			</div>
		</div>

		<VTabs v-model="activeView" class="library-tabs mb-6" color="primary">
			<VTab value="documents" prepend-icon="mdi-file-document-multiple-outline">文件</VTab>
			<VTab value="graph" prepend-icon="mdi-graph-outline" :disabled="!selectedKnowledgeSource">知識圖譜</VTab>
		</VTabs>

		<template v-if="activeView === 'documents'">
			<StatePanel
				v-if="errorMessage"
				icon="mdi-cloud-alert-outline"
				title="無法載入文件"
				:description="errorMessage"
				action-label="重新載入"
				@action="reload"
			/>
			<VRow v-else-if="isLoading">
				<VCol v-for="placeholder in 6" :key="placeholder" cols="12" md="6" lg="4">
					<VSkeletonLoader type="article" class="surface-border rounded-lg" />
				</VCol>
			</VRow>
			<StatePanel v-else-if="visibleDocuments.length === 0" icon="mdi-bookshelf" title="找不到符合的文件" description="請修改搜尋文字或選擇其他知識庫。" action-label="清除條件" @action="search = ''; selectKnowledgeSource('all')" />
			<VRow v-else>
				<VCol v-for="document in visibleDocuments" :key="document.id" cols="12" md="6" lg="4">
					<DocumentCard :document="document" />
				</VCol>
			</VRow>
		</template>
		<GraphView
			v-else-if="selectedKnowledgeSource"
			:key="selectedKnowledgeSource.id"
			embedded
			:knowledge-source-id="selectedKnowledgeSource.id"
		/>
	</div>
</template>

<style scoped>
.library-toolbar {
	display: grid;
	grid-template-columns: minmax(260px, 380px) 1fr;
	align-items: center;
	gap: 20px;
}

.library-toolbar.is-graph {
	grid-template-columns: 1fr;
}

.library-tabs {
	border-bottom: 1px solid rgb(var(--v-theme-outline));
}

@media (max-width: 800px) {
	.library-toolbar {
		grid-template-columns: 1fr;
	}
}
</style>

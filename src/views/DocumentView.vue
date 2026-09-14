<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import DocumentReadingView from '@/components/DocumentReadingView.vue'
import { getWorkspaceVersions } from '@/mocks/documentWorkspace'
import { downloadFile, versionFiles } from '@/mocks/documentFiles'
import StatePanel from '@/components/StatePanel.vue'
import { getDocumentVersionDetail } from '@/mocks/documentDetails'
import { getDocumentById } from '@/repositories/knowledge.repository'
import { useConversationStore } from '@/stores/conversation'
import type { DocumentVersionEntry, KnowledgeDocument } from '@/types'
import { getCompanyKnowledgeSourceForDocument } from '@/utils/knowledgeSources'

const route = useRoute()
const router = useRouter()
const conversationStore = useConversationStore()
const document = ref<KnowledgeDocument>()
const isLoading = ref(true)
const errorMessage = ref('')
const selectedVersionNumber = ref('')
const documentVersions = computed<DocumentVersionEntry[]>(() => document.value ? getWorkspaceVersions(document.value).filter((entry) => entry.status !== '等待處理') : [])
const selectedVersion = computed(() => (
	documentVersions.value.find((version) => version.version === selectedVersionNumber.value)
	?? documentVersions.value[0]
))
const selectedVersionDetail = computed(() => {
	const currentDocument = document.value
	const version = selectedVersion.value
	if (!currentDocument || !version) return undefined
	return getDocumentVersionDetail({
		documentId: currentDocument.id,
		version: version.version,
		versionSummary: version.summary,
	})
})

async function loadDocument(): Promise<void> {
	isLoading.value = true
	errorMessage.value = ''
	try {
		document.value = await getDocumentById(String(route.params.id))
		if (!document.value) {
			errorMessage.value = '這份文件可能已被移除，或你沒有查看權限。'
			return
		}
		selectedVersionNumber.value = document.value.version
	} catch {
		errorMessage.value = '目前無法載入文件，請稍後再試。'
	} finally {
		isLoading.value = false
	}
}

onMounted(loadDocument)
watch(() => route.params.id, loadDocument)

// @ 上傳檔案的文件只該下載原檔；沒有原檔時不要偷偷改成下載文字，避免與使用者的預期不符。
const canDownloadOriginal = computed(() => Boolean(
	document.value && selectedVersion.value && versionFiles[document.value.id]?.[selectedVersion.value.version]?.file,
))

function downloadDocument(): void {
	const currentDocument = document.value
	const version = selectedVersion.value
	const detail = selectedVersionDetail.value
	if (!currentDocument || !version || !detail) return
	const file = versionFiles[currentDocument.id]?.[version.version]?.file
	if (file) { downloadFile(file, file.name); return }
	const content = detail.sections.map((section) => `${section.heading}\n${section.body}`).join('\n\n')
	const blob = new Blob([`${currentDocument.title}\n第 ${version.version} 版\n\n${content}`], { type: 'text/plain;charset=utf-8' })
	const url = URL.createObjectURL(blob)
	const link = window.document.createElement('a')
	link.href = url
	link.download = `${currentDocument.title}-v${version.version}.txt`
	link.click()
	URL.revokeObjectURL(url)
}

async function askDocument(): Promise<void> {
	const currentDocument = document.value
	if (!currentDocument) return
	const source = getCompanyKnowledgeSourceForDocument(currentDocument)
	if (!source) return
	conversationStore.startNewConversation()
	conversationStore.selectKnowledgeSource(source)
	conversationStore.setSelectedDocuments({
		sourceId: source.id,
		documents: [{ id: currentDocument.id, name: currentDocument.title }],
	})
	await router.push('/ask')
}
</script>

<template>
	<div class="page-shell document-page">
		<VSkeletonLoader v-if="isLoading" type="heading, paragraph, article" />
		<StatePanel v-else-if="errorMessage" icon="mdi-file-alert-outline" title="無法開啟文件" :description="errorMessage" action-label="回到知識庫" @action="router.push('/library')" />
		<template v-else-if="document">
			<VBreadcrumbs :items="[{ title: '知識庫', to: '/library' }, { title: document.title }]" class="px-0 document-breadcrumbs" />
			<DocumentReadingView v-model="selectedVersionNumber" :document="document" :versions="documentVersions">
				<template #actions>
					<VBtn
						variant="outlined"
						:prepend-icon="canDownloadOriginal ? 'mdi-download' : 'mdi-download-off-outline'"
						:disabled="!canDownloadOriginal && document.source.type === 'file'"
						@click="downloadDocument"
					>
						{{ canDownloadOriginal ? '下載原始檔案' : document.source.type === 'file' ? '原始檔案未保存' : '下載此版本文字' }}
					</VBtn>
					<VBtn color="primary" prepend-icon="mdi-message-text-outline" data-testid="ask-document" @click="askDocument">詢問這份文件</VBtn>
				</template>
			</DocumentReadingView>

		</template>
	</div>
</template>

<style scoped>
.document-page {
	max-width: 1240px;
}

.document-breadcrumbs {
	margin-bottom: var(--space-sm);
}

.document-page :deep(.reading-view) {
	margin-bottom: var(--space-2xl);
}
</style>

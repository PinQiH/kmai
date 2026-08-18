<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import DocumentVersionTimeline from '@/components/DocumentVersionTimeline.vue'
import StatePanel from '@/components/StatePanel.vue'
import { documentVersionHistoryById } from '@/mocks/data'
import { getDocumentById } from '@/repositories/knowledge.repository'
import type { DocumentVersionEntry, KnowledgeDocument } from '@/types'

const route = useRoute()
const router = useRouter()
const document = ref<KnowledgeDocument>()
const isLoading = ref(true)
const errorMessage = ref('')
const activeTab = ref('content')
const contentByDocumentId: Record<string, Array<{ heading: string; body: string }>> = {
	'doc-001': [
		{ heading: '一、目的與適用範圍', body: '本辦法說明公司同仁因公出差時的申請、費用標準與核銷流程。所有正式員工與約聘人員均應遵循。' },
		{ heading: '二、申請與費用', body: '出差前應完成申請並取得主管核准。國內住宿每晚以新台幣 3,000 元為原則，特殊情況需事前說明。' },
		{ heading: '三、核銷期限', body: '出差結束後十個工作天內完成費用報支，並檢附有效憑證。' },
	],
	'doc-002': [
		{ heading: '一、到職前準備', body: '人力資源部會建立人員資料並通知資訊部門準備帳號與設備。直屬主管應指定到職協助人。' },
		{ heading: '二、第一週任務', body: '完成公司帳號啟用、設備點交、資訊安全訓練與直屬主管安排的到職會談。' },
		{ heading: '三、前三十天', body: '與主管確認工作目標、認識主要協作窗口，並完成職務所需的基礎課程。' },
	],
	'doc-005': [
		{ heading: '一、目標設定', body: '年度開始時與主管確認具體、可衡量且與部門方向一致的工作目標。' },
		{ heading: '二、期中檢視', body: '期中檢視用於確認進度與調整資源，不是最終評等。若工作內容變更，應同步更新目標。' },
		{ heading: '三、評等與申覆', body: '主管完成評等後會安排面談說明。如對程序有疑義，可依公告期限向人力資源部提出申覆。' },
	],
}

const documentSections = computed(() => contentByDocumentId[document.value?.id ?? ''] ?? [
	{ heading: '文件摘要', body: document.value?.summary ?? '' },
])
const attachmentByDocumentId: Record<string, { name: string; size: string }> = {
	'doc-001': { name: '差旅費用明細表.xlsx', size: '32 KB' },
	'doc-002': { name: '到職第一週檢核表.pdf', size: '186 KB' },
	'doc-005': { name: '績效目標設定範例.xlsx', size: '48 KB' },
}
const documentVersions = computed<DocumentVersionEntry[]>(() => {
	const currentDocument = document.value
	if (!currentDocument) return []
	return documentVersionHistoryById[currentDocument.id] ?? [{
		version: currentDocument.version,
		date: currentDocument.updatedAt,
		author: currentDocument.owner,
		summary: currentDocument.summary,
		changes: [],
		isCurrent: true,
	}]
})
const attachment = computed(() => attachmentByDocumentId[document.value?.id ?? ''])

async function loadDocument(): Promise<void> {
	isLoading.value = true
	errorMessage.value = ''
	try {
		document.value = await getDocumentById(String(route.params.id))
		if (!document.value) errorMessage.value = '這份文件可能已被移除，或你沒有查看權限。'
	} catch {
		errorMessage.value = '目前無法載入文件，請稍後再試。'
	} finally {
		isLoading.value = false
	}
}

onMounted(loadDocument)
watch(() => route.params.id, loadDocument)

function downloadDocument(): void {
	if (!document.value) return
	const content = documentSections.value.map((section) => `${section.heading}\n${section.body}`).join('\n\n')
	const blob = new Blob([`${document.value.title}\n\n${content}`], { type: 'text/plain;charset=utf-8' })
	const url = URL.createObjectURL(blob)
	const link = window.document.createElement('a')
	link.href = url
	link.download = `${document.value.title}.txt`
	link.click()
	URL.revokeObjectURL(url)
}
</script>

<template>
	<div class="page-shell document-page">
		<VSkeletonLoader v-if="isLoading" type="heading, paragraph, article" />
		<StatePanel v-else-if="errorMessage" icon="mdi-file-alert-outline" title="無法開啟文件" :description="errorMessage" action-label="回到知識庫" @action="router.push('/library')" />
		<template v-else-if="document">
			<VBreadcrumbs :items="[{ title: '知識庫', to: '/library' }, { title: document.title }]" class="px-0 mb-3" />
			<header class="document-header mb-7">
				<div>
					<div class="d-flex flex-wrap align-center ga-2 mb-3">
						<VChip color="primary" variant="tonal" size="small">{{ document.category }}</VChip>
						<span class="text-caption text-medium-emphasis">{{ document.department }} · 第 {{ document.version }} 版</span>
					</div>
					<h1 class="page-heading">{{ document.title }}</h1>
					<p class="text-medium-emphasis mt-3 reading-width">{{ document.summary }}</p>
				</div>
				<div class="document-actions">
					<VBtn variant="outlined" prepend-icon="mdi-download" @click="downloadDocument">下載</VBtn>
					<VBtn color="primary" prepend-icon="mdi-message-text-outline" :to="{ path: '/ask', query: { q: `請摘要「${document.title}」` } }">詢問這份文件</VBtn>
				</div>
			</header>

			<VAlert type="info" variant="tonal" icon="mdi-information-outline" class="mb-6">
				此文件目前有效，最後更新於 {{ document.updatedAt }}。重要操作前請確認適用範圍與版本。
			</VAlert>

			<VTabs v-model="activeTab" color="primary" class="mb-5">
				<VTab value="content">內容預覽</VTab>
				<VTab value="versions">版本紀錄</VTab>
				<VTab value="attachments">附件</VTab>
			</VTabs>

			<VWindow v-model="activeTab">
				<VWindowItem value="content">
					<VCard class="surface-border pa-6 pa-md-10">
						<article class="document-content">
							<template v-for="section in documentSections" :key="section.heading">
								<h2>{{ section.heading }}</h2>
								<p>{{ section.body }}</p>
							</template>
						</article>
					</VCard>
				</VWindowItem>
				<VWindowItem value="versions">
					<VCard class="surface-border pa-6 pa-md-8">
						<DocumentVersionTimeline :versions="documentVersions" />
					</VCard>
				</VWindowItem>
				<VWindowItem value="attachments">
					<VList class="surface-border rounded-lg">
						<VListItem v-if="attachment" :title="attachment.name" :subtitle="`${attachment.size} · ${document.updatedAt}`" prepend-icon="mdi-file-document-outline">
							<template #append><VBtn icon="mdi-download" variant="text" aria-label="下載附件" @click="downloadDocument" /></template>
						</VListItem>
						<VListItem v-else title="這個版本沒有附件" subtitle="可從主要文件下載內容" prepend-icon="mdi-paperclip-off" />
					</VList>
				</VWindowItem>
			</VWindow>
		</template>
	</div>
</template>

<style scoped>
.document-page {
	max-width: 1080px;
}

.document-header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 24px;
}

.document-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.document-content {
	max-width: var(--reading-max-width);
	margin-inline: auto;
	font-size: 1.04rem;
	line-height: 1.85;
}

.document-content h2 {
	margin-block: 2rem 0.75rem;
	font-size: 1.25rem;
}

@media (max-width: 700px) {
	.document-header {
		flex-direction: column;
	}
}
</style>

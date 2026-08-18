<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import DocumentVersionTimeline from '@/components/DocumentVersionTimeline.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'
import { documentVersionHistoryById } from '@/mocks/data'
import { getAdminDocumentById } from '@/repositories/admin.repository'
import type { DocumentVersionEntry } from '@/types'

const route = useRoute()
const activeTab = ref('metadata')
const document = ref(getAdminDocumentById(String(route.params.id)))
const title = ref(document.value?.title ?? '')
const visibility = ref(document.value?.visibility ?? '全公司')
const isSaved = ref(false)
const isVersionDialogOpen = ref(false)
const strategyMessage = ref('')
const attachments = ref([{ id: 'attachment-1', name: '補充說明.pdf', size: '248 KB' }])
const deleteAttachmentTarget = ref<{ id: string; name: string } | null>(null)
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

function saveChanges(): void {
	if (!document.value) return
	document.value.title = title.value.trim() || document.value.title
	document.value.visibility = visibility.value
	isSaved.value = true
	window.setTimeout(() => { isSaved.value = false }, 2200)
}

function addAttachment(): void {
	attachments.value.push({ id: crypto.randomUUID(), name: `新附件-${attachments.value.length + 1}.pdf`, size: '120 KB' })
}

function testStrategy(): void {
	strategyMessage.value = '策略測試完成：解析、切塊與向量服務皆可使用。'
}

function confirmDeleteAttachment(): void {
	if (!deleteAttachmentTarget.value) return
	attachments.value = attachments.value.filter((item) => item.id !== deleteAttachmentTarget.value?.id)
	deleteAttachmentTarget.value = null
}

watch(() => route.params.id, (documentId) => {
	document.value = getAdminDocumentById(String(documentId))
	const nextDocument = document.value
	title.value = nextDocument?.title ?? ''
	visibility.value = nextDocument?.visibility ?? '全公司'
	attachments.value = [{ id: 'attachment-1', name: '補充說明.pdf', size: '248 KB' }]
})
</script>

<template>
	<div class="page-shell" v-if="document">
		<VBreadcrumbs :items="[{ title: '文件管理', to: '/admin/documents' }, { title: document.title }]" class="px-0" />
		<PageHeader eyebrow="文件管理詳情" :title="document.title" :description="`第 ${document.version} 版 · ${document.status} · ${document.owner}`">
			<template #actions><VBtn variant="outlined" :to="`/documents/${document.id}`">檢視員工畫面</VBtn><VBtn color="primary" @click="saveChanges">儲存變更</VBtn></template>
		</PageHeader>
		<VAlert v-if="isSaved" type="success" variant="tonal" class="mb-5">文件設定已更新。</VAlert>
		<VTabs v-model="activeTab" color="primary" show-arrows class="mb-6"><VTab value="metadata">文件欄位</VTab><VTab value="versions">版本</VTab><VTab value="attachments">附件</VTab><VTab value="access">存取控制</VTab><VTab value="strategy">處理策略</VTab></VTabs>
		<VWindow v-model="activeTab">
			<VWindowItem value="metadata"><VCard class="surface-border pa-6"><VTextField v-model="title" label="文件標題" /><VRow><VCol cols="12" md="6"><VSelect label="知識主題" :model-value="document.category" :items="['公司制度', '人事流程', '資訊安全', '作業流程']" /></VCol><VCol cols="12" md="6"><VSelect label="編制單位" :model-value="document.department" :items="['財務部', '人力資源部', '資訊安全部', '採購部']" /></VCol></VRow><VCombobox label="標籤" :model-value="document.tags" multiple chips /></VCard></VWindowItem>
			<VWindowItem value="versions"><VCard class="surface-border pa-6"><div class="d-flex flex-wrap align-center ga-3 mb-6"><h2 class="section-heading">版本紀錄</h2><VSpacer /><VBtn color="primary" prepend-icon="mdi-upload" @click="isVersionDialogOpen = true">上傳新版本</VBtn></div><DocumentVersionTimeline :versions="documentVersions" /></VCard></VWindowItem>
			<VWindowItem value="attachments"><VCard class="surface-border pa-6"><VBtn prepend-icon="mdi-paperclip-plus" variant="outlined" @click="addAttachment">新增附件</VBtn><VList class="mt-4"><VListItem v-for="attachment in attachments" :key="attachment.id" :title="attachment.name" :subtitle="attachment.size" prepend-icon="mdi-file-pdf-box"><template #append><VBtn icon="mdi-delete-outline" variant="text" :aria-label="`刪除 ${attachment.name}`" @click="deleteAttachmentTarget = attachment" /></template></VListItem></VList></VCard></VWindowItem>
			<VWindowItem value="access"><VCard class="surface-border pa-6"><VRadioGroup v-model="visibility" label="可見範圍"><VRadio label="全部成員" value="全公司" /><VRadio label="指定群組" value="指定群組" /><VRadio label="僅自己" value="僅自己" /></VRadioGroup><VAutocomplete v-if="visibility === '指定群組'" label="可查看群組" :items="['財務部', '主管群組', '專案 Alpha']" multiple chips /></VCard></VWindowItem>
			<VWindowItem value="strategy"><VCard class="surface-border pa-6"><VSwitch label="覆蓋全域處理策略" color="primary" /><VSelect label="解析策略" :items="['使用全域設定', '內建解析器', 'Docling']" /><VSelect label="切塊策略" :items="['使用全域設定', '段落優先', '固定長度']" /><VAlert v-if="strategyMessage" type="success" variant="tonal" class="mb-4">{{ strategyMessage }}</VAlert><VBtn variant="tonal" @click="testStrategy">測試目前策略</VBtn></VCard></VWindowItem>
		</VWindow>
	</div>
	<div v-else class="page-shell"><StatePanel icon="mdi-file-alert-outline" title="找不到這份文件" description="文件可能已被刪除，或網址中的識別碼不正確。" action-label="返回文件管理" @action="$router.push('/admin/documents')" /></div>
	<VDialog v-model="isVersionDialogOpen" max-width="520"><VCard><VCardTitle class="pa-6 pb-2">上傳新版本</VCardTitle><VCardText class="pa-6 pt-2"><VFileInput label="選擇主要檔案" /><VTextField label="新版本號" /><VTextarea label="版本說明" rows="3" /></VCardText><VCardActions class="pa-5"><VSpacer /><VBtn @click="isVersionDialogOpen = false">取消</VBtn><VBtn color="primary" @click="isVersionDialogOpen = false; isSaved = true">加入處理佇列</VBtn></VCardActions></VCard></VDialog>
	<VDialog :model-value="Boolean(deleteAttachmentTarget)" max-width="440" @update:model-value="deleteAttachmentTarget = null"><VCard><VCardTitle class="pa-6 pb-2">刪除附件</VCardTitle><VCardText class="pa-6 pt-2">確定要刪除「{{ deleteAttachmentTarget?.name }}」嗎？此動作無法復原。</VCardText><VCardActions class="pa-5"><VSpacer /><VBtn @click="deleteAttachmentTarget = null">取消</VBtn><VBtn color="error" @click="confirmDeleteAttachment">確認刪除</VBtn></VCardActions></VCard></VDialog>
</template>

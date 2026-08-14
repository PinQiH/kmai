<script setup lang="ts">
import { computed, ref } from 'vue'

import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'
import StatusChip from '@/components/StatusChip.vue'
import { getAdminDocumentsSnapshot } from '@/repositories/admin.repository'

const headers = [
	{ title: '文件', key: 'title', sortable: true },
	{ title: '部門', key: 'department' },
	{ title: '狀態', key: 'status' },
	{ title: '版本', key: 'version' },
	{ title: '更新日期', key: 'updatedAt' },
	{ title: '操作', key: 'actions', sortable: false, align: 'end' as const },
]

const search = ref('')
const status = ref('全部狀態')
const selected = ref<string[]>([])
const isDeleteDialogOpen = ref(false)
const isImportDialogOpen = ref(false)
const deleteTargetId = ref<string | null>(null)
const managedDocuments = ref(getAdminDocumentsSnapshot())
const statusOptions = ['全部狀態', '已發布', '待審核', '處理中', '失敗', '已下架']

const visibleDocuments = computed(() => managedDocuments.value.filter((document) => {
	const matchesSearch = !search.value || `${document.title} ${document.department}`.includes(search.value)
	const matchesStatus = status.value === '全部狀態' || document.status === status.value
	return matchesSearch && matchesStatus
}))

function openDeleteDialog(documentId: string): void {
	deleteTargetId.value = documentId
	isDeleteDialogOpen.value = true
}

function confirmDelete(): void {
	if (!deleteTargetId.value) return
	managedDocuments.value = managedDocuments.value.filter((document) => document.id !== deleteTargetId.value)
	selected.value = selected.value.filter((id) => id !== deleteTargetId.value)
	deleteTargetId.value = null
	isDeleteDialogOpen.value = false
}

function approveSelected(): void {
	managedDocuments.value = managedDocuments.value.map((document) => selected.value.includes(document.id)
		? { ...document, status: '已發布' as const }
		: document)
	selected.value = []
}
</script>

<template>
	<div class="page-shell">
		<PageHeader eyebrow="內容生命週期" title="文件管理" description="管理文件的內容、版本、審核、存取範圍與知識處理狀態。">
			<template #actions><VBtn variant="outlined" prepend-icon="mdi-file-excel-outline" @click="isImportDialogOpen = true">Excel 欄位匯入</VBtn><VBtn color="primary" prepend-icon="mdi-upload" to="/admin/documents/upload">新增文件</VBtn></template>
		</PageHeader>
		<VCard class="surface-border">
			<div class="document-toolbar pa-4">
				<VTextField v-model="search" label="搜尋文件或部門" prepend-inner-icon="mdi-magnify" hide-details clearable />
				<VSelect v-model="status" :items="statusOptions" label="文件狀態" hide-details />
				<VSpacer />
				<VBtn v-if="selected.length" variant="tonal" prepend-icon="mdi-check-all" @click="approveSelected">批次核准（{{ selected.length }}）</VBtn>
			</div>
			<VDivider />
			<StatePanel v-if="visibleDocuments.length === 0" class="ma-5" icon="mdi-file-search-outline" title="找不到符合的文件" description="請修改搜尋文字或清除狀態篩選。" action-label="清除條件" @action="search = ''; status = '全部狀態'" />
			<div v-else class="document-table-wrap" tabindex="0" aria-label="文件列表，可水平捲動">
				<VDataTable v-model="selected" :headers="headers" :items="visibleDocuments" item-value="id" show-select hover>
					<template #item.title="{ item }"><div class="py-2"><p class="font-weight-bold">{{ item.title }}</p><p class="text-caption text-medium-emphasis">{{ item.owner }} · {{ item.visibility }}</p></div></template>
					<template #item.status="{ item }"><StatusChip :status="item.status" /></template>
					<template #item.actions="{ item }"><VBtn icon="mdi-dots-horizontal" variant="text" :aria-label="`管理 ${item.title}`"><VMenu activator="parent"><VList><VListItem :to="`/documents/${item.id}`" title="查看文件" prepend-icon="mdi-eye-outline" /><VListItem :to="`/admin/documents/${item.id}/manage`" title="管理文件" prepend-icon="mdi-pencil-outline" /><VListItem title="刪除文件" prepend-icon="mdi-delete-outline" base-color="error" @click="openDeleteDialog(item.id)" /></VList></VMenu></VBtn></template>
				</VDataTable>
			</div>
		</VCard>

		<VDialog v-model="isDeleteDialogOpen" max-width="460">
			<VCard><VCardTitle>永久刪除文件？</VCardTitle><VCardText>刪除後無法復原，相關版本、附件與引用也會失效。若只是暫時不公開，請改用下架。</VCardText><VCardActions><VSpacer /><VBtn @click="isDeleteDialogOpen = false">取消</VBtn><VBtn color="error" @click="confirmDelete">永久刪除</VBtn></VCardActions></VCard>
		</VDialog>
		<VDialog v-model="isImportDialogOpen" max-width="560"><VCard><VCardTitle class="pa-6 pb-2">Excel 文件欄位匯入</VCardTitle><VCardText class="pa-6 pt-2"><p class="text-body-2 text-medium-emphasis mb-4">上傳 Excel 後將先預覽比對結果，不會直接覆蓋現有欄位。</p><VFileInput label="選擇 Excel 檔案" accept=".xls,.xlsx" prepend-icon="mdi-file-excel-outline" /><VAlert type="info" variant="tonal">展示模式不會讀取或保存檔案內容。</VAlert></VCardText><VCardActions class="pa-5"><VSpacer /><VBtn @click="isImportDialogOpen = false">取消</VBtn><VBtn color="primary" @click="isImportDialogOpen = false">預覽比對</VBtn></VCardActions></VCard></VDialog>
	</div>
</template>

<style scoped>
.document-toolbar { display: flex; align-items: center; gap: 12px; }
.document-toolbar > :first-child { max-width: 380px; }
.document-toolbar > :nth-child(2) { max-width: 220px; }
.document-table-wrap { max-width: 100%; overflow-x: auto; }
.document-table-wrap :deep(table) { min-width: 820px; }
@media (max-width: 800px) { .document-toolbar { align-items: stretch; flex-direction: column; } .document-toolbar > * { max-width: none !important; } }
</style>

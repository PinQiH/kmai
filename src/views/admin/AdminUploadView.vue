<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import PageHeader from '@/components/PageHeader.vue'
import {
	getDirectoryGroupsSnapshot,
	getDirectoryUsersSnapshot,
	getDocumentCategoryGroupsSnapshot,
	getOrganizationUnitsSnapshot,
} from '@/repositories/admin.repository'

type Visibility = '全公司' | '指定群組' | '指定使用者' | '僅自己'

const MAX_FILE_BYTES = 50 * 1024 * 1024

const currentStep = ref(1)
const uploadMode = ref<'single' | 'batch'>('single')
const title = ref('')
const mainCategory = ref<string | null>('公司制度')
const subCategory = ref<string | null>(null)
const department = ref<string | null>('財務部')
const visibility = ref<Visibility>('全公司')
const selectedGroupIds = ref<string[]>([])
const selectedUserIds = ref<string[]>([])
const tags = ref<string[]>([])
const version = ref('1.0')
const isSubmitting = ref(false)
const isComplete = ref(false)
const selectedFiles = ref<File[]>([])
const attachments = ref<File[]>([])
const fileError = ref('')
const attachmentError = ref('')

const visibilityOptions: Visibility[] = ['全公司', '指定群組', '指定使用者', '僅自己']
const departmentOptions = getOrganizationUnitsSnapshot().map((unit) => unit.name)
const categoryGroups = getDocumentCategoryGroupsSnapshot()
const mainCategoryOptions = categoryGroups.map((group) => group.name)
const groupOptions = getDirectoryGroupsSnapshot().map((group) => ({ title: group.name, subtitle: group.description, value: group.id }))
const userOptions = getDirectoryUsersSnapshot().map((user) => ({ title: user.name, subtitle: `${user.department} · ${user.email}`, value: user.id }))
const tagSuggestions = ['差旅', '報支', '流程', '制度', '資安', '新人']

const subCategoryOptions = computed(() => categoryGroups.find((group) => group.name === mainCategory.value)?.subCategories ?? [])

const visibilityTargetLabel = computed(() => {
	if (visibility.value === '指定群組') {
		return groupOptions.filter((option) => selectedGroupIds.value.includes(option.value)).map((option) => option.title).join('、')
	}
	if (visibility.value === '指定使用者') {
		return userOptions.filter((option) => selectedUserIds.value.includes(option.value)).map((option) => option.title).join('、')
	}
	return ''
})

const isVisibilityTargetMissing = computed(() => (visibility.value === '指定群組' && selectedGroupIds.value.length === 0)
	|| (visibility.value === '指定使用者' && selectedUserIds.value.length === 0))

const canContinue = computed(() => {
	if (currentStep.value === 1) return selectedFiles.value.length > 0 && !fileError.value
	if (currentStep.value === 2) return Boolean(title.value.trim()) && Boolean(mainCategory.value?.trim()) && !isVisibilityTargetMissing.value
	return true
})

function selectFiles(files: File[]): void {
	const oversizedFile = files.find((file) => file.size > MAX_FILE_BYTES)
	fileError.value = oversizedFile ? `${oversizedFile.name} 超過 50 MB，請選擇較小的檔案。` : ''
	selectedFiles.value = oversizedFile ? [] : (uploadMode.value === 'single' ? files.slice(0, 1) : files)
	if (uploadMode.value === 'single' && files[0] && !title.value) {
		title.value = files[0].name.replace(/\.[^.]+$/, '')
	}
}

function handleFileChange(event: Event): void {
	const input = event.target as HTMLInputElement
	selectFiles(Array.from(input.files ?? []))
}

function handleDrop(event: DragEvent): void {
	event.preventDefault()
	selectFiles(Array.from(event.dataTransfer?.files ?? []))
}

function selectAttachments(files: File[]): void {
	const oversizedFile = files.find((file) => file.size > MAX_FILE_BYTES)
	attachmentError.value = oversizedFile ? `${oversizedFile.name} 超過 50 MB，請選擇較小的附件。` : ''
	if (oversizedFile) return
	const existingKeys = new Set(attachments.value.map((file) => `${file.name}-${file.size}`))
	attachments.value = [...attachments.value, ...files.filter((file) => !existingKeys.has(`${file.name}-${file.size}`))]
}

function handleAttachmentChange(event: Event): void {
	const input = event.target as HTMLInputElement
	selectAttachments(Array.from(input.files ?? []))
	input.value = ''
}

function removeAttachment(target: File): void {
	attachments.value = attachments.value.filter((file) => file !== target)
}

/** 將自由輸入欄位正規化：去頭尾空白，全空白視同未填。 */
function normalizeText(value: unknown): string | null {
	const text = typeof value === 'string' ? value.trim() : ''
	return text.length > 0 ? text : null
}

/** 將標籤輸入正規化：去除空白與重複，讓手動輸入也能成為標籤。 */
function normalizeTags(nextTags: unknown[]): void {
	const cleaned = nextTags
		.map((tag) => String(tag).trim())
		.filter((tag) => tag.length > 0)
	tags.value = Array.from(new Set(cleaned))
}

watch(uploadMode, (mode) => {
	if (mode === 'single' && selectedFiles.value.length > 1) selectedFiles.value = selectedFiles.value.slice(0, 1)
})

// @ 大類別換了之後，原本「從清單挑的」小類別不再屬於它，必須清掉避免送出錯誤組合。
// ! 自行輸入的小類別不在任何清單裡，屬於使用者刻意填的內容，換大類別時要保留。
watch(mainCategory, (_next, previous) => {
	if (!subCategory.value) return
	const previousOptions = categoryGroups.find((group) => group.name === previous)?.subCategories ?? []
	const wasPickedFromList = previousOptions.includes(subCategory.value)
	if (wasPickedFromList && !subCategoryOptions.value.includes(subCategory.value)) subCategory.value = null
})

watch(visibility, () => {
	selectedGroupIds.value = []
	selectedUserIds.value = []
})

async function nextStep(): Promise<void> {
	if (!canContinue.value) return
	if (currentStep.value < 3) {
		currentStep.value += 1
		return
	}
	isSubmitting.value = true
	// TODO(api-integration): 改為串接文件上傳 API。
	await new Promise((resolve) => window.setTimeout(resolve, 900))
	isSubmitting.value = false
	isComplete.value = true
}
</script>

<template>
	<div class="page-shell upload-page">
		<PageHeader title="新增文件" description="先選擇檔案，再補上方便搜尋與管理的文件資訊。">
			<template #actions><VBtn variant="text" to="/admin/documents">取消並返回</VBtn></template>
		</PageHeader>
		<VAlert type="info" variant="tonal" class="mb-6">這是前端展示流程，檔案不會實際上傳或保存。</VAlert>
		<VStepper v-model="currentStep" :items="['選擇檔案', '文件資訊', '確認送出']" hide-actions class="surface-border">
			<template #item.1>
				<div class="pa-3">
					<VBtnToggle v-model="uploadMode" mandatory color="primary" class="mb-5"><VBtn value="single">單份文件</VBtn><VBtn value="batch">批次上傳</VBtn></VBtnToggle>
					<label for="document-file" class="upload-zone" @dragover.prevent @drop="handleDrop">
						<VIcon icon="mdi-cloud-upload-outline" size="42" color="primary" aria-hidden="true" />
						<span class="font-weight-bold mt-3">選擇或拖曳{{ uploadMode === 'single' ? '一份文件' : '多份文件' }}</span>
						<span class="text-body-2 text-medium-emphasis mt-1">支援 PDF、Word、Excel 與 PowerPoint，單檔上限 50 MB</span>
						<input id="document-file" class="visually-hidden" data-testid="document-file-input" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" :multiple="uploadMode === 'batch'" @change="handleFileChange" />
					</label>
					<p v-if="fileError" class="text-error text-body-2 mt-3" role="alert" data-testid="file-error">{{ fileError }}</p>
					<VList v-if="selectedFiles.length" class="surface-border rounded-lg mt-4" aria-label="已選擇檔案">
						<VListItem v-for="file in selectedFiles" :key="`${file.name}-${file.size}`" :title="file.name" :subtitle="`${Math.max(1, Math.round(file.size / 1024))} KB`" prepend-icon="mdi-file-document-outline" />
					</VList>
				</div>
			</template>
			<template #item.2>
				<div class="pa-3">
					<VTextField v-model="title" label="文件標題" :error-messages="!title ? '請輸入方便同仁辨識的文件標題' : undefined" />
					<VRow>
						<VCol cols="12" md="6">
							<VCombobox v-model="mainCategory" data-testid="main-category" label="大類別" :items="mainCategoryOptions" clearable no-data-text="沒有相符的既有類別，可直接使用你輸入的內容" hint="可從清單挑選，或直接輸入新的大類別" persistent-hint :error-messages="!mainCategory ? '請選擇或輸入大類別' : undefined" @update:model-value="mainCategory = normalizeText($event)" />
						</VCol>
						<VCol cols="12" md="6">
							<VCombobox v-model="subCategory" data-testid="sub-category" label="小類別" :items="subCategoryOptions" clearable :disabled="!mainCategory" :no-data-text="mainCategory ? '沒有相符的既有類別，可直接使用你輸入的內容' : '請先填寫大類別'" hint="可留空，也可直接輸入新的小類別" persistent-hint @update:model-value="subCategory = normalizeText($event)" />
						</VCol>
					</VRow>
					<VRow>
						<VCol cols="12" md="6">
							<VCombobox v-model="department" data-testid="department-select" label="編制單位" :items="departmentOptions" clearable no-data-text="沒有相符的既有單位，可直接使用你輸入的內容" hint="可從清單挑選，或直接輸入未建檔的單位" persistent-hint @update:model-value="department = normalizeText($event)" />
						</VCol>
						<VCol cols="12" md="6"><VTextField v-model="version" label="版本" /></VCol>
					</VRow>
					<VRow>
						<VCol cols="12" md="6"><VSelect v-model="visibility" data-testid="visibility-select" label="可見範圍" :items="visibilityOptions" /></VCol>
						<VCol v-if="visibility === '指定群組'" cols="12" md="6">
							<VAutocomplete v-model="selectedGroupIds" data-testid="visibility-groups" label="指定群組" :items="groupOptions" item-title="title" item-value="value" multiple chips closable-chips auto-select-first no-data-text="找不到符合的群組" :error-messages="isVisibilityTargetMissing ? '請至少指定一個群組' : undefined">
								<template #item="{ props: itemProps, item }"><VListItem v-bind="itemProps" :subtitle="item.raw.subtitle" /></template>
							</VAutocomplete>
						</VCol>
						<VCol v-else-if="visibility === '指定使用者'" cols="12" md="6">
							<VAutocomplete v-model="selectedUserIds" data-testid="visibility-users" label="指定使用者" :items="userOptions" item-title="title" item-value="value" multiple chips closable-chips auto-select-first no-data-text="找不到符合的使用者" :error-messages="isVisibilityTargetMissing ? '請至少指定一位使用者' : undefined">
								<template #item="{ props: itemProps, item }"><VListItem v-bind="itemProps" :subtitle="item.raw.subtitle" /></template>
							</VAutocomplete>
						</VCol>
					</VRow>
					<VCombobox :model-value="tags" data-testid="tag-combobox" label="標籤" :items="tagSuggestions" multiple chips closable-chips hint="輸入後按 Enter 即可建立新標籤" persistent-hint @update:model-value="normalizeTags" />

					<h3 class="section-heading mt-8 mb-3">附件</h3>
					<p class="text-body-2 text-medium-emphasis mb-3">補充說明用的簡報、表單或圖片，會跟著文件一起保存，單檔上限 50 MB。</p>
					<label for="document-attachments" class="attachment-zone">
						<VIcon icon="mdi-paperclip" size="22" color="primary" aria-hidden="true" />
						<span class="ml-2">選擇附件（可多選）</span>
						<input id="document-attachments" class="visually-hidden" data-testid="attachment-input" type="file" multiple @change="handleAttachmentChange" />
					</label>
					<p v-if="attachmentError" class="text-error text-body-2 mt-3" role="alert" data-testid="attachment-error">{{ attachmentError }}</p>
					<VList v-if="attachments.length" class="surface-border rounded-lg mt-4" aria-label="已選擇附件">
						<VListItem v-for="file in attachments" :key="`${file.name}-${file.size}`" :title="file.name" :subtitle="`${Math.max(1, Math.round(file.size / 1024))} KB`" prepend-icon="mdi-paperclip">
							<template #append><VBtn variant="text" size="small" icon="mdi-close" :aria-label="`移除附件 ${file.name}`" @click="removeAttachment(file)" /></template>
						</VListItem>
					</VList>
				</div>
			</template>
			<template #item.3>
				<div class="pa-3">
					<template v-if="isComplete"><VAlert type="success" variant="tonal" title="文件已加入處理佇列">可在處理監控的「全部工作」找到這次的工作，追蹤解析、切塊、向量化與圖譜建立進度。</VAlert><VList v-if="uploadMode === 'batch'" class="surface-border rounded-lg mt-4"><VListItem v-for="file in selectedFiles" :key="file.name" :title="file.name" subtitle="上傳成功 · 等待處理" prepend-icon="mdi-check-circle-outline" /></VList></template>
					<VList v-else class="surface-border rounded-lg">
						<VListItem title="文件標題" :subtitle="title || '尚未填寫'" />
						<VListItem title="類別" :subtitle="`${mainCategory ?? '尚未選擇'}${subCategory ? ` · ${subCategory}` : ''}`" />
						<VListItem title="編制單位" :subtitle="department ?? '尚未選擇'" />
						<VListItem title="版本與可見範圍" :subtitle="`${version} · ${visibility}${visibilityTargetLabel ? `（${visibilityTargetLabel}）` : ''}`" />
						<VListItem title="標籤" :subtitle="tags.length ? tags.join('、') : '尚未設定'" />
						<VListItem title="附件" :subtitle="attachments.length ? `${attachments.length} 個檔案` : '無'" />
					</VList>
				</div>
			</template>
		</VStepper>
		<div class="d-flex justify-space-between mt-5"><VBtn variant="outlined" :disabled="currentStep === 1 || isComplete" @click="currentStep -= 1">上一步</VBtn><VBtn v-if="!isComplete" data-testid="upload-next" color="primary" :loading="isSubmitting" :disabled="!canContinue" @click="nextStep">{{ currentStep === 3 ? '確認並開始處理' : '下一步' }}</VBtn><VBtn v-else color="primary" to="/admin/processing?tab=all">查看處理進度</VBtn></div>
	</div>
</template>

<style scoped>
.upload-page { max-width: 960px; }
.upload-zone { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 260px; padding: 32px; border: 1px dashed rgb(var(--v-theme-outline)); border-radius: 12px; cursor: pointer; }
.upload-zone:hover { border-color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), 0.04); }
.attachment-zone { display: inline-flex; align-items: center; padding: 10px 16px; border: 1px dashed rgb(var(--v-theme-outline)); border-radius: 10px; cursor: pointer; }
.attachment-zone:hover { border-color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), 0.04); }
.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
</style>

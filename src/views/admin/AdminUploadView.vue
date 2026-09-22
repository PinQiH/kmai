<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { prepareVersionFiles } from '@/mocks/documentFiles'
import DocumentFileActions from '@/components/DocumentFileActions.vue'
import type { KnowledgeDocument, UserDocumentSource } from '@/types'
import { COMPANY_KNOWLEDGE_SOURCES } from '@/utils/knowledgeSources'
import PageHeader from '@/components/PageHeader.vue'
import {
	createAdminDocument,
	getDirectoryGroupsSnapshot,
	getDirectoryUsersSnapshot,
	getDocumentCategoryGroupsSnapshot,
	getOrganizationUnitsSnapshot,
} from '@/repositories/admin.repository'

type Visibility = '全公司' | '指定群組' | '指定使用者' | '僅自己'

const MAX_FILE_BYTES = 50 * 1024 * 1024

const sourceType = ref<'file' | 'text' | 'url'>('file')
const textContent = ref('')
const sourceUrl = ref('')
const versionNote = ref('')
const createdIds = ref<string[]>([])
const submitError = ref('')
const currentStep = ref(1)
const uploadMode = ref<'single' | 'batch'>('single')
const title = ref('')
const knowledgeTopicId = ref('policy')
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
// @ 「全公司知識」是聚合來源，不能當成文件的歸屬主題。
const knowledgeTopicOptions = COMPANY_KNOWLEDGE_SOURCES
	.filter((source) => source.id !== 'company')
	.map((source) => ({ title: source.name, subtitle: source.description, value: source.id }))
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

const validUrl = computed(() => {
	try { return ['http:', 'https:'].includes(new URL(sourceUrl.value).protocol) } catch { return false }
})
const metadataValid = computed(() => Boolean(title.value.trim()) && Boolean(mainCategory.value?.trim()) && !isVisibilityTargetMissing.value && Boolean(versionNote.value.trim()) && /^\d+\.\d+(?:\.\d+)?$/.test(version.value) && !attachmentError.value)
const sourceValid = computed(() => sourceType.value === 'text' ? Boolean(textContent.value.trim()) : sourceType.value === 'url' ? validUrl.value : selectedFiles.value.length > 0 && !fileError.value)
const canContinue = computed(() => currentStep.value === 1 ? sourceValid.value : metadataValid.value && sourceValid.value)

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
	if (!canContinue.value || isSubmitting.value) return
	if (currentStep.value < 3) {
		currentStep.value += 1
		return
	}
	isSubmitting.value = true
	submitError.value = ''
	try {
		const files: Array<File | undefined> = sourceType.value === 'file' ? selectedFiles.value : [undefined]
		const prepared = await Promise.all(files.map(async (file) => {
			const source: UserDocumentSource = sourceType.value === 'text'
				? { type: 'text', format: 'plain-text', content: textContent.value.trim() }
				: sourceType.value === 'url'
					? { type: 'url', url: sourceUrl.value.trim(), domain: new URL(sourceUrl.value).hostname, capturedAt: '', snapshot: '' }
					: { type: 'file', fileName: file!.name, extension: file!.name.split('.').pop() ?? '', mimeType: file!.type }
			const document: KnowledgeDocument = {
				id: `local-${crypto.randomUUID()}`, knowledgeSourceId: knowledgeTopicId.value, source,
				title: sourceType.value === 'file' && uploadMode.value === 'batch' ? file!.name.replace(/\.[^.]+$/, '') : title.value.trim(),
				summary: versionNote.value.trim(), department: department.value ?? '', category: mainCategory.value ?? '', subCategory: subCategory.value ?? undefined,
				tags: [...tags.value], uploadedAt: new Date().toISOString().slice(0, 10), updatedAt: new Date().toISOString().slice(0, 10), version: version.value,
				status: '處理中', visibility: visibility.value, visibilityGroupIds: [...selectedGroupIds.value], visibilityUserIds: [...selectedUserIds.value], owner: '目前使用者',
			}
			return { document, files: await prepareVersionFiles(source, file, attachments.value) }
		}))
		createdIds.value = await Promise.all(prepared.map((item) => createAdminDocument({
			document: item.document,
			versionNote: versionNote.value.trim(),
			files: item.files,
		})))
		isComplete.value = true
	} catch {
		submitError.value = '讀取文件失敗，請檢查檔案後重試。'
	} finally { isSubmitting.value = false }

}
</script>

<template>
	<div class="page-shell upload-page">
		<PageHeader eyebrow="內容與知識" title="新增文件" description="上傳檔案、輸入文字或貼上網址，再設定文件資訊。">
			<template #actions><VBtn variant="text" to="/admin/documents">取消並返回</VBtn></template>
		</PageHeader>
		<VAlert type="info" variant="tonal" class="mb-6">文件與檔案僅保留於本次瀏覽工作階段，重新整理後清除；網址擷取與自動處理尚未串接。</VAlert>
		<VStepper v-model="currentStep" :items="['文件來源', '文件資訊', '確認送出']" hide-actions class="surface-border">
			<template #item.1>
				<div class="pa-3">
					<VBtnToggle v-model="sourceType" mandatory color="primary" class="mb-5"><VBtn value="file">上傳檔案</VBtn><VBtn value="text">輸入文字</VBtn><VBtn value="url">貼上網址</VBtn></VBtnToggle>
					<VTextarea v-if="sourceType === 'text'" v-model="textContent" label="文件文字內容" rows="12" />
					<template v-else-if="sourceType === 'url'"><VTextField v-model="sourceUrl" label="來源網址" placeholder="https://" :error-messages="sourceUrl && !validUrl ? '請輸入有效的 HTTP 或 HTTPS 網址' : undefined" /><p>網址內容將由處理服務擷取，目前只保存來源網址。</p></template>
					<template v-else>
					<VBtnToggle v-model="uploadMode" mandatory color="primary" class="mb-5"><VBtn value="single">單份文件</VBtn><VBtn value="batch">批次上傳</VBtn></VBtnToggle>
					<label for="document-file" class="upload-zone" @dragover.prevent @drop="handleDrop">
						<VIcon icon="mdi-cloud-upload-outline" size="42" color="primary" aria-hidden="true" />
						<span class="font-weight-bold mt-3">選擇或拖曳{{ uploadMode === 'single' ? '一份文件' : '多份文件' }}</span>
						<span class="text-body-2 text-medium-emphasis mt-1">支援 PDF、Office、文字及圖片，單檔上限 50 MB</span>
						<input id="document-file" class="visually-hidden" data-testid="document-file-input" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg" :multiple="uploadMode === 'batch'" @change="handleFileChange" />
					</label>
					<p v-if="fileError" class="text-error text-body-2 mt-3" role="alert" data-testid="file-error">{{ fileError }}</p>
					<VList v-if="selectedFiles.length" class="surface-border rounded-lg mt-4" aria-label="已選擇檔案">
						<VListItem v-for="file in selectedFiles" :key="`${file.name}-${file.size}`" :title="file.name" :subtitle="`${Math.max(1, Math.round(file.size / 1024))} KB`" prepend-icon="mdi-file-document-outline"><template #append><DocumentFileActions :file="file" /></template></VListItem>
					</VList>
					</template>
				</div>
			</template>
			<template #item.2>
				<div class="pa-3 upload-form">
					<section>
						<h3 class="form-heading">基本資訊</h3>
						<VRow>
							<VCol cols="12"><VTextField v-model="title" label="文件標題" :error-messages="!title ? '請輸入方便同仁辨識的文件標題' : undefined" /></VCol>
							<VCol cols="12" md="6">
								<VSelect v-model="knowledgeTopicId" data-testid="knowledge-topic" label="知識主題" :items="knowledgeTopicOptions" item-title="title" item-value="value" hint="決定這份文件會出現在哪個知識庫" persistent-hint>
									<template #item="{ props: itemProps, item }"><VListItem v-bind="itemProps" :subtitle="item.raw.subtitle" /></template>
								</VSelect>
							</VCol>
							<VCol cols="12" md="6">
								<VCombobox v-model="department" data-testid="department-select" label="編制單位" :items="departmentOptions" clearable no-data-text="沒有相符的既有單位，可直接使用你輸入的內容" hint="可從清單挑選，或直接輸入未建檔的單位" persistent-hint @update:model-value="department = normalizeText($event)" />
							</VCol>
							<VCol cols="12" md="6">
								<VCombobox v-model="mainCategory" data-testid="main-category" label="大類別" :items="mainCategoryOptions" clearable no-data-text="沒有相符的既有類別，可直接使用你輸入的內容" hint="可從清單挑選，或直接輸入新的大類別" persistent-hint :error-messages="!mainCategory ? '請選擇或輸入大類別' : undefined" @update:model-value="mainCategory = normalizeText($event)" />
							</VCol>
							<VCol cols="12" md="6">
								<VCombobox v-model="subCategory" data-testid="sub-category" label="小類別" :items="subCategoryOptions" clearable :no-data-text="mainCategory ? '沒有相符的既有類別，可直接使用你輸入的內容' : '請先填寫大類別，或直接輸入小類別'" hint="可留空，也可直接輸入新的小類別" persistent-hint @update:model-value="subCategory = normalizeText($event)" />
							</VCol>
							<VCol cols="12"><VCombobox :model-value="tags" data-testid="tag-combobox" label="標籤" :items="tagSuggestions" multiple chips closable-chips hint="輸入後按 Enter 即可建立新標籤" persistent-hint @update:model-value="normalizeTags" /></VCol>
						</VRow>
					</section>

					<section>
						<h3 class="form-heading">版本</h3>
						<VRow>
							<VCol cols="12" md="4"><VTextField v-model="version" label="版本號" hint="新文件建議從 1.0 開始" persistent-hint /></VCol>
							<VCol cols="12" md="8"><VTextarea v-model="versionNote" label="版本說明" data-testid="initial-version-note" rows="3" hint="說明初次建立的內容與用途" persistent-hint /></VCol>
						</VRow>
					</section>

					<section>
						<h3 class="form-heading">可見範圍</h3>
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
					</section>

					<section>
						<h3 class="form-heading">附件</h3>
						<p class="form-note">補充說明用的簡報、表單或圖片，會跟著這一版一起保存，單檔上限 50 MB。</p>
						<label for="document-attachments" class="attachment-zone">
							<VIcon icon="mdi-paperclip" size="22" color="primary" aria-hidden="true" />
							<span class="ml-2">選擇附件（可多選）</span>
							<input id="document-attachments" class="visually-hidden" data-testid="attachment-input" type="file" multiple @change="handleAttachmentChange" />
						</label>
						<p v-if="attachmentError" class="text-error text-body-2 mt-3" role="alert" data-testid="attachment-error">{{ attachmentError }}</p>
						<VList v-if="attachments.length" class="surface-border rounded-lg mt-4" aria-label="已選擇附件">
							<VListItem v-for="file in attachments" :key="`${file.name}-${file.size}`" :title="file.name" :subtitle="`${Math.max(1, Math.round(file.size / 1024))} KB`" prepend-icon="mdi-paperclip">
								<template #append><DocumentFileActions :file="file" /><VBtn variant="text" size="small" icon="mdi-close" :aria-label="`移除附件 ${file.name}`" @click="removeAttachment(file)" /></template>
							</VListItem>
						</VList>
					</section>
				</div>
			</template>
			<template #item.3>
				<div class="pa-3">
					<template v-if="isComplete"><VAlert type="success" variant="tonal" title="文件已加入處理佇列">接下來會依「系統處理 → 人工審核 → 發布」前進：正式串接後，系統完成文字抽取、切段、向量化、建索引、知識圖譜、AI 摘要與品質診斷後會轉為待審核，審核通過才會在前台開放。</VAlert><VList v-if="uploadMode === 'batch'" class="surface-border rounded-lg mt-4"><VListItem v-for="file in selectedFiles" :key="file.name" :title="file.name" subtitle="上傳成功 · 等待處理" prepend-icon="mdi-check-circle-outline" /></VList></template>
					<VList v-else class="surface-border rounded-lg">
						<VListItem title="文件標題" :subtitle="title || '尚未填寫'" />
						<VListItem title="類別" :subtitle="`${mainCategory ?? '尚未選擇'}${subCategory ? ` · ${subCategory}` : ''}`" />
						<VListItem title="編制單位" :subtitle="department ?? '尚未選擇'" />
						<VListItem title="版本與可見範圍" :subtitle="`${version} · ${visibility}${visibilityTargetLabel ? `（${visibilityTargetLabel}）` : ''}`" />
						<VListItem title="版本說明" :subtitle="versionNote" />
						<VListItem title="標籤" :subtitle="tags.length ? tags.join('、') : '尚未設定'" />
						<VListItem title="附件" :subtitle="attachments.length ? `${attachments.length} 個檔案` : '無'" />
					</VList>
				</div>
			</template>
		</VStepper>
		<VAlert v-if="submitError" type="error" class="mt-4">{{ submitError }}</VAlert>
		<div class="d-flex justify-space-between mt-5"><VBtn variant="outlined" :disabled="currentStep === 1 || isComplete" @click="currentStep -= 1">上一步</VBtn><VBtn v-if="!isComplete" data-testid="upload-next" color="primary" :loading="isSubmitting" :disabled="!canContinue" @click="nextStep">{{ currentStep === 3 ? '確認並開始處理' : '下一步' }}</VBtn><VBtn v-else color="primary" :to="{ path: '/admin/documents', query: { tab: 'documents', documentId: createdIds } }">查看處理進度</VBtn></div>
	</div>
</template>

<style scoped>
.upload-page { max-width: 960px; }
.upload-form { display: grid; gap: 28px; }
.form-heading { margin-bottom: 12px; font-size: 0.95rem; font-weight: 700; }
.form-note { margin-bottom: 12px; color: var(--ink-muted); font-size: 0.82rem; line-height: 1.6; }
.upload-zone { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 260px; padding: 32px; border: 1px dashed rgb(var(--v-theme-outline)); border-radius: 12px; cursor: pointer; }
.upload-zone:hover { border-color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), 0.04); }
.attachment-zone { display: inline-flex; align-items: center; padding: 10px 16px; border: 1px dashed rgb(var(--v-theme-outline)); border-radius: 10px; cursor: pointer; }
.attachment-zone:hover { border-color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), 0.04); }
.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
</style>

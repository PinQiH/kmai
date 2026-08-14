<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import PageHeader from '@/components/PageHeader.vue'

const currentStep = ref(1)
const uploadMode = ref<'single' | 'batch'>('single')
const title = ref('')
const topic = ref('公司制度')
const department = ref('財務部')
const visibility = ref('全公司')
const version = ref('1.0')
const isSubmitting = ref(false)
const isComplete = ref(false)
const selectedFiles = ref<File[]>([])
const fileError = ref('')

const canContinue = computed(() => {
	if (currentStep.value === 1) return selectedFiles.value.length > 0 && !fileError.value
	if (currentStep.value === 2) return Boolean(title.value.trim())
	return true
})

function selectFiles(files: File[]): void {
	const oversizedFile = files.find((file) => file.size > 50 * 1024 * 1024)
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

watch(uploadMode, (mode) => {
	if (mode === 'single' && selectedFiles.value.length > 1) selectedFiles.value = selectedFiles.value.slice(0, 1)
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
						<input id="document-file" class="visually-hidden" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" :multiple="uploadMode === 'batch'" @change="handleFileChange" />
					</label>
					<p v-if="fileError" class="text-error text-body-2 mt-3" role="alert">{{ fileError }}</p>
					<VList v-if="selectedFiles.length" class="surface-border rounded-lg mt-4" aria-label="已選擇檔案">
						<VListItem v-for="file in selectedFiles" :key="`${file.name}-${file.size}`" :title="file.name" :subtitle="`${Math.max(1, Math.round(file.size / 1024))} KB`" prepend-icon="mdi-file-document-outline" />
					</VList>
				</div>
			</template>
			<template #item.2>
				<div class="pa-3">
					<VTextField v-model="title" label="文件標題" :error-messages="!title ? '請輸入方便同仁辨識的文件標題' : undefined" />
					<VRow><VCol cols="12" md="6"><VSelect v-model="topic" label="知識主題" :items="['公司制度', '人事與福利', '作業流程', '產品與客戶']" /></VCol><VCol cols="12" md="6"><VSelect v-model="department" label="編制單位" :items="['財務部', '人力資源部', '資訊安全部', '採購部']" /></VCol></VRow>
					<VRow><VCol cols="12" md="6"><VTextField v-model="version" label="版本" /></VCol><VCol cols="12" md="6"><VSelect v-model="visibility" label="可見範圍" :items="['全公司', '指定群組', '僅自己']" /></VCol></VRow>
					<VCombobox label="標籤" :items="['差旅', '報支', '流程', '制度']" multiple chips />
				</div>
			</template>
			<template #item.3>
				<div class="pa-3">
					<template v-if="isComplete"><VAlert type="success" variant="tonal" title="文件已加入處理佇列">可前往處理監控查看解析、切塊、向量化與圖譜建立進度。</VAlert><VList v-if="uploadMode === 'batch'" class="surface-border rounded-lg mt-4"><VListItem v-for="file in selectedFiles" :key="file.name" :title="file.name" subtitle="上傳成功 · 等待處理" prepend-icon="mdi-check-circle-outline" /></VList></template>
					<VList v-else class="surface-border rounded-lg"><VListItem title="文件標題" :subtitle="title || '尚未填寫'" /><VListItem title="知識主題與單位" :subtitle="`${topic} · ${department}`" /><VListItem title="版本與可見範圍" :subtitle="`${version} · ${visibility}`" /></VList>
				</div>
			</template>
		</VStepper>
		<div class="d-flex justify-space-between mt-5"><VBtn variant="outlined" :disabled="currentStep === 1 || isComplete" @click="currentStep -= 1">上一步</VBtn><VBtn v-if="!isComplete" color="primary" :loading="isSubmitting" :disabled="!canContinue" @click="nextStep">{{ currentStep === 3 ? '確認並開始處理' : '下一步' }}</VBtn><VBtn v-else color="primary" to="/admin/processing">查看處理進度</VBtn></div>
	</div>
</template>

<style scoped>
.upload-page { max-width: 960px; }
.upload-zone { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 260px; padding: 32px; border: 1px dashed rgb(var(--v-theme-outline)); border-radius: 12px; cursor: pointer; }
.upload-zone:hover { border-color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), 0.04); }
.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
</style>

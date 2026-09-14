<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { downloadFile } from '@/mocks/documentFiles'

const props = defineProps<{ file: File; label?: string }>()
const open = ref(false)
const url = ref('')
const text = ref('')
const error = ref('')
const kind = computed(() => /\.pdf$/i.test(props.file.name) ? 'pdf' : /\.(png|jpe?g|gif|webp)$/i.test(props.file.name) ? 'image' : /\.(txt|md|csv)$/i.test(props.file.name) ? 'text' : 'unsupported')
let request = 0
function release(): void {
	request += 1
	if (url.value) URL.revokeObjectURL(url.value)
	url.value = ''
}
watch(open, async (value) => {
	release()
	text.value = ''
	error.value = ''
	if (!value) return
	const currentRequest = request
	try {
		if (kind.value === 'text') {
			const content = await props.file.text()
			if (request === currentRequest) text.value = content
		} else if (kind.value !== 'unsupported') url.value = URL.createObjectURL(props.file)
	} catch { error.value = '無法讀取檔案，請重新選擇或下載檢查。' }
})
watch(() => props.file, () => { open.value = false; release() })
onBeforeUnmount(release)
</script>

<template>
	<div class="file-actions">
		<VBtn variant="text" size="small" :aria-label="`預覽 ${label ?? file.name}`" @click="open = true">預覽</VBtn>
		<VBtn variant="text" size="small" :aria-label="`下載 ${label ?? file.name}`" @click="downloadFile(file, file.name)">下載</VBtn>
		<VDialog v-model="open" max-width="1000" scrollable>
			<VCard>
				<VCardTitle class="d-flex align-center ga-2"><span class="text-wrap">{{ file.name }}</span><VSpacer /><VBtn icon="mdi-close" variant="text" aria-label="關閉檔案預覽" @click="open = false" /></VCardTitle>
				<VCardText>
					<VAlert v-if="error" type="error">{{ error }}</VAlert>
					<iframe v-else-if="kind === 'pdf' && url" :src="url" :title="file.name" class="file-frame" />
					<img v-else-if="kind === 'image' && url" :src="url" :alt="file.name" class="file-image" />
					<pre v-else-if="kind === 'text'" class="file-text">{{ text }}</pre>
					<VAlert v-else type="info" variant="tonal">此格式需由文件轉換服務提供預覽，目前可下載原始檔案查看。</VAlert>
				</VCardText>
				<VCardActions><VSpacer /><VBtn @click="downloadFile(file, file.name)">下載原始檔案</VBtn></VCardActions>
			</VCard>
		</VDialog>
	</div>
</template>

<style scoped>
.file-actions { display: inline-flex; flex-wrap: wrap; }
.file-frame { width: 100%; height: 65vh; border: 0; }
.file-image { max-width: 100%; max-height: 65vh; object-fit: contain; }
.file-text { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; }
</style>

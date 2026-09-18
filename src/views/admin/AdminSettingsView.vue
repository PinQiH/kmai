<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useTheme } from 'vuetify'

import brandLogoUrl from '@/assets/brand/kmai-logo.png'
import MarkdownContent from '@/components/MarkdownContent.vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import PageHeader from '@/components/PageHeader.vue'
import {
	LOGO_MAX_BYTES,
	NOTES_MAX,
	PRIVACY_MAX,
	RELEASE_STATUS_LABELS,
	SUBTITLE_MAX,
	SUMMARY_MAX,
	SYSTEM_NAME_MAX,
	THEME_PREFERENCE_LABELS,
	createReleaseDraft,
	deleteReleaseDraft,
	discardPrivacyDraft,
	formatSettingsTime,
	getCurrentRelease,
	getSortedReleases,
	publishPrivacyDraft,
	publishRelease,
	saveAppearanceDefaults,
	saveBrand,
	savePrivacyDraft,
	settingsState,
	updateRelease,
	validateLogoFile,
	type AppearanceDefaults,
	type BrandSettings,
	type FieldErrors,
	type PrivacyPolicy,
} from '@/mocks/systemSettings'
import { diffLines } from '@/utils/lineDiff'
import { useAppStore } from '@/stores/app'
import type { ThemePreference } from '@/theme'
import { BackdropImageError, readBackdropImage } from '@/utils/imagePalette'
import { useToastStore } from '@/stores/toast'

type SettingsTab = 'brand' | 'appearance' | 'releases' | 'privacy'
const tabs: SettingsTab[] = ['brand', 'appearance', 'releases', 'privacy']

const route = useRoute()
const router = useRouter()
const theme = useTheme()
const appStore = useAppStore()

const activeTab = ref<SettingsTab>(tabs.find((tab) => tab === route.query.tab) ?? 'brand')
watch(() => route.query.tab, (tab) => { activeTab.value = tabs.find((item) => item === tab) ?? 'brand' })
watch(activeTab, (tab) => {
	const next = tab === 'brand' ? undefined : tab
	if (next !== route.query.tab) router.replace({ query: { ...route.query, tab: next } })
})

const toastStore = useToastStore()
function notify(text: string, tone: 'success' | 'error' | 'warning' = 'success'): void {
	toastStore.show(text, tone)
}

// > 品牌外觀

const brandForm = reactive<BrandSettings>({ ...settingsState.brand })
const brandErrors = ref<FieldErrors>({})
const logoError = ref('')
const logoInput = ref<HTMLInputElement | null>(null)
const brandDirty = computed(() => (Object.keys(brandForm) as Array<keyof BrandSettings>).some((key) => brandForm[key] !== settingsState.brand[key]))
const previewLogo = computed(() => brandForm.logoDataUrl ?? brandLogoUrl)

function onLogoSelected(event: Event): void {
	const input = event.target as HTMLInputElement
	const file = input.files?.[0]
	input.value = ''
	if (!file) return
	const error = validateLogoFile(file)
	logoError.value = error ?? ''
	if (error) return
	const reader = new FileReader()
	reader.onload = () => {
		brandForm.logoDataUrl = String(reader.result)
		brandForm.logoFileName = file.name
	}
	reader.onerror = () => { logoError.value = '讀取圖檔失敗，請重新選擇。' }
	reader.readAsDataURL(file)
}

function resetLogo(): void {
	brandForm.logoDataUrl = null
	brandForm.logoFileName = null
	logoError.value = ''
}

function submitBrand(): void {
	const result = saveBrand(brandForm)
	if (!result.ok) {
		brandErrors.value = result.errors
		notify('品牌外觀有欄位需要修正。', 'error')
		return
	}
	brandErrors.value = {}
	Object.assign(brandForm, settingsState.brand)
	// @ 瀏覽器標題只在換頁時更新，這裡補一次讓目前分頁立即反映
	document.title = `${String(route.meta.title)}｜${settingsState.brand.systemName}`
	notify('品牌外觀已發布，前台與後台側欄、登入頁、瀏覽器分頁標題都已更新。')
}

function revertBrand(): void {
	Object.assign(brandForm, settingsState.brand)
	brandErrors.value = {}
	logoError.value = ''
}

// > 預設外觀

const appearanceForm = reactive<AppearanceDefaults>({ ...settingsState.appearance })
const appearanceDirty = computed(() => appearanceForm.themePreference !== settingsState.appearance.themePreference || appearanceForm.backdrop?.imageUrl !== settingsState.appearance.backdrop?.imageUrl)
const preferences = Object.keys(THEME_PREFERENCE_LABELS) as ThemePreference[]

const backdropInput = ref<HTMLInputElement | null>(null)
const backdropError = ref('')
const isBackdropLoading = ref(false)

async function onBackdropSelected(event: Event): Promise<void> {
	const input = event.target as HTMLInputElement
	const file = input.files?.[0]
	// @ 清空讓同一個檔案可以再選一次
	input.value = ''
	if (!file) return
	backdropError.value = ''
	isBackdropLoading.value = true
	try {
		const { imageUrl, palette } = await readBackdropImage(file)
		appearanceForm.backdrop = { imageUrl, fileName: file.name, palette }
	} catch (error) {
		backdropError.value = error instanceof BackdropImageError ? error.message : '圖片處理失敗，請換一張再試。'
	} finally {
		isBackdropLoading.value = false
	}
}

function removeBackdrop(): void {
	appearanceForm.backdrop = null
	backdropError.value = ''
}

function revertAppearance(): void {
	Object.assign(appearanceForm, settingsState.appearance)
	backdropError.value = ''
}

function submitAppearance(): void {
	const saveError = saveAppearanceDefaults(appearanceForm)
	if (saveError) {
		backdropError.value = saveError
		return
	}
	// @ 管理者自己的畫面同步套用，才能立即確認效果
	appStore.setBackdrop(theme, appearanceForm.backdrop)
	appStore.setThemePreference(theme, appearanceForm.themePreference)
	notify(appearanceForm.backdrop ? '預設外觀已儲存，背景圖與配色已套用到所有使用者。' : '預設外觀已儲存，並已套用到你目前的畫面。')
}

// > 版本

const releases = computed(() => getSortedReleases())
const currentRelease = computed(() => getCurrentRelease())
const selectedReleaseId = ref<string | 'new' | null>(releases.value[0]?.id ?? null)
const selectedRelease = computed(() => settingsState.releases.find((item) => item.id === selectedReleaseId.value) ?? null)
const releaseForm = reactive({ version: '', summary: '', notes: '' })
const releaseErrors = ref<FieldErrors>({})
const confirmDeleteRelease = ref(false)

function loadReleaseForm(): void {
	releaseErrors.value = {}
	const release = selectedRelease.value
	if (release) Object.assign(releaseForm, { version: release.version, summary: release.summary, notes: release.notes })
	else Object.assign(releaseForm, { version: suggestNextVersion(), summary: '', notes: '' })
}

function suggestNextVersion(): string {
	const latest = releases.value[0]?.version ?? '0.0.0'
	const [major, minor] = latest.split('.').map(Number)
	return `${major}.${minor + 1}.0`
}

const releaseDirty = computed(() => {
	const release = selectedRelease.value
	if (selectedReleaseId.value === 'new') return Boolean(releaseForm.summary.trim() || releaseForm.notes.trim())
	if (!release) return false
	return releaseForm.version !== release.version || releaseForm.summary !== release.summary || releaseForm.notes !== release.notes
})

// @ 切換版本前若有未儲存修改，先暫存目標並跳確認框
const pendingReleaseId = ref<string | null>(null)
function selectRelease(id: string | 'new'): void {
	if (id === selectedReleaseId.value) return
	if (releaseDirty.value) { pendingReleaseId.value = id; return }
	selectedReleaseId.value = id
}
function confirmSwitchRelease(): void {
	selectedReleaseId.value = pendingReleaseId.value
	pendingReleaseId.value = null
}
watch(selectedReleaseId, loadReleaseForm, { immediate: true })

function releaseInput() {
	return { version: releaseForm.version, summary: releaseForm.summary, notes: releaseForm.notes }
}

function submitRelease(): void {
	if (selectedReleaseId.value === 'new') {
		const result = createReleaseDraft(releaseInput())
		if (!result.ok) { releaseErrors.value = result.errors; return }
		selectedReleaseId.value = result.id
		notify(`已建立版本 ${releaseForm.version} 草稿，發布前使用者看不到。`)
		return
	}
	if (!selectedReleaseId.value) return
	const result = updateRelease(selectedReleaseId.value, releaseInput())
	if (!result.ok) { releaseErrors.value = result.errors; return }
	loadReleaseForm()
	notify('版本說明已儲存。')
}

function submitPublishRelease(): void {
	const id = selectedReleaseId.value
	if (!id || id === 'new') return
	// @ 有未儲存的修改時一併存檔再發布，不要求使用者先按儲存
	if (releaseDirty.value) {
		const saved = updateRelease(id, releaseInput())
		if (!saved.ok) { releaseErrors.value = saved.errors; return }
	}
	const result = publishRelease(id)
	if (!result.ok) { releaseErrors.value = result.errors; notify(Object.values(result.errors)[0], 'error'); return }
	notify(`版本 ${selectedRelease.value?.version} 已發布，使用者可在「帳號 › 版本與隱私」看到。`)
}

function submitDeleteRelease(): void {
	const id = selectedReleaseId.value
	confirmDeleteRelease.value = false
	if (!id || id === 'new') return
	const version = selectedRelease.value?.version
	const result = deleteReleaseDraft(id)
	if (!result.ok) { notify(Object.values(result.errors)[0], 'error'); return }
	selectedReleaseId.value = releases.value[0]?.id ?? null
	notify(`已刪除版本 ${version} 草稿。`)
}

// > 隱私權政策

const privacyText = ref(settingsState.privacyDraft?.content ?? settingsState.privacy.content)
const privacyError = ref('')
const privacySavedText = computed(() => settingsState.privacyDraft?.content ?? settingsState.privacy.content)
const privacyDirty = computed(() => privacyText.value.trim() !== privacySavedText.value)
const confirmPublishPrivacy = ref(false)
// @ 編輯區內容與已發布版本不同就能發布；發布時自動存成草稿再發布
const canPublishPrivacy = computed(() => Boolean(privacyText.value.trim()) && privacyText.value.trim() !== settingsState.privacy.content)

function submitPrivacyDraft(): void {
	const result = savePrivacyDraft(privacyText.value)
	if (!result.ok) { privacyError.value = result.errors.content; return }
	privacyError.value = ''
	privacyText.value = settingsState.privacyDraft?.content ?? privacyText.value
	notify('草稿已儲存，使用者仍看到目前發布的版本。')
}

function submitPublishPrivacy(): void {
	confirmPublishPrivacy.value = false
	const saved = savePrivacyDraft(privacyText.value)
	if (!saved.ok) { privacyError.value = saved.errors.content; return }
	privacyError.value = ''
	const result = publishPrivacyDraft()
	if (!result.ok) { notify(Object.values(result.errors)[0], 'warning'); return }
	notify(`隱私權政策第 ${settingsState.privacy.revision} 版已發布。`)
}

// > 隱私權歷史版本：唯讀檢視與比對，要恢復舊內容請複製到編輯區後重新發布
const viewingRevision = ref<PrivacyPolicy | null>(null)
const revisionMode = ref<'full' | 'diff'>('full')
const revisionDiff = computed(() => viewingRevision.value ? diffLines(viewingRevision.value.content, settingsState.privacy.content) : [])
const revisionDiffCount = computed(() => revisionDiff.value.filter((line) => line.type !== 'same').length)

function openRevision(revision: PrivacyPolicy): void {
	viewingRevision.value = revision
	revisionMode.value = 'full'
}

function copyRevisionToEditor(): void {
	const revision = viewingRevision.value
	if (!revision) return
	privacyText.value = revision.content
	viewingRevision.value = null
	notify(`已將第 ${revision.revision} 版內容放入編輯區，確認後按「發布」會成為第 ${settingsState.privacy.revision + 1} 版。`)
}

function submitDiscardPrivacy(): void {
	discardPrivacyDraft()
	privacyText.value = settingsState.privacy.content
	privacyError.value = ''
	notify('已捨棄草稿，編輯區還原為目前發布內容。')
}

// > 離開保護

const anyDirty = computed(() => brandDirty.value || appearanceDirty.value || releaseDirty.value || privacyDirty.value)
const leaveTarget = ref<string | null>(null)
let allowLeave = false
onBeforeRouteLeave((to) => {
	if (allowLeave || !anyDirty.value) return true
	leaveTarget.value = to.fullPath
	return false
})
function confirmLeave(): void {
	const target = leaveTarget.value
	leaveTarget.value = null
	if (!target) return
	allowLeave = true
	router.push(target)
}

const tabDirty = computed<Record<SettingsTab, boolean>>(() => ({ brand: brandDirty.value, appearance: appearanceDirty.value, releases: releaseDirty.value, privacy: privacyDirty.value }))
</script>

<template>
	<div class="page-shell">
		<PageHeader :title="String(route.meta.title)" description="品牌外觀、全公司預設外觀、版本公告與隱私權政策。發布後立即在前台生效。" />

		<VTabs v-model="activeTab" color="primary" show-arrows class="mb-5">
			<VTab value="brand">品牌外觀<span v-if="tabDirty.brand" class="dirty-dot" aria-label="有未儲存的修改" /></VTab>
			<VTab value="appearance">預設外觀<span v-if="tabDirty.appearance" class="dirty-dot" aria-label="有未儲存的修改" /></VTab>
			<VTab value="releases">版本公告<span v-if="tabDirty.releases" class="dirty-dot" aria-label="有未儲存的修改" /></VTab>
			<VTab value="privacy">隱私權政策<span v-if="tabDirty.privacy" class="dirty-dot" aria-label="有未儲存的修改" /><VChip v-if="settingsState.privacyDraft" size="x-small" variant="tonal" color="warning" class="ms-2">草稿</VChip></VTab>
		</VTabs>


		<VWindow v-model="activeTab">
			<!-- 品牌外觀 -->
			<VWindowItem value="brand">
				<div class="two-col">
					<form class="settings-pane" @submit.prevent="submitBrand">
						<h2 class="pane-heading">名稱與 Logo</h2>
						<VTextField v-model="brandForm.systemName" label="系統名稱" :counter="SYSTEM_NAME_MAX" :error-messages="brandErrors.systemName" hint="顯示在側欄、登入頁與瀏覽器分頁標題。" persistent-hint class="mb-3" />
						<div class="subtitle-grid mb-5">
							<VTextField v-model="brandForm.portalName" label="前台副標題" :counter="SUBTITLE_MAX" :error-messages="brandErrors.portalName" hint="一般使用者側欄與登入頁。" persistent-hint />
							<VTextField v-model="brandForm.adminName" label="後台副標題" :counter="SUBTITLE_MAX" :error-messages="brandErrors.adminName" hint="管理後台側欄。" persistent-hint />
						</div>

						<p class="field-label">Logo</p>
						<div class="logo-row">
							<img :src="previewLogo" alt="" class="logo-thumb" />
							<div class="logo-meta">
								<p class="text-body-2">{{ brandForm.logoFileName ?? '內建 Logo' }}</p>
								<p class="note">PNG、SVG 或 WebP，小於 {{ LOGO_MAX_BYTES / 1024 }} KB，建議正方形。</p>
							</div>
							<div class="logo-actions">
								<VBtn variant="outlined" size="small" prepend-icon="mdi-upload" @click="logoInput?.click()">選擇圖檔</VBtn>
								<VBtn v-if="brandForm.logoDataUrl" variant="text" size="small" @click="resetLogo">還原內建</VBtn>
							</div>
							<input ref="logoInput" type="file" accept="image/png,image/svg+xml,image/webp" class="d-none" aria-label="選擇 Logo 圖檔" @change="onLogoSelected" />
						</div>
						<p v-if="logoError" class="error-text" role="alert">{{ logoError }}</p>

						<div class="form-actions">
							<VBtn variant="text" :disabled="!brandDirty" @click="revertBrand">還原</VBtn>
							<VBtn type="submit" color="primary" :disabled="!brandDirty">發布品牌外觀</VBtn>
						</div>
					</form>

					<aside class="preview-pane" aria-label="品牌預覽">
						<p class="field-label">側欄左上角的樣子</p>
						<div class="preview-list">
							<div v-for="entry in [{ label: '前台', subtitle: brandForm.portalName }, { label: '管理後台', subtitle: brandForm.adminName }]" :key="entry.label">
								<p class="preview-caption">{{ entry.label }}</p>
								<div class="preview-sidebar">
									<img :src="previewLogo" alt="" class="preview-logo" />
									<div class="min-w-0">
										<p class="font-weight-bold text-truncate">{{ brandForm.systemName || '（未填）' }}</p>
										<p class="text-caption text-medium-emphasis text-truncate">{{ entry.subtitle || '（未填）' }}</p>
									</div>
								</div>
							</div>
						</div>
						<p class="field-label mt-5">瀏覽器分頁標題</p>
						<p class="note mb-2">格式為「頁面名稱｜系統名稱」，以首頁「搜尋」為例：</p>
						<div class="preview-tab"><img :src="previewLogo" alt="" class="preview-favicon" /><span>搜尋｜{{ brandForm.systemName || '（未填）' }}</span></div>
					</aside>
				</div>
			</VWindowItem>

			<!-- 預設外觀 -->
			<VWindowItem value="appearance">
				<form class="settings-pane narrow" @submit.prevent="submitAppearance">
					<h2 class="pane-heading">全公司預設外觀</h2>
					<p class="note mb-5">明暗模式是新使用者的預設值，使用者可在帳號頁自行更改；背景圖套用到所有使用者，只能在這裡設定。</p>
					<fieldset class="choice-group">
						<legend class="field-label">明暗模式</legend>
						<VBtnToggle v-model="appearanceForm.themePreference" mandatory color="primary" variant="outlined" divided density="comfortable">
							<VBtn v-for="preference in preferences" :key="preference" :value="preference">{{ THEME_PREFERENCE_LABELS[preference] }}</VBtn>
						</VBtnToggle>
					</fieldset>
					<fieldset class="choice-group">
						<legend class="field-label">背景圖</legend>
						<div class="logo-row">
							<div
								v-if="appearanceForm.backdrop"
								class="backdrop-thumb"
								:style="{ backgroundImage: `url(&quot;${appearanceForm.backdrop.imageUrl}&quot;)` }"
								role="img"
								aria-label="背景圖預覽"
							/>
							<div class="logo-meta">
								<p class="text-body-2">{{ appearanceForm.backdrop?.fileName ?? '未設定（使用預設配色）' }}</p>
								<p class="note">JPG、PNG 或 WebP，10 MB 以內。系統會從圖片取出主色，並自動確保文字清楚可讀。</p>
								<ul v-if="appearanceForm.backdrop" class="backdrop-swatches" aria-label="從圖片取出的顏色">
									<li
										v-for="(color, index) in appearanceForm.backdrop.palette.swatches"
										:key="color"
										:class="{ 'is-seed': index === 0 }"
										:style="{ background: color }"
										:title="index === 0 ? `主色來源 ${color}` : color"
									/>
								</ul>
							</div>
							<div class="logo-actions">
								<VBtn variant="outlined" size="small" prepend-icon="mdi-upload" :loading="isBackdropLoading" @click="backdropInput?.click()">{{ appearanceForm.backdrop ? '更換圖片' : '選擇圖片' }}</VBtn>
								<VBtn v-if="appearanceForm.backdrop" variant="text" size="small" @click="removeBackdrop">移除</VBtn>
							</div>
							<input ref="backdropInput" type="file" accept="image/jpeg,image/png,image/webp" class="d-none" aria-label="選擇背景圖" @change="onBackdropSelected" />
						</div>
						<p v-if="backdropError" class="error-text" role="alert">{{ backdropError }}</p>
					</fieldset>
					<div class="form-actions">
						<VBtn variant="text" :disabled="!appearanceDirty" @click="revertAppearance">還原</VBtn>
						<VBtn type="submit" color="primary" :disabled="!appearanceDirty">儲存預設外觀</VBtn>
					</div>
				</form>
			</VWindowItem>

			<!-- 版本公告 -->
			<VWindowItem value="releases">
				<div class="split">
					<div class="list-pane">
						<VBtn block color="primary" variant="tonal" prepend-icon="mdi-plus" class="mb-3" @click="selectRelease('new')">新增版本</VBtn>
						<ul class="item-list" aria-label="版本清單">
							<li v-if="selectedReleaseId === 'new'">
								<button type="button" class="item-row is-active" aria-current="true"><span class="item-top"><strong>{{ releaseForm.version || '新版本' }}</strong><VChip size="x-small" variant="tonal">未儲存</VChip></span></button>
							</li>
							<li v-for="release in releases" :key="release.id">
								<button type="button" class="item-row" :class="{ 'is-active': release.id === selectedReleaseId }" :aria-current="release.id === selectedReleaseId" @click="selectRelease(release.id)">
									<span class="item-top">
										<strong>{{ release.version }}</strong>
										<VChip size="x-small" variant="tonal" :color="release.status === 'draft' ? 'warning' : release.id === currentRelease?.id ? 'primary' : undefined">{{ release.id === currentRelease?.id ? '目前版本' : RELEASE_STATUS_LABELS[release.status] }}</VChip>
									</span>
									<span class="item-sub">{{ release.status === 'draft' ? '尚未發布' : `發布於 ${release.date}` }}</span>
								</button>
							</li>
						</ul>
					</div>

					<form v-if="selectedReleaseId" class="detail-pane" @submit.prevent="submitRelease">
						<div class="detail-head">
							<div>
								<h2 class="pane-heading mb-0">{{ selectedReleaseId === 'new' ? '新增版本' : `版本 ${selectedRelease?.version}` }}</h2>
								<p class="note">{{ selectedRelease?.status === 'published' ? `已於 ${selectedRelease.date} 發布，版本號已鎖定，只能修正說明。` : '草稿只有管理者看得到，發布後才會出現在使用者的版本紀錄。' }}</p>
							</div>
							<VBtn v-if="selectedRelease?.status === 'draft'" variant="text" color="error" size="small" prepend-icon="mdi-delete-outline" @click="confirmDeleteRelease = true">刪除草稿</VBtn>
						</div>
						<VTextField v-model="releaseForm.version" label="版本號" placeholder="0.3.0" :disabled="selectedRelease?.status === 'published'" :error-messages="releaseErrors.version" class="version-field mb-2" />
						<VTextField v-model="releaseForm.summary" label="摘要" :counter="SUMMARY_MAX" :error-messages="releaseErrors.summary" class="mb-2" />
						<MarkdownEditor v-model="releaseForm.notes" label="更新內容" :rows="8" :counter="NOTES_MAX" :error-messages="releaseErrors.notes" :heading-offset="3" />
						<p v-if="releaseErrors.form" class="error-text" role="alert">{{ releaseErrors.form }}</p>
						<div class="form-actions">
							<VBtn variant="text" :disabled="!releaseDirty" @click="loadReleaseForm">還原</VBtn>
							<VBtn type="submit" :variant="selectedRelease?.status === 'draft' ? 'outlined' : 'flat'" :color="selectedRelease?.status === 'draft' ? undefined : 'primary'" :disabled="!releaseDirty">{{ selectedReleaseId === 'new' ? '建立草稿' : '儲存' }}</VBtn>
							<VBtn v-if="selectedRelease?.status === 'draft'" color="primary" prepend-icon="mdi-send-outline" @click="submitPublishRelease">發布版本</VBtn>
						</div>
					</form>
					<p v-else class="empty-note">尚無版本，點「新增版本」建立第一筆公告。</p>
				</div>
			</VWindowItem>

			<!-- 隱私權政策 -->
			<VWindowItem value="privacy">
				<div class="privacy-status mb-4">
					<p class="text-body-2">目前發布：第 {{ settingsState.privacy.revision }} 版 · {{ formatSettingsTime(settingsState.privacy.publishedAt) }} · {{ settingsState.privacy.publishedBy }}</p>
					<p v-if="settingsState.privacyDraft" class="text-body-2 text-warning">草稿由 {{ settingsState.privacyDraft.updatedBy }} 於 {{ formatSettingsTime(settingsState.privacyDraft.updatedAt) }} 儲存，尚未發布。</p>
				</div>
				<div class="settings-pane privacy-pane">
					<MarkdownEditor v-model="privacyText" label="隱私權暨個人資料保護政策" :rows="16" :counter="PRIVACY_MAX" :error-messages="privacyError" />
					<div class="form-actions">
						<VBtn v-if="settingsState.privacyDraft" variant="text" color="error" @click="submitDiscardPrivacy">捨棄草稿</VBtn>
						<VBtn variant="outlined" :disabled="!privacyDirty" @click="submitPrivacyDraft">儲存草稿</VBtn>
						<VBtn color="primary" :disabled="!canPublishPrivacy" @click="confirmPublishPrivacy = true">發布</VBtn>
					</div>
					<p v-if="!canPublishPrivacy" class="note text-end mt-2">內容與目前發布的第 {{ settingsState.privacy.revision }} 版相同，修改後即可發布。</p>
				</div>

				<section class="settings-pane privacy-pane mt-5" aria-labelledby="privacy-history-heading">
					<h2 id="privacy-history-heading" class="pane-heading">歷史版本</h2>
					<ul class="revision-list">
						<li class="revision-row">
							<span class="revision-name">第 {{ settingsState.privacy.revision }} 版</span>
							<VChip size="x-small" variant="tonal" color="primary">目前版本</VChip>
							<span class="revision-meta">{{ formatSettingsTime(settingsState.privacy.publishedAt) }} · {{ settingsState.privacy.publishedBy }}</span>
						</li>
						<li v-for="revision in settingsState.privacyHistory" :key="revision.revision" class="revision-row">
							<span class="revision-name">第 {{ revision.revision }} 版</span>
							<span class="revision-meta">{{ formatSettingsTime(revision.publishedAt) }} · {{ revision.publishedBy }}</span>
							<VBtn variant="text" size="small" class="ms-auto" @click="openRevision(revision)">查看</VBtn>
						</li>
					</ul>
					<p v-if="!settingsState.privacyHistory.length" class="note mt-2">還沒有舊版本。發布新版後，被取代的版本會保留在這裡。</p>
				</section>
			</VWindowItem>
		</VWindow>

		<VDialog :model-value="Boolean(viewingRevision)" max-width="760" scrollable @update:model-value="viewingRevision = null">
			<VCard v-if="viewingRevision">
				<VCardTitle class="pa-6 pb-1">隱私權政策第 {{ viewingRevision.revision }} 版</VCardTitle>
				<VCardSubtitle class="px-6">{{ formatSettingsTime(viewingRevision.publishedAt) }} 由 {{ viewingRevision.publishedBy }} 發布 · 已被取代，僅供查閱</VCardSubtitle>
				<div class="px-6 pt-4">
					<VBtnToggle v-model="revisionMode" mandatory density="compact" variant="outlined" divided color="primary">
						<VBtn value="full" size="small">全文</VBtn>
						<VBtn value="diff" size="small">與目前版本比對</VBtn>
					</VBtnToggle>
				</div>
				<VCardText class="pa-6">
					<MarkdownContent v-if="revisionMode === 'full'" :content="viewingRevision.content" />
					<template v-else>
						<p class="note mb-3">相對於目前第 {{ settingsState.privacy.revision }} 版：<span class="diff-legend diff-removed">刪除</span><span class="diff-legend diff-added">新增</span>共 {{ revisionDiffCount }} 行不同。</p>
						<ol class="diff-view" aria-label="逐行差異">
							<li v-for="(line, index) in revisionDiff" :key="index" :class="`diff-${line.type}`"><span class="diff-sign" aria-hidden="true">{{ line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' ' }}</span><span class="sr-only">{{ line.type === 'added' ? '新增：' : line.type === 'removed' ? '刪除：' : '' }}</span>{{ line.text || ' ' }}</li>
						</ol>
					</template>
				</VCardText>
				<VCardActions class="pa-5">
					<VBtn variant="text" prepend-icon="mdi-content-copy" @click="copyRevisionToEditor">複製到編輯區</VBtn>
					<VSpacer />
					<VBtn color="primary" variant="flat" @click="viewingRevision = null">關閉</VBtn>
				</VCardActions>
			</VCard>
		</VDialog>
		<VDialog v-model="confirmDeleteRelease" max-width="440">
			<VCard>
				<VCardTitle class="pa-6 pb-2">刪除版本 {{ selectedRelease?.version }} 草稿？</VCardTitle>
				<VCardText class="pa-6 pt-2">草稿內容會一併刪除，無法復原。</VCardText>
				<VCardActions class="pa-5"><VSpacer /><VBtn @click="confirmDeleteRelease = false">取消</VBtn><VBtn color="error" variant="flat" @click="submitDeleteRelease">刪除</VBtn></VCardActions>
			</VCard>
		</VDialog>
		<VDialog v-model="confirmPublishPrivacy" max-width="480">
			<VCard>
				<VCardTitle class="pa-6 pb-2">發布隱私權政策第 {{ settingsState.privacy.revision + 1 }} 版？</VCardTitle>
				<VCardText class="pa-6 pt-2">發布後所有使用者立即看到新內容，舊版會被取代。</VCardText>
				<VCardActions class="pa-5"><VSpacer /><VBtn @click="confirmPublishPrivacy = false">取消</VBtn><VBtn color="primary" variant="flat" @click="submitPublishPrivacy">發布</VBtn></VCardActions>
			</VCard>
		</VDialog>
		<VDialog :model-value="Boolean(pendingReleaseId)" max-width="440" @update:model-value="pendingReleaseId = null">
			<VCard>
				<VCardTitle class="pa-6 pb-2">放棄這個版本的修改？</VCardTitle>
				<VCardText class="pa-6 pt-2">切換後尚未儲存的內容會遺失。</VCardText>
				<VCardActions class="pa-5"><VSpacer /><VBtn @click="pendingReleaseId = null">繼續編輯</VBtn><VBtn color="error" variant="flat" @click="confirmSwitchRelease">放棄並切換</VBtn></VCardActions>
			</VCard>
		</VDialog>
		<VDialog :model-value="Boolean(leaveTarget)" max-width="440" @update:model-value="leaveTarget = null">
			<VCard>
				<VCardTitle class="pa-6 pb-2">有未儲存的設定</VCardTitle>
				<VCardText class="pa-6 pt-2">離開後這些修改會遺失。</VCardText>
				<VCardActions class="pa-5"><VSpacer /><VBtn @click="leaveTarget = null">留在這頁</VBtn><VBtn color="error" variant="flat" @click="confirmLeave">放棄修改並離開</VBtn></VCardActions>
			</VCard>
		</VDialog>
	</div>
</template>

<style scoped src="@/components/access-panel.css"></style>
<style scoped>
.two-col { display: grid; grid-template-columns: minmax(0, 3fr) minmax(260px, 2fr); gap: 20px; align-items: start; }
.settings-pane, .preview-pane { border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); border-radius: 12px; padding: 20px 24px; min-width: 0; }
.settings-pane.narrow { max-width: 640px; }
.preview-pane { background: rgb(var(--v-theme-background)); }
.pane-heading { font-size: 1rem; font-weight: 600; margin-bottom: 16px; }
.field-label { font-size: 0.8125rem; font-weight: 600; margin-bottom: 8px; color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)); }
.form-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 20px; }
.error-text { color: rgb(var(--v-theme-error)); font-size: 0.8125rem; margin-top: 8px; }
.dirty-dot { width: 6px; height: 6px; border-radius: 50%; background: rgb(var(--v-theme-warning)); margin-inline-start: 6px; }
.logo-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.logo-thumb { width: 48px; height: 48px; object-fit: contain; border-radius: 8px; border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); padding: 4px; background: rgb(var(--v-theme-surface)); }
.logo-meta { flex: 1; min-width: 160px; }
.logo-actions { display: flex; gap: 4px; }
.backdrop-thumb { width: 120px; max-width: 100%; aspect-ratio: 16 / 10; border-radius: 8px; border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); background-position: center; background-size: cover; }
.backdrop-swatches { display: flex; gap: 4px; margin: 6px 0 0; padding: 0; list-style: none; }
.backdrop-swatches li { width: 22px; height: 22px; border-radius: 5px; border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); }
.backdrop-swatches li.is-seed { outline: 2px solid rgb(var(--v-theme-on-surface)); outline-offset: 1px; }
.preview-sidebar { display: flex; align-items: center; gap: 12px; padding: 16px; border-radius: 10px; background: rgb(var(--v-theme-surface)); border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); }
.preview-logo { width: 36px; height: 36px; object-fit: contain; }
.preview-list { display: grid; gap: 12px; }
.preview-caption { font-size: 0.75rem; color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)); margin-bottom: 4px; }
.min-w-0 { min-width: 0; }
.preview-tab { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 8px 8px 0 0; background: rgb(var(--v-theme-surface)); border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); border-bottom: 0; width: fit-content; max-width: 100%; font-size: 0.8125rem; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.preview-favicon { width: 16px; height: 16px; object-fit: contain; flex: none; }
.subtitle-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.privacy-pane { max-width: 860px; }
.revision-list { list-style: none; padding: 0; margin: 0; }
.revision-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; min-height: 44px; padding: 6px 0; border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); }
.revision-row:last-child { border-bottom: 0; }
.revision-name { font-weight: 600; font-variant-numeric: tabular-nums; }
.revision-meta { font-size: 0.8125rem; font-variant-numeric: tabular-nums; color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)); }
.diff-view { list-style: none; padding: 0; margin: 0; border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); border-radius: 8px; overflow: hidden; font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; font-size: 0.8125rem; line-height: 1.7; }
.diff-view li { padding: 1px 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
.diff-sign { display: inline-block; width: 1.5em; user-select: none; }
.diff-added { background: rgba(var(--v-theme-success), 0.12); }
.diff-removed { background: rgba(var(--v-theme-error), 0.1); text-decoration: line-through; text-decoration-color: rgba(var(--v-theme-error), 0.5); }
.diff-legend { display: inline-block; padding: 0 6px; margin-inline: 4px; border-radius: 4px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.choice-group { border: 0; padding: 0; margin: 0 0 20px; }
.version-field { max-width: 220px; }
.privacy-status { display: flex; flex-direction: column; gap: 2px; }
@media (max-width: 860px) {
	.two-col { grid-template-columns: 1fr; }
	.settings-pane, .preview-pane { padding: 16px; }
	.subtitle-grid { grid-template-columns: 1fr; }
}
</style>

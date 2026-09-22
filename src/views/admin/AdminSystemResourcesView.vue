<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import FilterSearchField from '@/components/FilterSearchField.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import PageHeader from '@/components/PageHeader.vue'
import {
	aiConnections,
	aiProfiles,
	createProfileDraft,
	deleteProfile,
	describeProfile,
	getConnection,
	getProfile,
	getProfileUsages,
	resourceKindLabels,
	saveProfile,
	testConnection,
	testProfile,
	type AiProfile,
	type ConnectionStatus,
	type ResourceKind,
} from '@/repositories/systemResources.repository'
import { countProfileStrategyReferences } from '@/repositories/documents.repository'
import { useToastStore } from '@/stores/toast'

type ResourceTab = 'profiles' | 'connections'

const kinds: ResourceKind[] = ['llm', 'embedding', 'reranker', 'parser']
const statusMeta: Record<ConnectionStatus, { label: string; icon: string; color: string }> = {
	ok: { label: '連線正常', icon: 'mdi-check-circle-outline', color: 'success' },
	untested: { label: '尚未測試', icon: 'mdi-help-circle-outline', color: 'secondary' },
	error: { label: '連線異常', icon: 'mdi-alert-circle-outline', color: 'error' },
}
const contextWindowOptions = [8000, 16000, 32000, 128000].map((value) => ({ title: `${value / 1000}K`, value }))
const ocrLanguageOptions = ['繁體中文＋英文', '繁體中文', '英文', '日文']
const dpiOptions = [150, 200, 300]
const connectionHeaders = [
	{ title: '連線', key: 'name' },
	{ title: '端點', key: 'endpointHint', width: 220 },
	{ title: '狀態', key: 'status', width: 210 },
	{ title: '', key: 'actions', width: 120, align: 'end' as const, sortable: false },
]

type StatusFilter = 'all' | 'issue' | 'unused'

const profileTestMeta: Record<ConnectionStatus, { label: string; icon: string; color: string }> = {
	ok: { label: '測試通過', icon: 'mdi-check-circle-outline', color: 'success' },
	untested: { label: '尚未測試', icon: 'mdi-help-circle-outline', color: 'secondary' },
	error: { label: '測試失敗', icon: 'mdi-alert-circle-outline', color: 'error' },
}

const route = useRoute()
const router = useRouter()
const editorRef = ref<HTMLElement | null>(null)
const isTesting = ref(false)

// > 清單篩選：設定檔超過十幾個時，靠搜尋與篩選快速定位
const search = ref('')
const kindFilter = ref<ResourceKind | 'all'>('all')
const statusFilter = ref<StatusFilter>('all')

const activeTab = ref<ResourceTab>('profiles')
const selectedId = ref<string>(aiProfiles[0]?.id ?? '')
const draft = ref<AiProfile | null>(null)
const isNew = ref(false)
const formError = ref('')
const toastStore = useToastStore()
function notify(text: string, tone: 'success' | 'error' | 'warning' | 'info' = 'success'): void {
	toastStore.show(text, tone)
}
const deleteTarget = ref<AiProfile | null>(null)

const selected = computed(() => getProfile(selectedId.value))
const draftConnection = computed(() => (draft.value ? getConnection(draft.value.connectionId) : undefined))
const connectionOptions = computed(() =>
	aiConnections
		.filter((connection) => draft.value && connection.kinds.includes(draft.value.kind))
		.map((connection) => ({ title: connection.name, value: connection.id, subtitle: `${connection.endpointHint} · ${statusMeta[connection.status].label}` })),
)
const draftUsages = computed(() => (draft.value && !isNew.value ? getProfileUsages(draft.value.id) : []))
const draftStrategyReferences = computed(() => (draft.value && !isNew.value ? countProfileStrategyReferences(draft.value.id) : 0))
const isDirty = computed(() => isNew.value || (draft.value && selected.value ? JSON.stringify(draft.value) !== JSON.stringify(selected.value) : false))
const deleteBlockers = computed(() => {
	const target = deleteTarget.value
	if (!target) return { usages: [], references: 0 }
	return { usages: getProfileUsages(target.id), references: countProfileStrategyReferences(target.id) }
})

watch(selected, (profile) => {
	if (isNew.value) return
	draft.value = cloneProfile(profile)
	formError.value = ''
}, { immediate: true })

/** 深拷貝成可編輯草稿，避免直接改到 reactive 原資料。 */
function cloneProfile(profile: AiProfile | undefined): AiProfile | null {
	return profile ? JSON.parse(JSON.stringify(profile)) as AiProfile : null
}

/** 連線異常或測試失敗都算需要處理；尚未測試另外標示。 */
function hasIssue(profile: AiProfile): boolean {
	return profile.testStatus === 'error' || getConnection(profile.connectionId)?.status === 'error'
}

const kindCounts = computed(() => Object.fromEntries(kinds.map((kind) => [kind, aiProfiles.filter((profile) => profile.kind === kind).length])) as Record<ResourceKind, number>)
const issueCount = computed(() => aiProfiles.filter(hasIssue).length)
const unusedCount = computed(() => aiProfiles.filter((profile) => !getProfileUsages(profile.id).length).length)

const filteredProfiles = computed(() => {
	const keyword = search.value?.trim().toLocaleLowerCase('zh-TW') ?? ''
	return aiProfiles.filter((profile) => {
		if (kindFilter.value !== 'all' && profile.kind !== kindFilter.value) return false
		if (statusFilter.value === 'issue' && !hasIssue(profile)) return false
		if (statusFilter.value === 'unused' && getProfileUsages(profile.id).length) return false
		if (!keyword) return true
		const haystack = [profile.name, profile.model, profile.description, getConnection(profile.connectionId)?.name ?? '', ...getProfileUsages(profile.id).map((usage) => usage.name)]
		return haystack.join(' ').toLocaleLowerCase('zh-TW').includes(keyword)
	})
})
const visibleKinds = computed(() => kinds.filter((kind) => filteredProfiles.value.some((profile) => profile.kind === kind)))
const hasActiveFilter = computed(() => Boolean(search.value?.trim()) || kindFilter.value !== 'all' || statusFilter.value !== 'all')

function profilesOf(kind: ResourceKind): AiProfile[] {
	return filteredProfiles.value.filter((profile) => profile.kind === kind)
}

function clearFilters(): void {
	search.value = ''
	kindFilter.value = 'all'
	statusFilter.value = 'all'
}

function selectProfile(profileId: string): void {
	isNew.value = false
	selectedId.value = profileId
	draft.value = cloneProfile(getProfile(profileId))
	formError.value = ''
	// @ 選取寫進網址，其他頁面可用 ?profile= 直接連到指定設定檔
	if (route.query.profile !== profileId) router.replace({ query: { ...route.query, profile: profileId } })
	// 單欄版面時編輯區在清單下方，捲過去避免使用者以為沒反應
	if (window.matchMedia('(max-width: 900px)').matches) nextTick(() => editorRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}

watch(() => route.query.profile, (profileId) => {
	if (typeof profileId !== 'string' || profileId === selectedId.value || !getProfile(profileId)) return
	activeTab.value = 'profiles'
	selectProfile(profileId)
	// 從其他頁面連過來時，清單可能很長，把選中的那一列捲進可見範圍
	nextTick(() => document.querySelector(`[data-testid="profile-row-${profileId}"]`)?.scrollIntoView({ block: 'nearest' }))
}, { immediate: true })

function runProfileTest(): void {
	const profile = selected.value
	if (!profile || isDirty.value) return
	isTesting.value = true
	// @ 假資料：模擬呼叫延遲，讓載入狀態看得見
	window.setTimeout(() => {
		const status = testProfile(profile.id)
		draft.value = cloneProfile(getProfile(profile.id))
		isTesting.value = false
		if (status === 'ok') notify(`「${profile.name}」測試通過。`)
		else notify(`「${profile.name}」測試失敗：${profile.testNote ?? '請確認設定。'}`, 'error')
	}, 600)
}

function startCreate(kind: ResourceKind): void {
	activeTab.value = 'profiles'
	isNew.value = true
	draft.value = createProfileDraft(kind)
	formError.value = ''
}

function resetDraft(): void {
	if (isNew.value) {
		isNew.value = false
		draft.value = cloneProfile(selected.value)
		return
	}
	selectProfile(selectedId.value)
}

function validate(profile: AiProfile): string {
	if (!profile.name.trim()) return '請輸入設定檔名稱，方便在其他頁面辨認。'
	if (aiProfiles.some((entry) => entry.id !== profile.id && entry.name.trim() === profile.name.trim())) return '已有同名設定檔，請換一個名稱。'
	if (!profile.model.trim()) return '請輸入模型名稱。'
	if (profile.kind === 'llm') {
		const { temperature, maxOutputTokens, contextWindow } = profile.params
		if (temperature < 0 || temperature > 1) return 'Temperature 必須介於 0 到 1。'
		if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 100 || maxOutputTokens >= contextWindow) return '最大輸出長度必須是 100 以上的整數，且小於上下文長度。'
	}
	if (profile.kind === 'reranker') {
		if (!Number.isInteger(profile.params.topN) || profile.params.topN < 1 || profile.params.topN > 100) return '保留筆數必須是 1 到 100 的整數。'
		if (!Number.isInteger(profile.params.timeoutSeconds) || profile.params.timeoutSeconds < 1 || profile.params.timeoutSeconds > 60) return '逾時秒數必須是 1 到 60 的整數。'
	}
	if (profile.kind === 'embedding') {
		if (!Number.isInteger(profile.params.dimensions) || profile.params.dimensions <= 0) return '向量維度必須是正整數。'
		if (!Number.isInteger(profile.params.batchSize) || profile.params.batchSize < 1 || profile.params.batchSize > 256) return '批次大小必須是 1 到 256 的整數。'
	}
	return ''
}

function save(): void {
	const profile = draft.value
	if (!profile) return
	formError.value = validate(profile)
	if (formError.value) return
	const affected = draftUsages.value.map((usage) => usage.name)
	saveProfile({ ...profile, name: profile.name.trim(), model: profile.model.trim() })
	const wasNew = isNew.value
	isNew.value = false
	selectedId.value = profile.id
	notify(wasNew
		? `已建立「${profile.name.trim()}」。到「AI 與檢索設定」或文件處理策略選用後才會生效。`
		: affected.length
			? `已儲存「${profile.name.trim()}」，${affected.join('、')}會一起套用；只影響之後的處理。`
			: `已儲存「${profile.name.trim()}」。`)
}

function confirmDelete(): void {
	const target = deleteTarget.value
	if (!target || deleteBlockers.value.usages.length || deleteBlockers.value.references) return
	deleteProfile(target.id)
	deleteTarget.value = null
	notify(`已刪除「${target.name}」。`)
	selectProfile(aiProfiles[0]?.id ?? '')
}

function runConnectionTest(connectionId: string): void {
	const connection = getConnection(connectionId)
	const status = testConnection(connectionId)
	if (status === 'ok') notify(`「${connection?.name}」連線正常。`)
	else notify(`「${connection?.name}」連線失敗：${connection?.statusNote ?? '請確認服務是否啟動。'}`, 'error')
}
</script>

<template>
	<div class="page-shell">
		<PageHeader eyebrow="AI 基礎資源" title="系統資源" description="語言模型、嵌入、Reranker、Docling 解析參數與服務連線只在這裡定義一次。各管理頁面只選用設定檔，修改一個設定檔，所有使用它的地方會一起更新。">
			<template #actions>
				<VMenu>
					<template #activator="{ props: menuProps }">
						<VBtn color="primary" prepend-icon="mdi-plus" append-icon="mdi-menu-down" v-bind="menuProps">新增設定檔</VBtn>
					</template>
					<VList density="compact">
						<VListItem v-for="kind in kinds" :key="kind" :title="resourceKindLabels[kind]" @click="startCreate(kind)" />
					</VList>
				</VMenu>
			</template>
		</PageHeader>

		<VTabs v-model="activeTab" color="primary" class="mb-5">
			<VTab value="profiles">設定檔</VTab>
			<VTab value="connections">
				服務連線
				<VIcon v-if="aiConnections.some((connection) => connection.status === 'error')" icon="mdi-alert-circle" color="error" size="16" class="ms-2" aria-label="有連線異常" />
			</VTab>
		</VTabs>

		<VWindow v-model="activeTab" class="resource-window">
			<VWindowItem value="profiles">
				<div class="resource-layout">
					<nav class="profile-index" aria-label="設定檔清單">
						<div class="index-tools">
							<FilterSearchField v-model="search" density="compact" placeholder="搜尋名稱、模型、服務商或用途" aria-label="搜尋設定檔" data-testid="profile-search" />
							<div class="filter-chips" role="group" aria-label="依類型篩選">
								<button type="button" class="filter-chip" :aria-pressed="kindFilter === 'all'" @click="kindFilter = 'all'">全部<span>{{ aiProfiles.length }}</span></button>
								<button v-for="kind in kinds" :key="kind" type="button" class="filter-chip" :aria-pressed="kindFilter === kind" @click="kindFilter = kind">{{ resourceKindLabels[kind] }}<span>{{ kindCounts[kind] }}</span></button>
							</div>
							<div class="filter-chips" role="group" aria-label="依狀態篩選">
								<button type="button" class="filter-chip" :aria-pressed="statusFilter === 'all'" @click="statusFilter = 'all'">不限狀態</button>
								<button type="button" class="filter-chip is-issue" :aria-pressed="statusFilter === 'issue'" :disabled="!issueCount" @click="statusFilter = 'issue'"><VIcon icon="mdi-alert-circle-outline" size="14" />需處理<span>{{ issueCount }}</span></button>
								<button type="button" class="filter-chip" :aria-pressed="statusFilter === 'unused'" @click="statusFilter = 'unused'">未使用<span>{{ unusedCount }}</span></button>
							</div>
						</div>
						<p class="result-count" aria-live="polite">
							{{ hasActiveFilter ? `符合 ${filteredProfiles.length} / ${aiProfiles.length} 個設定檔` : `共 ${aiProfiles.length} 個設定檔` }}
							<button v-if="hasActiveFilter" type="button" class="link-button" @click="clearFilters">清除條件</button>
						</p>
						<div class="index-scroll">
							<section v-for="kind in visibleKinds" :key="kind" class="profile-group">
								<h2 class="group-heading">{{ resourceKindLabels[kind] }}<span>{{ profilesOf(kind).length }}</span></h2>
								<ul>
									<li v-for="profile in profilesOf(kind)" :key="profile.id">
										<button
											type="button"
											class="profile-row"
											:class="{ 'is-selected': !isNew && profile.id === selectedId }"
											:aria-current="!isNew && profile.id === selectedId ? 'true' : undefined"
											:data-testid="`profile-row-${profile.id}`"
											@click="selectProfile(profile.id)"
										>
											<span class="profile-name">
												<span class="profile-name-text">{{ profile.name }}</span>
												<VIcon
													v-if="hasIssue(profile) || profile.testStatus === 'untested'"
													:icon="hasIssue(profile) ? 'mdi-alert-circle-outline' : 'mdi-help-circle-outline'"
													:color="hasIssue(profile) ? 'error' : undefined"
													:class="{ 'text-medium-emphasis': !hasIssue(profile) }"
													size="15"
													:aria-label="hasIssue(profile) ? '需處理' : '尚未測試'"
													:title="hasIssue(profile) ? (profile.testNote ?? '連線異常') : '尚未測試'"
												/>
											</span>
											<span class="profile-model">{{ getConnection(profile.connectionId)?.name }} · {{ profile.model }}</span>
											<span class="profile-usage" :class="{ 'is-unused': !getProfileUsages(profile.id).length }">
												{{ getProfileUsages(profile.id).map((usage) => usage.name).join('、') || '尚未被使用' }}
											</span>
										</button>
									</li>
								</ul>
							</section>
							<div v-if="!filteredProfiles.length" class="index-empty">
								<p>找不到符合條件的設定檔。</p>
								<VBtn variant="outlined" size="small" @click="clearFilters">清除條件</VBtn>
							</div>
						</div>
					</nav>

					<section v-if="draft" ref="editorRef" class="profile-editor" :aria-label="isNew ? '新增設定檔' : `編輯 ${draft.name}`">
						<header class="editor-head">
							<div>
								<p class="editor-kind">{{ resourceKindLabels[draft.kind] }}{{ isNew ? ' · 新設定檔' : ` · 更新於 ${draft.updatedAt}` }}</p>
								<h2 class="section-heading">{{ isNew ? '新增設定檔' : selected?.name }}</h2>
							</div>
							<VBtn v-if="!isNew" variant="text" color="error" size="small" prepend-icon="mdi-delete-outline" @click="deleteTarget = draft">刪除</VBtn>
						</header>

						<div v-if="!isNew" class="impact-strip">
							<span class="impact-label">使用中</span>
							<template v-if="draftUsages.length || draftStrategyReferences">
								<RouterLink v-for="usage in draftUsages" :key="usage.id" :to="usage.pagePath" :title="`在「${usage.pageLabel}」選用`" class="impact-chip">{{ usage.name }}</RouterLink>
								<span v-if="draftStrategyReferences" class="impact-chip is-plain">{{ draftStrategyReferences }} 組處理策略直接指定</span>
							</template>
							<span v-else class="text-medium-emphasis">沒有任何用途使用，可放心調整或刪除。</span>
						</div>

						<div v-if="!isNew && selected" class="test-strip" :class="`is-${selected.testStatus}`" data-testid="profile-test-strip">
							<VIcon :icon="profileTestMeta[selected.testStatus].icon" :color="profileTestMeta[selected.testStatus].color" size="20" />
							<div class="test-text">
								<strong>{{ profileTestMeta[selected.testStatus].label }}</strong>
								<span>{{ selected.testNote ?? (selected.testStatus === 'untested' ? '連線與模型名稱都確認可用後，才會標示為通過。' : `檢查於 ${selected.testedAt}`) }}</span>
							</div>
							<VBtn variant="outlined" size="small" prepend-icon="mdi-connection" :loading="isTesting" :disabled="isDirty" data-testid="profile-test" @click="runProfileTest">測試設定檔</VBtn>
							<p v-if="isDirty" class="test-dirty-hint">有尚未儲存的修改，儲存後才能測試新設定。</p>
						</div>

						<fieldset class="form-section">
							<legend>基本資料</legend>
							<div class="form-grid">
								<VTextField v-model="draft.name" label="設定檔名稱" maxlength="30" placeholder="其他頁面會以這個名稱顯示" />
								<VSelect v-model="draft.connectionId" :items="connectionOptions" :item-props="(item) => ({ subtitle: item.subtitle })" label="服務連線" />
							</div>
							<VTextField v-model="draft.description" label="用途說明" maxlength="60" placeholder="例如：品質優先，用於直接面對使用者的回答" />
							<VAlert v-if="draftConnection?.status === 'error'" type="error" variant="tonal" density="compact" class="mb-2">
								「{{ draftConnection.name }}」目前連線異常：{{ draftConnection.statusNote }}
								<template #append><VBtn variant="text" size="small" @click="activeTab = 'connections'">查看連線</VBtn></template>
							</VAlert>
						</fieldset>

						<fieldset v-if="draft.kind === 'llm'" class="form-section">
							<legend>模型參數</legend>
							<div class="form-grid">
								<VTextField v-model="draft.model" label="模型名稱" placeholder="gpt-4.1-mini" />
								<VSelect v-model="draft.params.contextWindow" :items="contextWindowOptions" label="上下文長度" />
							</div>
							<div class="form-grid">
								<div>
									<VSlider v-model="draft.params.temperature" label="Temperature" :min="0" :max="1" :step="0.1" thumb-label hide-details color="primary" />
									<p class="field-hint">越低回答越穩定；問答建議 0.1–0.3。</p>
								</div>
								<VTextField v-model.number="draft.params.maxOutputTokens" label="最大輸出長度（tokens）" type="number" />
							</div>
						</fieldset>

						<fieldset v-else-if="draft.kind === 'embedding'" class="form-section">
							<legend>模型參數</legend>
							<div class="form-grid">
								<VTextField v-model="draft.model" label="模型名稱" placeholder="text-embedding-3-large" />
								<VTextField v-model.number="draft.params.dimensions" label="向量維度" type="number" />
							</div>
							<VTextField v-model.number="draft.params.batchSize" label="批次大小" type="number" hint="一次送出的切塊數量，越大越快但越吃記憶體。" persistent-hint class="half-field" />
							<VAlert v-if="!isNew && draftUsages.length && selected?.kind === 'embedding' && (draft.model !== selected.model || draft.params.dimensions !== selected.params.dimensions)" type="warning" variant="tonal" density="compact" class="mt-4">
								更換嵌入模型或維度後，既有文件的向量與新提問不相容，必須重新向量化全部文件，搜尋品質才會恢復。
							</VAlert>
						</fieldset>

						<fieldset v-else-if="draft.kind === 'reranker'" class="form-section">
							<legend>模型參數</legend>
							<div class="form-grid">
								<VTextField v-model="draft.model" label="模型名稱" placeholder="rerank-multilingual-v3.0" />
								<VTextField v-model.number="draft.params.topN" label="保留筆數" type="number" hint="重新排序後留給回答使用的候選數" persistent-hint />
							</div>
							<VTextField v-model.number="draft.params.timeoutSeconds" label="逾時（秒）" type="number" hint="逾時會略過重新排序，直接使用原檢索順序" persistent-hint class="half-field mt-3" />
						</fieldset>

						<fieldset v-else class="form-section">
							<legend>解析參數</legend>
							<VRadioGroup v-model="draft.params.engine" inline hide-details class="mb-3" label="解析方式">
								<VRadio value="docling" label="Docling（保留版面與表格）" />
								<VRadio value="ocr" label="OCR 優先（掃描檔）" />
							</VRadioGroup>
							<div class="form-grid">
								<VSelect v-model="draft.params.ocrLanguage" :items="ocrLanguageOptions" label="辨識語言" />
								<VSelect v-model="draft.params.imageDpi" :items="dpiOptions" label="影像解析度（dpi）" hint="掃描檔建議 300" persistent-hint />
							</div>
							<VSwitch v-model="draft.params.tableStructure" label="辨識表格結構" color="primary" hide-details />
							<VTextField v-model="draft.model" label="顯示用引擎名稱" class="half-field mt-3" />
						</fieldset>

						<p v-if="formError" class="text-error text-body-2" role="alert">{{ formError }}</p>

						<footer class="editor-actions" :class="{ 'is-dirty': isDirty }">
							<span v-if="isDirty" class="dirty-note">
								{{ isNew ? '尚未建立' : draftUsages.length ? `儲存後會影響：${draftUsages.map((usage) => usage.name).join('、')}` : '尚未儲存' }}
							</span>
							<VSpacer />
							<VBtn variant="text" :disabled="!isDirty" @click="resetDraft">{{ isNew ? '取消' : '還原' }}</VBtn>
							<VBtn color="primary" :disabled="!isDirty" data-testid="profile-save" @click="save">{{ isNew ? '建立設定檔' : '儲存設定檔' }}</VBtn>
						</footer>
					</section>
				</div>
			</VWindowItem>

			<VWindowItem value="connections">
				<p class="text-body-2 text-medium-emphasis mb-4 reading-width">服務網址與 API Key 由後端安全保存，這裡只顯示主機名稱與連線狀態。新增或更換連線請聯絡系統維運人員。</p>
				<VCard class="surface-border overflow-hidden">
					<div class="table-scroll">
						<VDataTable :headers="connectionHeaders" :items="aiConnections" item-value="id" hide-default-footer>
							<template #item.name="{ item }">
								<div class="py-2">
									<p class="font-weight-medium">{{ item.name }}</p>
									<p class="text-caption text-medium-emphasis">{{ item.kinds.map((kind) => resourceKindLabels[kind]).join('、') }} · {{ aiProfiles.filter((profile) => profile.connectionId === item.id).length }} 個設定檔</p>
								</div>
							</template>
							<template #item.endpointHint="{ item }"><code class="endpoint">{{ item.endpointHint }}</code></template>
							<template #item.status="{ item }">
								<div class="py-2">
									<span class="status-line" :class="`text-${statusMeta[item.status].color}`"><VIcon :icon="statusMeta[item.status].icon" size="16" />{{ statusMeta[item.status].label }}</span>
									<p class="text-caption text-medium-emphasis">{{ item.statusNote ?? `檢查於 ${item.checkedAt}` }}</p>
								</div>
							</template>
							<template #item.actions="{ item }"><VBtn variant="outlined" size="small" @click="runConnectionTest(item.id)">測試連線</VBtn></template>
						</VDataTable>
					</div>
				</VCard>
			</VWindowItem>
		</VWindow>

		<ConfirmDialog
			:model-value="Boolean(deleteTarget)"
			:title="`刪除「${deleteTarget?.name ?? ''}」？`"
			:max-width="480"
			:hide-confirm="Boolean(deleteBlockers.usages.length)"
			:confirm-disabled="Boolean(deleteBlockers.references)"
			@update:model-value="deleteTarget = null"
			@confirm="confirmDelete"
		>
			<template #default>
				<template v-if="deleteBlockers.usages.length || deleteBlockers.references">
					<p class="mb-2">這個設定檔仍在使用中，無法刪除：</p>
					<ul class="blocker-list">
						<li v-for="usage in deleteBlockers.usages" :key="usage.id">用途「{{ usage.name }}」</li>
						<li v-if="deleteBlockers.references">{{ deleteBlockers.references }} 組處理策略直接指定</li>
					</ul>
					<p class="text-body-2 text-medium-emphasis mt-3">請先在「AI 與檢索設定」或文件處理策略改用其他設定檔。</p>
				</template>
				<p v-else>刪除後無法復原；已處理完成的文件不受影響。</p>
			</template>
			<template v-if="deleteBlockers.usages.length" #extra-actions>
				<VBtn color="primary" variant="tonal" :to="deleteBlockers.usages[0]!.pagePath">前往{{ deleteBlockers.usages[0]!.pageLabel }}</VBtn>
			</template>
		</ConfirmDialog>
	</div>
</template>

<style scoped>
.resource-window { overflow: visible; }

.resource-layout {
	display: grid;
	grid-template-columns: minmax(240px, 300px) minmax(0, 1fr);
	gap: var(--space-lg);
	align-items: start;
}

.profile-index {
	position: sticky;
	top: 80px;
	display: grid;
	gap: var(--space-lg);
}

.group-heading {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	margin: 0 0 var(--space-xs);
	padding: 0 10px;
	color: var(--ink-muted);
	font-size: 0.78rem;
	font-weight: 700;
}

.group-heading span { font-variant-numeric: tabular-nums; font-weight: 500; }

.profile-group ul { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }

.profile-row {
	display: grid;
	gap: 1px;
	width: 100%;
	padding: 10px;
	border-radius: var(--radius-sm);
	color: inherit;
	text-align: left;
	transition: background-color 160ms cubic-bezier(0.16, 1, 0.3, 1);
}

.profile-row:hover { background: rgb(var(--v-theme-on-surface) / 5%); }
.profile-row:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 1px; }
.profile-row.is-selected { background: rgb(var(--v-theme-primary) / 10%); }
.profile-row.is-selected .profile-name { color: rgb(var(--v-theme-primary)); }

.profile-name { display: flex; align-items: center; gap: 4px; font-size: 0.92rem; font-weight: 600; }
.profile-model { color: var(--ink-muted); font-size: 0.78rem; font-variant-numeric: tabular-nums; }
.profile-usage { overflow: hidden; color: var(--ink-subtle, var(--ink-muted)); font-size: 0.74rem; text-overflow: ellipsis; white-space: nowrap; }

.index-tools { display: grid; gap: var(--space-sm); }

.filter-chips { display: flex; flex-wrap: wrap; gap: 6px; }

.filter-chip {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	min-height: 32px;
	padding: 4px 10px;
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: 999px;
	color: inherit;
	font-size: 0.8rem;
	transition: background-color 160ms cubic-bezier(0.16, 1, 0.3, 1), border-color 160ms cubic-bezier(0.16, 1, 0.3, 1);
}

.filter-chip span { color: var(--ink-muted); font-variant-numeric: tabular-nums; }
.filter-chip:hover:not(:disabled) { background: rgb(var(--v-theme-on-surface) / 5%); }
.filter-chip:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 1px; }
.filter-chip:disabled { opacity: 0.5; cursor: not-allowed; }
.filter-chip[aria-pressed='true'] { border-color: rgb(var(--v-theme-primary)); background: rgb(var(--v-theme-primary) / 10%); color: rgb(var(--v-theme-primary)); font-weight: 600; }
.filter-chip[aria-pressed='true'] span { color: inherit; }
.filter-chip.is-issue:not([aria-pressed='true']) .v-icon { color: rgb(var(--v-theme-error)); }

.result-count { display: flex; align-items: center; justify-content: space-between; margin: 0; padding: 0 10px; color: var(--ink-muted); font-size: 0.78rem; }

.link-button { color: rgb(var(--v-theme-primary)); font-size: 0.78rem; text-decoration: underline; text-underline-offset: 2px; }
.link-button:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }

.index-scroll { display: grid; gap: var(--space-lg); padding-right: 4px; scrollbar-color: rgb(var(--v-theme-outline)) transparent; scrollbar-width: thin; }
.index-empty { display: grid; justify-items: start; gap: var(--space-sm); padding: var(--space-md) 10px; color: var(--ink-muted); font-size: 0.86rem; }
.index-empty p { margin: 0; }

.profile-name-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.profile-model { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.profile-usage.is-unused { opacity: 0.75; }

.test-strip {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--space-sm) 12px;
	margin-bottom: var(--space-lg);
	padding: 12px;
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-sm);
}

.test-strip.is-error { border-color: rgb(var(--v-theme-error) / 45%); background: rgb(var(--v-theme-error) / 6%); }
.test-strip.is-ok { border-color: rgb(var(--v-theme-success) / 40%); }
.test-text { display: grid; flex: 1 1 220px; gap: 1px; font-size: 0.84rem; }
.test-text span { color: var(--ink-muted); }
.test-dirty-hint { flex-basis: 100%; margin: 0; color: rgb(var(--v-theme-warning)); font-size: 0.78rem; }

.profile-editor {
	padding: var(--space-lg);
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-md);
	background: rgb(var(--v-theme-surface));
}

.editor-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-md); margin-bottom: var(--space-md); }
.editor-kind { margin: 0 0 2px; color: var(--ink-muted); font-size: 0.78rem; }

.impact-strip {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	margin-bottom: var(--space-lg);
	padding: 10px 12px;
	border-radius: var(--radius-sm);
	background: rgb(var(--v-theme-on-surface) / 4%);
	font-size: 0.84rem;
}

.impact-label { margin-right: 4px; color: var(--ink-muted); font-weight: 600; }

.impact-chip {
	padding: 2px 10px;
	border: 1px solid rgb(var(--v-theme-primary) / 35%);
	border-radius: 999px;
	color: rgb(var(--v-theme-primary));
	font-size: 0.8rem;
	text-decoration: none;
}

.impact-chip:hover { background: rgb(var(--v-theme-primary) / 8%); }
.impact-chip.is-plain { border-color: rgb(var(--v-theme-outline)); color: inherit; }

.form-section { margin: 0 0 var(--space-lg); padding: 0; border: 0; }
.form-section legend { margin-bottom: var(--space-sm); font-size: 0.92rem; font-weight: 700; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-sm) var(--space-md); }
.half-field { max-width: calc(50% - var(--space-md) / 2); }
.field-hint { margin: 0 0 var(--space-md); color: var(--ink-muted); font-size: 0.76rem; }

.editor-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--space-sm);
	margin: var(--space-md) calc(var(--space-lg) * -1) calc(var(--space-lg) * -1);
	padding: 12px var(--space-lg);
	border-top: 1px solid rgb(var(--v-theme-outline));
	border-radius: 0 0 var(--radius-md) var(--radius-md);
	background: rgb(var(--v-theme-surface));
}

.editor-actions.is-dirty { background: color-mix(in srgb, rgb(var(--v-theme-primary)) 6%, rgb(var(--v-theme-surface))); }
.dirty-note { font-size: 0.82rem; }

.table-scroll { overflow-x: auto; }
.table-scroll :deep(table) { min-width: 760px; }
.endpoint { font-size: 0.8rem; font-variant-numeric: tabular-nums; }
.status-line { display: inline-flex; align-items: center; gap: 4px; font-weight: 600; }
.blocker-list { margin: 0; padding-left: 1.2em; }

/* 只有左右雙欄時儲存列才黏在底部；單欄時隨內容排列，避免蓋住標題 */
@media (min-width: 901px) {
	.editor-actions { position: sticky; bottom: 0; }
	/* 清單自己捲動，設定檔再多也不會把篩選列推出畫面 */
	.index-scroll { max-height: calc(100vh - 330px); overflow-y: auto; }
}

@media (max-width: 900px) {
	.resource-layout { grid-template-columns: minmax(0, 1fr); }
	.profile-index { position: static; }
}

@media (max-width: 640px) {
	.form-grid { grid-template-columns: minmax(0, 1fr); }
	.half-field { max-width: none; }
	.profile-editor { padding: var(--space-md); }
	.editor-actions { margin: var(--space-md) calc(var(--space-md) * -1) calc(var(--space-md) * -1); padding: 12px var(--space-md); }
}
</style>

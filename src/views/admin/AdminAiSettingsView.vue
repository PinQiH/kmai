<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import ConfirmDialog from '@/components/ConfirmDialog.vue'
import PageHeader from '@/components/PageHeader.vue'
import { useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard'
import { useToastStore } from '@/stores/toast'
import {
	AGENT_TOOLS,
	AI_SETTINGS_LIMITS,
	AI_SETTINGS_TAB_OF,
	aiSettingsState,
	cloneAiSettings,
	diffAiSettings,
	normalizeGlossary,
	restoreAiSettingsRevision,
	saveAiSettings,
	validateAiSettings,
	type AiSettings,
	type AiSettingsSection,
	type AiSettingsTab,
} from '@/mocks/aiSettings'
import { CURRENT_HANDLER, formatDateTime } from '@/mocks/feedbackAdmin'
import { describeProfile, getProfile, getProfilesByKind, type ResourceKind } from '@/mocks/systemResources'

type FlowState = 'ok' | 'off' | 'dirty' | 'error'

interface FlowNode {
	section: AiSettingsSection
	label: string
	metric: string
	state: FlowState
}

const TABS: Array<{ id: AiSettingsTab; label: string; sections: AiSettingsSection[] }> = [
	{ id: 'retrieval', label: '檢索與引用', sections: ['routing', 'channels', 'merge', 'rerank', 'citation', 'generate'] },
	{ id: 'agent', label: '工具調度', sections: ['agent'] },
	{ id: 'content', label: '回答內容', sections: ['prompt', 'styles', 'glossary'] },
	{ id: 'history', label: '變更紀錄', sections: [] },
]
const L = AI_SETTINGS_LIMITS

const route = useRoute()

const draft = ref<AiSettings>(cloneAiSettings(aiSettingsState.current))
const activeTab = ref<AiSettingsTab>('retrieval')
const showErrors = ref(false)
const toastStore = useToastStore()
function notify(text: string, tone: 'success' | 'error' | 'warning' | 'info' = 'success'): void {
	toastStore.show(text, tone)
}
const confirmOpen = ref(false)
const saveNote = ref('')
const saveError = ref('')
const newTerm = ref('')
const restoreTargetId = ref<string | null>(null)

const baseline = computed(() => aiSettingsState.current)
const changes = computed(() => diffAiSettings(baseline.value, draft.value))
const isDirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(baseline.value))
const errors = computed(() => validateAiSettings(draft.value))
const visibleErrors = computed(() => (showErrors.value ? errors.value : channelsGuard.value))
// @ 兩個搜尋管道都關閉會讓問答完全失效，不等按儲存就提示
const channelsGuard = computed<Partial<Record<AiSettingsSection, string>>>(() => (errors.value.channels && !draft.value.channels.vectorEnabled && !draft.value.channels.keywordEnabled ? { channels: errors.value.channels } : {}))
const dirtySections = computed(() => new Set(changes.value.map((change) => change.section)))

function tabHasChanges(tab: (typeof TABS)[number]): boolean {
	return tab.sections.some((section) => dirtySections.value.has(section))
}

function tabHasErrors(tab: (typeof TABS)[number]): boolean {
	return tab.sections.some((section) => Boolean(visibleErrors.value[section]))
}

// > 選項

function profileItems(kind: ResourceKind) {
	return getProfilesByKind(kind).map((profile) => ({ title: profile.name, subtitle: describeProfile(profile), value: profile.id }))
}

const llmItems = computed(() => profileItems('llm'))
const rerankItems = computed(() => profileItems('reranker'))
const rerankProfile = computed(() => getProfile(draft.value.models.rerank))
const rerankKeep = computed(() => (rerankProfile.value?.kind === 'reranker' ? rerankProfile.value.params.topN : null))

// @ 介面以百分比呈現，資料維持 0–1 小數，與後端一致
const minScorePercent = computed({
	get: () => Math.round(draft.value.citation.minScore * 100),
	set: (value: number) => { draft.value.citation.minScore = Math.round(value) / 100 },
})
const vectorWeightPercent = computed({
	get: () => Math.round(draft.value.merge.vectorWeight * 100),
	set: (value: number) => { draft.value.merge.vectorWeight = Math.round(value) / 100 },
})
const bothChannels = computed(() => draft.value.channels.vectorEnabled && draft.value.channels.keywordEnabled)

// > 流程總覽：由目前草稿推導，點節點跳到對應區塊

const flowNodes = computed<FlowNode[]>(() => {
	const s = draft.value
	const stateOf = (section: AiSettingsSection, off = false): FlowState => (visibleErrors.value[section] ? 'error' : dirtySections.value.has(section) ? 'dirty' : off ? 'off' : 'ok')
	const channels = [s.channels.vectorEnabled ? `語意 ${s.channels.vectorTopK}` : '', s.channels.keywordEnabled ? `關鍵字 ${s.channels.keywordTopK}` : '', s.channels.graphEnabled ? '圖譜' : ''].filter(Boolean)
	return [
		{ section: 'routing', label: '問題路由', metric: [s.routing.localEnabled ? '單一主題' : '', s.routing.globalEnabled ? '跨文件' : ''].filter(Boolean).join('＋') || '未開啟', state: stateOf('routing') },
		{ section: 'channels', label: '搜尋管道', metric: channels.join(' · ') || '全部關閉', state: stateOf('channels') },
		{ section: 'merge', label: '合併候選', metric: bothChannels.value ? `${vectorWeightPercent.value}/${100 - vectorWeightPercent.value} · 上限 ${s.merge.candidateLimit}` : `上限 ${s.merge.candidateLimit}`, state: stateOf('merge') },
		{ section: 'rerank', label: '重新排序', metric: s.rerank.enabled ? (rerankProfile.value?.name ?? '未指定') : '已關閉', state: stateOf('rerank', !s.rerank.enabled) },
		{ section: 'citation', label: '決定引用', metric: `≥ ${minScorePercent.value}% · 最多 ${s.citation.limit}`, state: stateOf('citation') },
		{ section: 'generate', label: '生成回答', metric: getProfile(s.models.answer)?.name ?? '未指定', state: stateOf('generate') },
	]
})

const flowStateText: Record<FlowState, string> = { ok: '', off: '已關閉', dirty: '有未儲存變更', error: '需要修正' }

async function goToSection(section: AiSettingsSection): Promise<void> {
	activeTab.value = AI_SETTINGS_TAB_OF[section]
	await nextTick()
	const element = document.getElementById(`ai-section-${section}`)
	if (!element) return
	const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
	element.scrollIntoView?.({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
	element.querySelector<HTMLElement>('[data-section-focus]')?.focus({ preventScroll: true })
}

// @ 其他頁面（例如回饋案件）以 ?section=citation 直接連到指定區塊
watch(() => route.query.section, (section) => {
	if (typeof section === 'string' && section in AI_SETTINGS_TAB_OF) void goToSection(section as AiSettingsSection)
	else if (typeof route.query.tab === 'string' && TABS.some((tab) => tab.id === route.query.tab)) activeTab.value = route.query.tab as AiSettingsTab
}, { immediate: true })

// > 回答內容

function setDefaultStyle(styleId: string): void {
	for (const style of draft.value.prompts.styles) style.isDefault = style.id === styleId
}

function addTerm(): void {
	const term = newTerm.value.trim()
	if (!term) return
	draft.value.prompts.glossary = normalizeGlossary([...draft.value.prompts.glossary, term.slice(0, L.glossaryMaxLength)])
	newTerm.value = ''
}

function removeTerm(term: string): void {
	draft.value.prompts.glossary = draft.value.prompts.glossary.filter((item) => item !== term)
}

const newTermDuplicate = computed(() => {
	const key = newTerm.value.trim().toLocaleLowerCase('zh-TW')
	return Boolean(key) && draft.value.prompts.glossary.some((term) => term.toLocaleLowerCase('zh-TW') === key)
})

function toggleTool(toolId: (typeof AGENT_TOOLS)[number]['id'], enabled: boolean | null): void {
	const tools = draft.value.agent.tools.filter((id) => id !== toolId)
	draft.value.agent.tools = enabled ? AGENT_TOOLS.map((tool) => tool.id).filter((id) => id === toolId || tools.includes(id)) : tools
}

// > 儲存

function requestSave(): void {
	showErrors.value = true
	const firstError = (Object.keys(errors.value) as AiSettingsSection[])[0]
	if (firstError) {
		void goToSection(firstError)
		return
	}
	saveNote.value = ''
	saveError.value = ''
	confirmOpen.value = true
}

function confirmSave(): void {
	const result = saveAiSettings(draft.value, CURRENT_HANDLER, saveNote.value)
	if (!result.ok) {
		saveError.value = result.message
		return
	}
	draft.value = cloneAiSettings(aiSettingsState.current)
	confirmOpen.value = false
	showErrors.value = false
	notify(`已儲存 ${result.revision.changes.length} 項變更，之後的新提問會套用；已產生的回答不受影響。`)
}

function discard(): void {
	draft.value = cloneAiSettings(aiSettingsState.current)
	showErrors.value = false
	newTerm.value = ''
}

const restoreTarget = computed(() => aiSettingsState.revisions.find((revision) => revision.id === restoreTargetId.value))

function confirmRestore(): void {
	const target = restoreTargetId.value
	restoreTargetId.value = null
	if (!target) return
	const result = restoreAiSettingsRevision(target, CURRENT_HANDLER)
	if (!result.ok) {
		notify(result.message, 'error')
		return
	}
	draft.value = cloneAiSettings(aiSettingsState.current)
	notify(`已還原 ${result.revision.changes.length} 項設定，並記錄為一筆新的變更。`)
}

// > 離開保護

const leaveGuard = useUnsavedChangesGuard(() => isDirty.value)
</script>

<template>
	<div class="page-shell ai-settings">
		<PageHeader eyebrow="回答與檢索品質" title="AI 與檢索設定" description="決定收到提問後，系統怎麼找文件、採用哪些段落當引用，以及用什麼口吻回答。儲存後只影響之後的新提問。" />


		<nav class="flow-map" aria-label="回答流程總覽" data-testid="ai-flow-map">
			<ol>
				<li v-for="node in flowNodes" :key="node.section">
					<button type="button" class="flow-node" :class="`is-${node.state}`" :aria-label="[node.label, node.metric, flowStateText[node.state]].filter(Boolean).join('，')" :data-testid="`flow-${node.section}`" @click="goToSection(node.section)">
						<span class="flow-label">
							{{ node.label }}
							<VIcon v-if="node.state === 'error'" icon="mdi-alert-circle" size="14" color="error" aria-hidden="true" />
							<span v-else-if="node.state === 'dirty'" class="dirty-dot" aria-hidden="true" />
						</span>
						<span class="flow-metric">{{ node.metric }}</span>
					</button>
				</li>
			</ol>
		</nav>

		<VTabs v-model="activeTab" color="primary" show-arrows class="mb-5">
			<VTab v-for="tab in TABS" :key="tab.id" :value="tab.id" :data-testid="`tab-${tab.id}`">
				{{ tab.label }}
				<VIcon v-if="tabHasErrors(tab)" icon="mdi-alert-circle" color="error" size="16" class="ms-2" aria-label="需要修正" />
				<span v-else-if="tabHasChanges(tab)" class="dirty-dot ms-2" aria-label="有未儲存變更" />
				<VChip v-if="tab.id === 'history' && aiSettingsState.revisions.length" size="x-small" variant="tonal" class="ms-2">{{ aiSettingsState.revisions.length }}</VChip>
			</VTab>
		</VTabs>

		<VWindow v-model="activeTab" class="settings-window">
			<!-- > 檢索與引用：依問答實際執行順序排列 -->
			<VWindowItem value="retrieval">
				<div class="section-stack">
					<section id="ai-section-routing" class="setting-section" aria-labelledby="h-routing">
						<header class="section-head">
							<h2 id="h-routing" class="section-heading" tabindex="-1" data-section-focus>1. 問題路由</h2>
							<p>收到問題後先判斷要往單一主題深挖，還是跨多份文件盤點比較。兩條路線可同時開啟，由規劃模型自動選擇。</p>
						</header>
						<VSwitch v-model="draft.routing.localEnabled" color="primary" hide-details label="單一主題路線" />
						<p class="field-hint">適合「出差住宿上限多少」這類答案在一份文件內的問題。</p>
						<VSwitch v-model="draft.routing.globalEnabled" color="primary" hide-details label="跨文件路線" />
						<p class="field-hint">適合「各部門請假規定有什麼差異」這類需要彙整的問題，回應較慢。</p>
						<p v-if="visibleErrors.routing" class="section-error" role="alert">{{ visibleErrors.routing }}</p>
					</section>

					<section id="ai-section-channels" class="setting-section" aria-labelledby="h-channels">
						<header class="section-head">
							<h2 id="h-channels" class="section-heading" tabindex="-1" data-section-focus>2. 搜尋管道</h2>
							<p>語意搜尋擅長換句話說的問題；關鍵字搜尋擅長表單編號、產品名稱等精確字詞。建議兩者都開。</p>
						</header>
						<div class="channel-grid">
							<div class="channel-card" :class="{ 'is-off': !draft.channels.vectorEnabled }">
								<VSwitch v-model="draft.channels.vectorEnabled" color="primary" hide-details label="語意搜尋" />
								<VTextField v-model.number="draft.channels.vectorTopK" label="取回份數" type="number" :min="L.topK.min" :max="L.topK.max" :disabled="!draft.channels.vectorEnabled" density="compact" />
								<VCheckbox v-model="draft.channels.vectorIncludeOldVersions" label="包含已被取代的舊版本" density="compact" hide-details :disabled="!draft.channels.vectorEnabled" />
							</div>
							<div class="channel-card" :class="{ 'is-off': !draft.channels.keywordEnabled }">
								<VSwitch v-model="draft.channels.keywordEnabled" color="primary" hide-details label="關鍵字搜尋" />
								<VTextField v-model.number="draft.channels.keywordTopK" label="取回份數" type="number" :min="L.topK.min" :max="L.topK.max" :disabled="!draft.channels.keywordEnabled" density="compact" />
								<VCheckbox v-model="draft.channels.keywordIncludeOldVersions" label="包含已被取代的舊版本" density="compact" hide-details :disabled="!draft.channels.keywordEnabled" />
							</div>
						</div>
						<VSwitch v-model="draft.channels.graphEnabled" color="primary" hide-details label="知識圖譜擴充" class="mt-2" />
						<p class="field-hint">命中的段落會沿著圖譜帶入相關實體的段落，例如問「日支費」時一併找到「出差住宿」。</p>
						<p v-if="visibleErrors.channels" class="section-error" role="alert" data-testid="channels-error">{{ visibleErrors.channels }}</p>
					</section>

					<section id="ai-section-merge" class="setting-section" aria-labelledby="h-merge">
						<header class="section-head">
							<h2 id="h-merge" class="section-heading" tabindex="-1" data-section-focus>3. 合併候選</h2>
							<p>兩個管道的結果依權重合併，只保留分數最高的候選交給下一步。</p>
						</header>
						<div class="form-grid">
							<div>
								<VSlider v-model="vectorWeightPercent" :min="0" :max="100" :step="5" color="primary" hide-details :disabled="!bothChannels" label="語意權重" aria-label="語意搜尋權重" />
								<p class="field-hint">{{ bothChannels ? `語意 ${vectorWeightPercent}% · 關鍵字 ${100 - vectorWeightPercent}%` : '只開啟一個搜尋管道時不需要權重。' }}</p>
							</div>
							<VTextField v-model.number="draft.merge.candidateLimit" label="候選上限" type="number" :min="L.candidateLimit.min" :max="L.candidateLimit.max" hint="越多越不容易漏找，但重新排序會更慢" persistent-hint />
						</div>
						<p v-if="visibleErrors.merge" class="section-error" role="alert">{{ visibleErrors.merge }}</p>
					</section>

					<section id="ai-section-rerank" class="setting-section" aria-labelledby="h-rerank">
						<header class="section-head">
							<h2 id="h-rerank" class="section-heading" tabindex="-1" data-section-focus>4. 重新排序</h2>
							<p>用專門的模型重新評估每段候選與問題的相關程度，分數就是下一步引用門檻比對的依據。</p>
						</header>
						<VSwitch v-model="draft.rerank.enabled" color="primary" hide-details label="啟用重新排序" />
						<VAlert v-if="!draft.rerank.enabled" type="warning" variant="tonal" density="compact" class="my-2">關閉後直接使用合併分數，引用準確度通常會下降，引用門檻可能需要一起調整。</VAlert>
						<VSelect v-model="draft.models.rerank" :items="rerankItems" :item-props="(item) => ({ subtitle: item.subtitle })" label="重新排序模型" :disabled="!draft.rerank.enabled" class="mt-3" :hint="rerankKeep ? `排序後保留 ${rerankKeep} 筆，逾時會略過排序` : ''" persistent-hint />
						<RouterLink :to="{ path: '/admin/system-resources', query: { profile: draft.models.rerank } }" class="resource-link">在系統資源調整保留筆數與逾時</RouterLink>
						<p v-if="visibleErrors.rerank" class="section-error" role="alert">{{ visibleErrors.rerank }}</p>
					</section>

					<section id="ai-section-citation" class="setting-section" aria-labelledby="h-citation">
						<header class="section-head">
							<h2 id="h-citation" class="section-heading" tabindex="-1" data-section-focus>5. 決定引用</h2>
							<p>分數達門檻的段落才會成為引用並交給模型回答。門檻太高容易「找不到資料」，太低容易引用不相關的段落。</p>
						</header>
						<div class="form-grid">
							<div>
								<VSlider v-model="minScorePercent" :min="0" :max="100" :step="1" color="primary" hide-details label="最低分數" aria-label="引用最低分數" data-testid="citation-min-score">
									<template #append><span class="slider-value">{{ minScorePercent }}%</span></template>
								</VSlider>
								<p class="field-hint">一般建議 65%–80%。</p>
							</div>
							<VTextField v-model.number="draft.citation.limit" label="最多引用筆數" type="number" :min="L.citationLimit.min" :max="L.citationLimit.max" />
						</div>
						<p v-if="visibleErrors.citation" class="section-error" role="alert">{{ visibleErrors.citation }}</p>
					</section>

					<section id="ai-section-generate" class="setting-section" aria-labelledby="h-generate">
						<header class="section-head">
							<h2 id="h-generate" class="section-heading" tabindex="-1" data-section-focus>6. 生成回答</h2>
							<p>依引用段落產生回答的模型。提問時若沒有另外選擇，就使用這個模型。</p>
						</header>
						<VSelect v-model="draft.models.answer" :items="llmItems" :item-props="(item) => ({ subtitle: item.subtitle })" label="回答模型" />
						<RouterLink :to="{ path: '/admin/system-resources', query: { profile: draft.models.answer } }" class="resource-link">模型名稱、Temperature 等參數請到系統資源編輯</RouterLink>
						<p v-if="visibleErrors.generate" class="section-error" role="alert">{{ visibleErrors.generate }}</p>
					</section>
				</div>
			</VWindowItem>

			<!-- > 工具調度 -->
			<VWindowItem value="agent">
				<section id="ai-section-agent" class="setting-section" aria-labelledby="h-agent">
					<header class="section-head">
						<h2 id="h-agent" class="section-heading" tabindex="-1" data-section-focus>工具調度</h2>
						<p>讓規劃模型視問題決定要呼叫哪些工具、呼叫幾次。關閉時每個問題只做一次檢索。</p>
					</header>
					<VSwitch v-model="draft.agent.enabled" color="primary" hide-details label="啟用工具調度" />
					<template v-if="draft.agent.enabled">
						<VSwitch v-model="draft.agent.ruleShortcutEnabled" color="primary" hide-details label="規則快速判斷" />
						<p class="field-hint">明顯只需要一次搜尋的問題直接略過規劃，節省時間與成本。</p>

						<h3 class="sub-heading">可用工具</h3>
						<ul class="tool-list">
							<li v-for="tool in AGENT_TOOLS" :key="tool.id">
								<VCheckbox :model-value="draft.agent.tools.includes(tool.id)" density="compact" hide-details :label="tool.label" @update:model-value="toggleTool(tool.id, $event)" />
								<p class="field-hint tool-hint">{{ tool.description }}</p>
							</li>
						</ul>

						<div class="form-grid mt-4">
							<VTextField v-model.number="draft.agent.maxSteps" label="最多呼叫次數" type="number" :min="L.maxSteps.min" :max="L.maxSteps.max" hint="次數越多回答越完整，也越慢" persistent-hint />
							<VTextField v-model.number="draft.agent.budgetSeconds" label="時間預算（秒）" type="number" :min="L.budgetSeconds.min" :max="L.budgetSeconds.max" hint="超過就停止規劃，用已取得的證據作答" persistent-hint />
							<VTextField v-model.number="draft.agent.readMaxChars" label="全文讀取上限（字）" type="number" :min="L.readMaxChars.min" :max="L.readMaxChars.max" :disabled="!draft.agent.tools.includes('read_document')" hint="避免長文件塞滿模型上下文" persistent-hint />
							<div>
								<VSelect v-model="draft.models.planner" :items="llmItems" :item-props="(item) => ({ subtitle: item.subtitle })" label="規劃模型" hint="規劃只輸出短指令，選較小較快的模型可降低延遲" persistent-hint />
								<RouterLink :to="{ path: '/admin/system-resources', query: { profile: draft.models.planner } }" class="resource-link">在系統資源編輯</RouterLink>
							</div>
						</div>
					</template>
					<p v-if="visibleErrors.agent" class="section-error" role="alert">{{ visibleErrors.agent }}</p>
				</section>
			</VWindowItem>

			<!-- > 回答內容：送進模型的指令依序是系統提示詞、回答風格、專有名詞 -->
			<VWindowItem value="content">
				<div class="section-stack">
					<ol class="prompt-order" aria-label="送進模型的指令組成順序">
						<li><button type="button" class="link-button" @click="goToSection('prompt')">共用系統提示詞</button></li>
						<li><button type="button" class="link-button" @click="goToSection('styles')">回答風格</button></li>
						<li><button type="button" class="link-button" @click="goToSection('glossary')">專有名詞保護</button></li>
						<li>提問與引用段落</li>
					</ol>

					<section id="ai-section-prompt" class="setting-section" aria-labelledby="h-prompt">
						<header class="section-head">
							<h2 id="h-prompt" class="section-heading" tabindex="-1" data-section-focus>共用系統提示詞</h2>
							<p>每次回答都會套用的基本規則，例如只能根據文件回答、資訊不足時怎麼說。</p>
						</header>
						<VTextarea v-model="draft.prompts.systemBase" label="系統提示詞" rows="6" auto-grow :counter="L.systemBaseMaxLength" />
						<p v-if="visibleErrors.prompt" class="section-error" role="alert">{{ visibleErrors.prompt }}</p>
					</section>

					<section id="ai-section-styles" class="setting-section" aria-labelledby="h-styles">
						<header class="section-head">
							<h2 id="h-styles" class="section-heading" tabindex="-1" data-section-focus>回答風格</h2>
							<p>問答頁以名稱切換這些風格，指令只給模型看。沒有選擇時使用預設風格。</p>
						</header>
						<VRadioGroup :model-value="draft.prompts.styles.find((style) => style.isDefault)?.id" hide-details class="style-list" aria-label="預設回答風格" @update:model-value="setDefaultStyle(String($event))">
							<article v-for="style in draft.prompts.styles" :key="style.id" class="style-card">
								<div class="style-head">
									<VTextField v-model="style.name" label="名稱" density="compact" maxlength="10" hide-details />
									<VRadio :value="style.id" label="預設" />
								</div>
								<VTextarea v-model="style.instruction" label="給模型的指令" rows="2" auto-grow density="compact" :counter="L.instructionMaxLength" class="mt-3" />
							</article>
						</VRadioGroup>
						<p v-if="visibleErrors.styles" class="section-error" role="alert">{{ visibleErrors.styles }}</p>
					</section>

					<section id="ai-section-glossary" class="setting-section" aria-labelledby="h-glossary">
						<header class="section-head">
							<h2 id="h-glossary" class="section-heading" tabindex="-1" data-section-focus>專有名詞保護</h2>
							<p>模型回答時會原樣保留這些名稱，不翻譯、不改寫大小寫。適合公司名、產品名與系統名稱。</p>
						</header>
						<form class="term-form" @submit.prevent="addTerm">
							<VTextField v-model="newTerm" label="新增專有名詞" density="compact" :maxlength="L.glossaryMaxLength" :error-messages="newTermDuplicate ? '清單中已有這個名詞' : ''" :hide-details="!newTermDuplicate" />
							<VBtn type="submit" variant="outlined" :disabled="!newTerm.trim() || newTermDuplicate">新增</VBtn>
						</form>
						<p class="field-hint mt-2">共 {{ draft.prompts.glossary.length }} 個</p>
						<div class="term-list">
							<VChip v-for="term in draft.prompts.glossary" :key="term" closable size="small" :close-label="`移除 ${term}`" @click:close="removeTerm(term)">{{ term }}</VChip>
						</div>
					</section>
				</div>
			</VWindowItem>

			<!-- > 變更紀錄 -->
			<VWindowItem value="history">
				<section class="setting-section" aria-labelledby="h-history">
					<header class="section-head">
						<h2 id="h-history" class="section-heading">變更紀錄</h2>
						<p>回答品質突然變差時，先比對這裡的時間點。還原會產生一筆新紀錄，不會刪除歷史。</p>
					</header>
					<p v-if="!aiSettingsState.revisions.length" class="empty-note">還沒有任何變更紀錄。</p>
					<ol v-else class="revision-list">
						<li v-for="revision in aiSettingsState.revisions" :key="revision.id" class="revision">
							<div class="revision-head">
								<div>
									<strong>{{ revision.actor }}</strong>
									<span class="revision-meta">{{ formatDateTime(revision.savedAt) }} · {{ revision.changes.length }} 項</span>
								</div>
								<VBtn variant="text" size="small" :disabled="isDirty" :title="isDirty ? '請先儲存或放棄目前的變更' : ''" @click="restoreTargetId = revision.id">還原到這次之前</VBtn>
							</div>
							<p v-if="revision.note" class="revision-note">{{ revision.note }}</p>
							<ul class="change-list">
								<li v-for="change in revision.changes" :key="change.label"><span>{{ change.label }}</span>{{ change.from }} → {{ change.to }}</li>
							</ul>
						</li>
					</ol>
				</section>
			</VWindowItem>
		</VWindow>

		<div v-if="isDirty" class="save-bar" role="region" aria-label="設定儲存操作" data-testid="ai-save-bar">
			<div aria-live="polite">
				<strong>{{ changes.length }} 項未儲存變更</strong>
				<p v-if="showErrors && Object.keys(errors).length" class="text-error">有 {{ Object.keys(errors).length }} 個區塊需要修正</p>
				<p v-else class="save-summary">{{ changes.slice(0, 3).map((change) => change.label).join('、') }}{{ changes.length > 3 ? ' 等' : '' }}</p>
			</div>
			<div class="save-actions">
				<VBtn variant="text" @click="discard">放棄變更</VBtn>
				<VBtn color="primary" data-testid="ai-save" @click="requestSave">儲存設定</VBtn>
			</div>
		</div>

		<VDialog v-model="confirmOpen" max-width="560">
			<VCard>
				<VCardTitle class="pa-6 pb-2">儲存 {{ changes.length }} 項變更？</VCardTitle>
				<VCardText class="pa-6 pt-2">
					<ul class="change-list mb-4">
						<li v-for="change in changes" :key="change.label"><span>{{ change.label }}</span>{{ change.from }} → {{ change.to }}</li>
					</ul>
					<VTextField v-model="saveNote" label="變更原因（選填）" placeholder="例如：附表類問題常找不到資料，降低引用門檻" maxlength="80" hint="會記在變更紀錄，方便之後追查" persistent-hint />
					<p v-if="saveError" class="section-error" role="alert">{{ saveError }}</p>
				</VCardText>
				<VCardActions class="pa-5">
					<VSpacer />
					<VBtn @click="confirmOpen = false">返回</VBtn>
					<VBtn color="primary" data-testid="ai-save-confirm" @click="confirmSave">確認儲存</VBtn>
				</VCardActions>
			</VCard>
		</VDialog>

		<VDialog :model-value="Boolean(restoreTarget)" max-width="480" @update:model-value="restoreTargetId = null">
			<VCard v-if="restoreTarget">
				<VCardTitle class="pa-6 pb-2">還原設定？</VCardTitle>
				<VCardText class="pa-6 pt-2">會把設定改回 {{ formatDateTime(restoreTarget.savedAt) }} 這次儲存之前的狀態，之後的新提問立即套用。</VCardText>
				<VCardActions class="pa-5">
					<VSpacer />
					<VBtn @click="restoreTargetId = null">返回</VBtn>
					<VBtn color="primary" @click="confirmRestore">確認還原</VBtn>
				</VCardActions>
			</VCard>
		</VDialog>

		<ConfirmDialog
			:model-value="leaveGuard.isLeaveDialogOpen.value"
			title="離開前要放棄變更嗎？"
			:description="`還有 ${changes.length} 項設定沒有儲存，離開後會遺失。`"
			cancel-label="留在這頁"
			confirm-label="放棄修改並離開"
			@update:model-value="leaveGuard.stay"
			@confirm="leaveGuard.confirmLeave"
		/>
	</div>
</template>

<style scoped>
.settings-window { overflow: visible; }

/* > 流程總覽 */
.flow-map { margin-bottom: var(--space-lg); overflow-x: auto; }
.flow-map ol { display: flex; gap: 6px; min-width: max-content; margin: 0; padding: 0; list-style: none; }
.flow-map li { display: flex; align-items: center; }
.flow-map li + li::before { content: '›'; margin-right: 6px; color: var(--ink-muted); }

.flow-node {
	display: grid;
	gap: 2px;
	min-width: 132px;
	padding: 10px 12px;
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-sm);
	background: rgb(var(--v-theme-surface));
	color: inherit;
	text-align: left;
	transition: background-color 160ms cubic-bezier(0.16, 1, 0.3, 1), border-color 160ms cubic-bezier(0.16, 1, 0.3, 1);
}

.flow-node:hover { background: rgb(var(--v-theme-on-surface) / 4%); }
.flow-node:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 1px; }
.flow-node.is-off { opacity: 0.6; }
.flow-node.is-dirty { border-color: rgb(var(--v-theme-primary) / 55%); }
.flow-node.is-error { border-color: rgb(var(--v-theme-error) / 60%); background: rgb(var(--v-theme-error) / 5%); }
.flow-label { display: flex; align-items: center; gap: 4px; font-size: 0.86rem; font-weight: 600; }
.flow-metric { color: var(--ink-muted); font-size: 0.76rem; font-variant-numeric: tabular-nums; white-space: nowrap; }

.dirty-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: rgb(var(--v-theme-primary)); }

/* > 區塊 */
.section-stack { display: grid; gap: var(--space-lg); }

.setting-section {
	padding: var(--space-lg);
	border: 1px solid rgb(var(--v-theme-outline));
	border-radius: var(--radius-md);
	background: rgb(var(--v-theme-surface));
	scroll-margin-top: 88px;
}

.section-head { margin-bottom: var(--space-md); }
.section-head p { max-width: 68ch; margin: 4px 0 0; color: var(--ink-muted); font-size: 0.86rem; }
.section-heading:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.sub-heading { margin: var(--space-md) 0 var(--space-xs); font-size: 0.9rem; font-weight: 700; }
.section-error { margin: var(--space-sm) 0 0; color: rgb(var(--v-theme-error)); font-size: 0.86rem; }
.field-hint { margin: 0 0 var(--space-sm); color: var(--ink-muted); font-size: 0.78rem; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-sm) var(--space-md); align-items: start; }
.resource-link { display: inline-block; margin: 6px 0 0; color: rgb(var(--v-theme-primary)); font-size: 0.82rem; text-underline-offset: 2px; }
.slider-value { min-width: 3.5ch; font-variant-numeric: tabular-nums; font-weight: 600; }
.empty-note { color: var(--ink-muted); }

.channel-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-md); }
.channel-card { display: grid; gap: var(--space-xs); padding: 12px; border: 1px solid rgb(var(--v-theme-outline)); border-radius: var(--radius-sm); }
.channel-card.is-off { background: rgb(var(--v-theme-on-surface) / 3%); }

/* > 影響試算 */

/* > 工具與內容 */
.tool-list { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
.tool-hint { margin-left: 40px; }

.prompt-order { display: flex; flex-wrap: wrap; gap: 6px 20px; margin: 0; padding: 12px 16px 12px 36px; border-radius: var(--radius-sm); background: rgb(var(--v-theme-on-surface) / 4%); font-size: 0.86rem; }
.link-button { color: rgb(var(--v-theme-primary)); text-decoration: underline; text-underline-offset: 2px; }

.style-list :deep(.v-selection-control-group) { display: grid; gap: var(--space-md); }
.style-card { padding: 12px; border: 1px solid rgb(var(--v-theme-outline)); border-radius: var(--radius-sm); }
.style-head { display: grid; grid-template-columns: minmax(0, 220px) auto; gap: var(--space-md); align-items: center; }

.term-form { display: flex; gap: var(--space-sm); align-items: flex-start; max-width: 480px; }
.term-list { display: flex; flex-wrap: wrap; gap: 6px; }

/* > 變更紀錄 */
.revision-list { display: grid; gap: var(--space-md); margin: 0; padding: 0; list-style: none; }
.revision { padding-bottom: var(--space-md); border-bottom: 1px solid rgb(var(--v-theme-outline)); }
.revision:last-child { border-bottom: 0; }
.revision-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-md); }
.revision-meta { margin-left: 8px; color: var(--ink-muted); font-size: 0.8rem; }
.revision-note { margin: 4px 0; font-size: 0.86rem; }
.change-list { display: grid; gap: 2px; margin: 4px 0 0; padding-left: 1.2em; font-size: 0.84rem; }
.change-list span { margin-right: 6px; color: var(--ink-muted); }

/* > 儲存列 */
.save-bar {
	position: sticky;
	bottom: 0;
	z-index: 2;
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: var(--space-sm) var(--space-md);
	margin-top: var(--space-lg);
	padding: 12px var(--space-lg);
	border: 1px solid rgb(var(--v-theme-primary) / 35%);
	border-radius: var(--radius-md);
	background: color-mix(in srgb, rgb(var(--v-theme-primary)) 6%, rgb(var(--v-theme-surface)));
	box-shadow: 0 -4px 16px rgb(0 0 0 / 6%);
}

.save-bar p { margin: 0; font-size: 0.82rem; }
.save-summary { color: var(--ink-muted); }
.save-actions { display: flex; gap: var(--space-sm); }

@media (max-width: 700px) {
	.form-grid, .channel-grid { grid-template-columns: minmax(0, 1fr); }
	.setting-section { padding: var(--space-md); }
	.save-bar { padding: 12px var(--space-md); }
	.save-actions { width: 100%; justify-content: flex-end; }
}

@media (prefers-reduced-motion: reduce) {
	.flow-node { transition: none; }
}
</style>

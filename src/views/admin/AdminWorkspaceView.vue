<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useTheme } from 'vuetify'

import PageHeader from '@/components/PageHeader.vue'
import { useAppStore } from '@/stores/app'
import { themeAccentLabels, type ThemeAccent } from '@/theme'

interface WorkspaceConfig {
	eyebrow: string
	description: string
	tabs: string[]
	items: Array<{ title: string; description: string; status?: string; action?: string }>
}

const workspaceConfigs: Record<string, WorkspaceConfig> = {
	graph: {
		eyebrow: '關聯品質',
		description: '覆核擷取出的實體、知識社群與圖譜規模，必要時重新建立關聯。',
		tabs: ['圖譜統計', '實體覆核', '主題社群', '重建圖譜'],
		items: [
			{ title: '圖譜規模', description: '3,842 個節點 · 12,906 條關聯 · 1,018 份文件', status: '健康' },
			{ title: '待覆核實體', description: '23 個新實體可能與既有名稱重複', status: '需處理', action: '開始覆核' },
			{ title: '主題社群', description: '已辨識 38 個知識社群，最近更新於今天 03:10', status: '正常' },
		],
	},
	feedback: {
		eyebrow: '改善知識品質',
		description: '從使用者回饋回看問題、回答、引用與檢索結果，找出需要修正的內容或設定。',
		tabs: ['AI 回答回饋', '問題回報', '處理紀錄'],
		items: [
			{ title: '海外出差的住宿上限是多少？', description: '使用者表示引用的是舊版本 · 財務制度', status: '高優先', action: '查看診斷' },
			{ title: '找不到新進人員設備申請流程', description: '搜尋無結果 · 可能缺少同義詞', status: '新進', action: '指派處理人' },
			{ title: '文件預覽在行動裝置無法縮放', description: '問題回報 · iOS Safari', status: '審查中', action: '更新狀態' },
		],
	},
	ai: {
		eyebrow: '回答與檢索品質',
		description: '管理問題路由、混合檢索、模型、提示詞與專有名詞。變更前可先測試，不影響目前服務。',
		tabs: ['問題路由', '知識檢索', '重新排序與引用', '回答模型', '工具調度', '提示詞與術語'],
		items: [
			{ title: '混合檢索', description: '語意搜尋 60% · 關鍵字搜尋 40% · 圖譜擴充已啟用', status: '已啟用', action: '調整權重' },
			{ title: '回答模型：主要設定', description: 'OpenAI 相容服務 · 上下文 32K · Temperature 0.2', status: '連線正常', action: '測試連線' },
			{ title: '引用規則', description: '最低分數 0.72 · 每次回答最多 6 筆引用', status: '已套用', action: '編輯規則' },
			{ title: '專有名詞保護', description: '目前維護 126 個公司與產品名稱', status: '正常', action: '管理名詞' },
		],
	},
	access: {
		eyebrow: '身分與權限',
		description: '管理使用者、角色與群組繼承關係，保護系統內建角色不被誤改。',
		tabs: ['使用者', '角色與權限', '群組'],
		items: [
			{ title: '王小明', description: 'employee@company.com · 產品企劃部 · 一般使用者', status: '已啟用', action: '管理帳號' },
			{ title: '知識管理員', description: '8 位成員 · 可管理文件、審核與回饋', status: '系統角色', action: '查看權限' },
			{ title: '產品事業群', description: '4 個子群組 · 86 位成員 · 繼承 2 個角色', status: '群組', action: '展開群組' },
		],
	},
	settings: {
		eyebrow: '產品與治理',
		description: '維護品牌外觀、版本公告、隱私權政策與全公司預設配色。',
		tabs: ['品牌外觀', '版本管理', '隱私權政策', '預設配色'],
		items: [
			{ title: '品牌外觀', description: '系統名稱：Syscom Cubi · Logo 已設定 · 瀏覽器圖示已設定', status: '已發布', action: '編輯外觀' },
			{ title: '系統版本 0.1.0', description: '目前使用版本 · 發布於 2026-08-14', status: '目前版本', action: '管理版本' },
			{ title: '隱私權暨個人資料保護政策', description: '最後發布於 2026-07-01', status: '已發布', action: '編輯條款' },
			{ title: '預設配色', description: 'Cubi 藍 · 由系統管理員統一設定', status: '已套用', action: '變更配色' },
		],
	},
}

type WorkspaceItem = WorkspaceConfig['items'][number]

const workspaceTabItems: Record<string, WorkspaceItem[][]> = {
	graph: [
		[{ title: '圖譜規模', description: '3,842 個節點 · 12,906 條關聯 · 1,018 份文件', status: '健康' }, { title: '最近更新', description: '今天 03:10 · 新增 84 個節點與 216 條關聯', status: '完成', action: '查看變更' }],
		[{ title: 'ACME Cloud', description: '可能與「ACME 雲端服務」為相同實體', status: '待覆核', action: '合併實體' }, { title: '差旅管理', description: '類型：制度 · 來源 12 份文件', status: '已確認', action: '編輯實體' }],
		[{ title: '員工生命週期', description: '包含到職、訓練、績效與離職等 128 個節點', status: '已產生', action: '查看社群' }, { title: '費用與採購', description: '包含差旅、採購、請款等 96 個節點', status: '已產生', action: '查看社群' }],
		[{ title: '快速重建', description: '保留已確認實體，只重算新增與異動文件', status: '建議', action: '開始重建' }, { title: '完整重建', description: '重新產生所有實體、關聯與知識社群', status: '高風險', action: '查看影響' }],
	],
	feedback: [
		[{ title: '海外出差的住宿上限是多少？', description: '引用舊版本 · 回報者：陳小姐 · 今天 09:18', status: '高優先', action: '查看診斷' }, { title: '找不到設備申請流程', description: '搜尋無結果 · 可能缺少同義詞', status: '新進', action: '指派處理人' }],
		[{ title: '文件預覽無法縮放', description: 'iOS Safari · 附有畫面資訊', status: '審查中', action: '更新狀態' }, { title: '無法下載附件', description: '財務部 · 差旅費用明細表', status: '待處理', action: '查看回報' }],
		[{ title: '回饋 #FB-1042', description: '王小明 → 林怡君 · 新進 → 審查中', status: '處理中', action: '查看紀錄' }, { title: '問題 #IS-0821', description: '資訊部 · 已確認為瀏覽器相容問題', status: '已結案', action: '查看紀錄' }],
	],
	ai: [
		[{ title: '單一主題路由', description: '優先限制在辨識出的知識主題', status: '已啟用', action: '編輯規則' }, { title: '跨文件問題路由', description: '需要比較或彙整時擴大檢索範圍', status: '已啟用', action: '編輯規則' }],
		[{ title: '語意搜尋', description: '候選 20 筆 · 權重 60%', status: '已啟用', action: '調整參數' }, { title: '關鍵字搜尋', description: '候選 20 筆 · 權重 40%', status: '已啟用', action: '調整參數' }, { title: '知識圖譜擴充', description: '每個命中節點展開 2 層', status: '已啟用', action: '調整參數' }],
		[{ title: 'Reranker', description: '保留 12 筆 · 逾時 8 秒', status: '連線正常', action: '測試服務' }, { title: '引用規則', description: '最低分數 0.72 · 最多 6 筆', status: '已套用', action: '編輯規則' }],
		[{ title: '主要回答模型', description: 'OpenAI 相容服務 · 32K context', status: '連線正常', action: '編輯設定' }, { title: '備援回答模型', description: 'Ollama · 本機模型', status: '待測試', action: '測試連線' }],
		[{ title: 'Agent 工具調度', description: '最多 6 次呼叫 · 45 秒時間預算', status: '已啟用', action: '編輯限制' }, { title: '規劃模型', description: '使用主要回答模型', status: '已套用', action: '變更模型' }],
		[{ title: '共用系統提示詞', description: '最後更新：2026-08-10 · 林怡君', status: '已發布', action: '編輯提示詞' }, { title: '回答風格', description: '簡潔、詳細、步驟式共 3 種', status: '正常', action: '管理風格' }, { title: '專有名詞保護', description: '126 個公司與產品名稱', status: '正常', action: '管理名詞' }],
	],
	access: [
		[{ title: '王小明', description: 'employee@company.com · 產品企劃部', status: '已啟用', action: '管理帳號' }, { title: '林怡君', description: 'km.admin@company.com · 知識管理部', status: '已啟用', action: '管理帳號' }],
		[{ title: '一般使用者', description: '1,024 位成員 · 搜尋、閱讀與問答', status: '系統角色', action: '查看權限' }, { title: '知識管理員', description: '8 位成員 · 文件、審核與回饋', status: '系統角色', action: '查看權限' }, { title: '部門內容維護者', description: '32 位成員 · 限所屬部門文件', status: '自訂角色', action: '編輯權限' }],
		[{ title: '公司', description: '6 個事業群 · 1,064 位成員', status: '根群組', action: '展開群組' }, { title: '產品事業群', description: '4 個子群組 · 86 位成員', status: '群組', action: '管理角色' }],
	],
	settings: [
		[{ title: '品牌外觀', description: '系統名稱、Logo、瀏覽器標題與圖示', status: '已發布', action: '編輯外觀' }],
		[{ title: '0.1.0', description: '目前版本 · 發布於 2026-08-14', status: '目前版本', action: '編輯說明' }, { title: '0.2.0 草稿', description: '尚未發布 · 3 項更新', status: '草稿', action: '預覽版本' }],
		[{ title: '隱私權暨個資保護政策', description: '最後發布於 2026-07-01', status: '已發布', action: '編輯條款' }, { title: '政策草稿', description: '林怡君最後編輯於今天 09:20', status: '草稿', action: '預覽草稿' }],
		[{ title: '系統預設配色', description: 'Cubi 藍 · 由系統管理員統一設定', status: '已套用', action: '變更配色' }],
	],
}

const route = useRoute()
const theme = useTheme()
const appStore = useAppStore()
const activeTab = ref(0)
const search = ref('')
const dialogItem = ref<WorkspaceConfig['items'][number] | null>(null)
const showFilters = ref(false)
const isSaved = ref(false)
const semanticSearchEnabled = ref(true)
const keywordSearchEnabled = ref(true)
const graphExpansionEnabled = ref(true)
const resultLimit = ref(20)
const systemName = ref('Syscom Cubi')
const defaultTheme = ref('跟隨作業系統')
const defaultThemeAccent = ref<ThemeAccent>(appStore.themeAccent)
const newUserEmail = ref('')
const filterStatus = ref('全部')

const workspaceKey = computed(() => String(route.meta.workspace ?? 'settings'))
const config = computed(() => workspaceConfigs[workspaceKey.value] ?? workspaceConfigs.settings)
const systemThemeAccentLabel = computed(() => themeAccentLabels[appStore.themeAccent])
const currentItems = computed(() => {
	if (workspaceKey.value === 'settings' && activeTab.value === 3) {
		return [{ title: '系統預設配色', description: `${systemThemeAccentLabel.value} · 由系統管理員統一設定`, status: '已套用', action: '變更配色' }]
	}
	return workspaceTabItems[workspaceKey.value]?.[activeTab.value] ?? config.value.items
})
const visibleItems = computed(() => currentItems.value.filter((item) => {
	const matchesSearch = `${item.title} ${item.description}`.includes(search.value)
	const matchesStatus = filterStatus.value === '全部' || item.status === filterStatus.value
	return matchesSearch && matchesStatus
}))

function showSavedMessage(): void {
	isSaved.value = true
	window.setTimeout(() => { isSaved.value = false }, 2200)
}

function applySystemAppearance(): void {
	appStore.setThemeAccent(theme, defaultThemeAccent.value)
	showSavedMessage()
}

function openCreateDialog(): void {
	dialogItem.value = { title: `新增${config.value.tabs[activeTab.value] ?? '設定'}`, description: '填寫必要資訊後儲存至目前工作區。', action: '建立' }
}

watch(workspaceKey, () => {
	activeTab.value = 0
	search.value = ''
	filterStatus.value = '全部'
	showFilters.value = false
	dialogItem.value = null
})
</script>

<template>
	<div class="page-shell">
		<PageHeader :eyebrow="config.eyebrow" :title="String(route.meta.title)" :description="config.description">
			<template #actions><VBtn color="primary" prepend-icon="mdi-plus" @click="openCreateDialog">新增設定</VBtn></template>
		</PageHeader>
		<VTabs v-model="activeTab" color="primary" show-arrows class="mb-5"><VTab v-for="tab in config.tabs" :key="tab">{{ tab }}</VTab></VTabs>
		<div class="workspace-toolbar mb-4"><VTextField v-model="search" label="搜尋目前工作區" prepend-inner-icon="mdi-magnify" hide-details clearable /><VBtn variant="outlined" prepend-icon="mdi-filter-variant" :aria-pressed="showFilters" @click="showFilters = !showFilters">篩選</VBtn><VBtn variant="text" prepend-icon="mdi-refresh" @click="search = ''; showSavedMessage()">重新整理</VBtn></div>
		<VExpandTransition><VCard v-if="showFilters" class="surface-border pa-4 mb-4"><VSelect v-model="filterStatus" label="狀態" :items="['全部', ...Array.from(new Set(currentItems.map((item) => item.status).filter(Boolean))) ]" /></VCard></VExpandTransition>
		<VAlert v-if="isSaved" type="success" variant="tonal" class="mb-4">目前工作區已更新。</VAlert>

		<VCard v-if="workspaceKey === 'ai'" class="surface-border pa-5 mb-5">
			<h2 class="section-heading mb-1">{{ config.tabs[activeTab] }}</h2><p class="text-body-2 text-medium-emphasis mb-5">調整目前分頁的 Mock 設定，儲存後只在本次瀏覽期間生效。</p>
			<template v-if="activeTab === 0"><VSwitch label="啟用規則快速判斷" color="primary" model-value /><VSelect label="跨文件問題處理方式" :items="['自動擴大範圍', '先詢問使用者', '維持原主題']" /><VSelect label="規劃模型" :items="['主要回答模型', '備援回答模型']" /></template>
			<template v-else-if="activeTab === 1"><VSwitch v-model="semanticSearchEnabled" label="啟用語意搜尋" color="primary" /><VSwitch v-model="keywordSearchEnabled" label="啟用關鍵字搜尋" color="primary" /><VSwitch v-model="graphExpansionEnabled" label="啟用知識圖譜擴充" color="primary" /><VSlider v-model="resultLimit" label="每個管道取回數量" :min="5" :max="50" :step="5" thumb-label /></template>
			<template v-else-if="activeTab === 2"><VTextField label="Reranker 服務網址" placeholder="由後端安全設定提供" /><VTextField label="模型名稱" model-value="bge-reranker-v2" /><VSlider label="引用證據最低分數" :model-value="72" :min="0" :max="100" thumb-label /><VTextField label="最多引用筆數" type="number" model-value="6" /></template>
			<template v-else-if="activeTab === 3"><VSelect label="服務提供者" :items="['OpenAI 相容服務', 'Azure OpenAI', 'Gemini', 'Ollama']" /><VTextField label="模型名稱" model-value="gpt-4.1-mini" /><VTextField label="服務網址" placeholder="由後端安全設定提供" persistent-hint hint="API Key 只由後端安全保存，不在此展示介面顯示" /><VSlider label="Temperature" :model-value="20" :min="0" :max="100" thumb-label /></template>
			<template v-else-if="activeTab === 4"><VSwitch label="啟用 Agent 工具調度" color="primary" model-value /><VCombobox label="可用工具" :items="['知識搜尋', '全文讀取', '版本比較', '文件摘要']" :model-value="['知識搜尋', '全文讀取']" multiple chips /><VTextField label="最多呼叫次數" type="number" model-value="6" /><VTextField label="時間預算（秒）" type="number" model-value="45" /></template>
			<template v-else><VTextarea label="共用系統提示詞" rows="5" model-value="只根據可追溯的公司知識回答，資訊不足時明確說明。" /><VCombobox label="專有名詞保護" :items="['Syscom Cubi', 'ACME Cloud', 'Project Alpha']" :model-value="['Syscom Cubi', 'ACME Cloud']" multiple chips /></template>
			<VBtn color="primary" @click="showSavedMessage">儲存目前設定</VBtn><VBtn v-if="activeTab === 2 || activeTab === 3" class="ml-2" variant="outlined" @click="showSavedMessage">測試連線</VBtn>
		</VCard>
		<VCard v-else-if="workspaceKey === 'access'" class="surface-border pa-5 mb-5">
			<h2 class="section-heading mb-4">快速新增使用者</h2><div class="access-form"><VTextField v-model="newUserEmail" label="公司電子郵件" type="email" hide-details /><VSelect label="角色" :items="['一般使用者', '知識管理員', '系統管理員']" hide-details /><VBtn color="primary" :disabled="!newUserEmail.includes('@')" @click="newUserEmail = ''; showSavedMessage()">新增使用者</VBtn></div>
		</VCard>
		<VCard v-else-if="workspaceKey === 'settings'" class="surface-border pa-5 mb-5">
			<h2 class="section-heading mb-4">品牌與預設外觀</h2><VTextField v-model="systemName" label="系統名稱" /><VFileInput label="Logo" accept="image/png,image/svg+xml" prepend-icon="mdi-image-outline" /><VSelect v-model="defaultTheme" label="預設主題" :items="['淺色', '深色', '跟隨作業系統']" /><VRadioGroup v-model="defaultThemeAccent" label="系統預設配色"><VRadio value="indigo" :label="themeAccentLabels.indigo" /><VRadio value="red" :label="themeAccentLabels.red" /></VRadioGroup><VBtn color="primary" @click="applySystemAppearance">套用外觀</VBtn>
		</VCard>
		<VCard v-else-if="workspaceKey === 'graph'" class="surface-border pa-5 mb-5">
			<h2 class="section-heading mb-4">圖譜操作</h2><div class="d-flex flex-wrap ga-3"><VBtn variant="tonal" prepend-icon="mdi-account-check-outline" @click="showSavedMessage">批次核准實體</VBtn><VBtn variant="outlined" prepend-icon="mdi-graph-outline" @click="dialogItem = { title: '快速重建知識圖譜', description: '將保留已確認實體，並重新計算新增與異動文件。', action: '確認重建' }">快速重建</VBtn><VBtn variant="outlined" color="error" prepend-icon="mdi-alert-outline" @click="dialogItem = { title: '完整重建知識圖譜', description: '完整重建期間圖譜搜尋可能暫時無法使用。', action: '確認重建' }">完整重建</VBtn></div>
		</VCard>
		<VCard class="surface-border">
			<VList lines="two">
				<template v-for="(item, index) in visibleItems" :key="item.title">
					<VListItem class="py-3"><template #prepend><VIcon icon="mdi-circle-medium" color="primary" aria-hidden="true" /></template><VListItemTitle class="font-weight-bold">{{ item.title }}</VListItemTitle><VListItemSubtitle>{{ item.description }}</VListItemSubtitle><template #append><div class="d-flex align-center ga-2"><VChip v-if="item.status" size="small" variant="tonal">{{ item.status }}</VChip><VBtn v-if="item.action" variant="text" size="small" @click="dialogItem = item">{{ item.action }}</VBtn></div></template></VListItem>
					<VDivider v-if="index < visibleItems.length - 1" />
				</template>
			</VList>
		</VCard>
		<VAlert type="info" variant="tonal" class="mt-5">展示環境中的設定操作只會更新前端狀態，不會連線到模型服務或儲存憑證。</VAlert>

		<VDialog :model-value="Boolean(dialogItem)" max-width="560" @update:model-value="dialogItem = null">
			<VCard v-if="dialogItem"><VCardTitle class="pa-6 pb-2">{{ dialogItem.action }}</VCardTitle><VCardText class="pa-6 pt-2"><p class="font-weight-bold mb-1">{{ dialogItem.title }}</p><p class="text-body-2 text-medium-emphasis mb-5">{{ dialogItem.description }}</p><VTextField label="顯示名稱" :model-value="dialogItem.title" /><VTextarea label="說明或處理備註" rows="3" /></VCardText><VCardActions class="pa-5"><VSpacer /><VBtn @click="dialogItem = null">取消</VBtn><VBtn color="primary" @click="dialogItem = null; showSavedMessage()">儲存變更</VBtn></VCardActions></VCard>
		</VDialog>
	</div>
</template>

<style scoped>
.workspace-toolbar { display: flex; align-items: center; gap: 8px; }
.workspace-toolbar > :first-child { max-width: 380px; }
.access-form { display: grid; grid-template-columns: 1fr 220px auto; gap: 12px; align-items: center; }
@media (max-width: 700px) { .workspace-toolbar { align-items: stretch; flex-direction: column; } .workspace-toolbar > :first-child { max-width: none; } .access-form { grid-template-columns: 1fr; } }
</style>

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

		<VCard v-if="workspaceKey === 'access'" class="surface-border pa-5 mb-5">
			<h2 class="section-heading mb-4">快速新增使用者</h2><div class="access-form"><VTextField v-model="newUserEmail" label="公司電子郵件" type="email" hide-details /><VSelect label="角色" :items="['一般使用者', '知識管理員', '系統管理員']" hide-details /><VBtn color="primary" :disabled="!newUserEmail.includes('@')" @click="newUserEmail = ''; showSavedMessage()">新增使用者</VBtn></div>
		</VCard>
		<VCard v-else-if="workspaceKey === 'settings'" class="surface-border pa-5 mb-5">
			<h2 class="section-heading mb-4">品牌與預設外觀</h2><VTextField v-model="systemName" label="系統名稱" /><VFileInput label="Logo" accept="image/png,image/svg+xml" prepend-icon="mdi-image-outline" /><VSelect v-model="defaultTheme" label="預設主題" :items="['淺色', '深色', '跟隨作業系統']" /><VRadioGroup v-model="defaultThemeAccent" label="系統預設配色"><VRadio value="indigo" :label="themeAccentLabels.indigo" /><VRadio value="red" :label="themeAccentLabels.red" /></VRadioGroup><VBtn color="primary" @click="applySystemAppearance">套用外觀</VBtn>
		</VCard>
		<VCard v-if="visibleItems.length" class="surface-border">
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

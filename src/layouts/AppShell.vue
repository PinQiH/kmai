<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useDisplay, useTheme } from "vuetify"

import brandLogoUrl from "@/assets/brand/kmai-logo.png"
import AdminAssistantWidget from "@/components/AdminAssistantWidget.vue"
import ConversationHistoryPanel from "@/components/ConversationHistoryPanel.vue"
import ConversationSearchDialog from "@/components/ConversationSearchDialog.vue"
import NotificationMenu from "@/components/NotificationMenu.vue"
import UserAccountMenu from "@/components/UserAccountMenu.vue"
import { useConversationStore } from "@/stores/conversation"
import { useAppStore } from "@/stores/app"
import { useAdminAssistantStore } from "@/stores/adminAssistant"
import type { NavigationItem } from "@/types"
import {
	getWorkspaceWindowName,
	getWorkspaceSwitchWindowName,
} from "@/utils/adminWorkspaceWindow"

const employeeItems: NavigationItem[] = [
  { title: "首頁", icon: "mdi-home-outline", to: "/" },
  {
    title: "開新對話",
    icon: "mdi-message-plus-outline",
    action: "new-conversation",
  },
  {
    title: "搜尋對話",
    icon: "mdi-magnify",
    action: "search-conversation",
    hint: "Ctrl K",
  },
  { title: "知識庫", icon: "mdi-bookshelf", to: "/library" },
  { title: "個人筆記本", icon: "mdi-notebook-outline", to: "/notebooks" },
  { title: "知識圖譜", icon: "mdi-graph-outline", to: "/graph" },
  { title: "我的收藏", icon: "mdi-bookmark-outline", to: "/favorites" },
]

const adminOverviewItem: NavigationItem = {
	title: "管理總覽",
	icon: "mdi-view-dashboard-outline",
	to: "/admin",
}

const adminNavigationGroups: Array<{ title: string; items: NavigationItem[] }> = [
	{
		title: "內容與知識",
		items: [
			{ title: "文件管理", icon: "mdi-file-document-multiple-outline", to: "/admin/documents" },
			{ title: "文件處理", icon: "mdi-progress-wrench", to: "/admin/processing" },
			{ title: "圖譜管理", icon: "mdi-vector-polyline", to: "/admin/graph" },
			{ title: "回饋與問題", icon: "mdi-comment-alert-outline", to: "/admin/feedback" },
		],
	},
	{
		title: "營運與治理",
		items: [
			{ title: "營運監控", icon: "mdi-chart-timeline-variant", to: "/admin/monitoring" },
			{ title: "通知管理", icon: "mdi-bell-cog-outline", to: "/admin/notifications" },
			{ title: "系統紀錄", icon: "mdi-text-box-search-outline", to: "/admin/logs" },
		],
	},
	{
		title: "系統管理",
		items: [
			{ title: "AI 與檢索設定", icon: "mdi-tune-variant", to: "/admin/ai-settings" },
			{ title: "使用者與存取", icon: "mdi-account-group-outline", to: "/admin/access" },
			{ title: "系統設定", icon: "mdi-cog-outline", to: "/admin/settings" },
		],
	},
]

const adminItems: NavigationItem[] = [
	adminOverviewItem,
	...adminNavigationGroups.flatMap((group) => group.items),
]

const route = useRoute()
const router = useRouter()
const theme = useTheme()
const display = useDisplay()
const appStore = useAppStore()
const assistantStore = useAdminAssistantStore()

const isPublicPage = computed(() => Boolean(route.meta.public))
const isAdminWorkspace = computed(() => Boolean(route.meta.admin))
const isCompactLayout = computed(() => display.smAndDown.value)
const currentUserRoleLabel = computed(() => {
  if (appStore.adminRole === "system-admin") return "系統管理員"
  if (appStore.adminRole === "knowledge-admin") return "知識管理員"
  return "一般使用者"
})
const navigationItems = computed(() =>
  isAdminWorkspace.value ? adminItems : employeeItems,
)
const workspaceSwitchLabel = computed(() =>
  isAdminWorkspace.value ? "返回員工前台" : "管理後台",
)
const workspaceSwitchIcon = computed(() =>
  isAdminWorkspace.value ? "mdi-arrow-left" : "mdi-shield-account-outline",
)
const workspaceSwitchHref = computed(() =>
	router.resolve(isAdminWorkspace.value ? "/" : "/admin").href,
)
const workspaceSwitchTarget = computed(() =>
	getWorkspaceSwitchWindowName(isAdminWorkspace.value),
)
const navigationModel = computed({
  get: () => (isCompactLayout.value ? appStore.isNavigationOpen : true),
  set: (isOpen: boolean) => {
    if (isCompactLayout.value) appStore.isNavigationOpen = isOpen
  },
})
// @ rail 只在桌面生效；小螢幕維持 temporary drawer 的完整寬度
const isRailMode = computed(
  () => appStore.isNavigationRail && !isCompactLayout.value,
)
const railToggleLabel = computed(() =>
  appStore.isNavigationRail ? "展開側邊欄" : "收合側邊欄",
)
// @ 歷史對話只在員工前台的完整寬度側邊欄顯示
const showDrawerHistory = computed(
  () => !isAdminWorkspace.value && !isRailMode.value,
)
const primaryNavigationItems = computed(() => navigationItems.value.slice(0, 3))
const secondaryNavigationItems = computed(() => navigationItems.value.slice(3))

watch(
  () => route.fullPath,
  () => {
    if (isCompactLayout.value) appStore.isNavigationOpen = false
  },
)

watch(
	[isPublicPage, isAdminWorkspace],
	([isPublic, isAdmin]) => {
		window.name = isPublic ? "" : getWorkspaceWindowName(isAdmin)
	},
	{ immediate: true },
)

const conversationStore = useConversationStore()
const isSearchOpen = ref(false)

// - 帶 action 的導覽項目不做路由跳轉，改觸發對應行為
async function handleNavigate(item: NavigationItem): Promise<void> {
  if (item.action === "new-conversation") {
    conversationStore.startNewConversation()
    if (route.path !== "/ask") await router.push("/ask")
    return
  }
  if (item.action === "search-conversation") {
    isSearchOpen.value = true
    return
  }
  if (item.to) await router.push(item.to)
}

// @ 只在非輸入元素上攔截 Ctrl/Cmd + K，避免搶走輸入框的組字與選取
function handleSearchShortcut(event: KeyboardEvent): void {
  if (event.key !== "k" || !(event.ctrlKey || event.metaKey)) return
  event.preventDefault()
  isSearchOpen.value = true
}

onMounted(() => window.addEventListener("keydown", handleSearchShortcut))
onBeforeUnmount(() => window.removeEventListener("keydown", handleSearchShortcut))

async function handleLogout(): Promise<void> {
  assistantStore.endSession("logout")
  appStore.logout()
  await router.push("/login")
}
</script>

<template>
  <RouterView v-if="isPublicPage" />
  <template v-else>
    <a class="skip-link" href="#main-content">跳至主要內容</a>
    <VNavigationDrawer
      v-model="navigationModel"
      :temporary="isCompactLayout"
      :rail="isRailMode"
      :class="{ 'has-drawer-history': showDrawerHistory }"
      rail-width="72"
      width="264"
      border="0"
    >
      <div class="brand-lockup py-5" :class="isRailMode ? 'px-3' : 'px-5'">
        <img :src="brandLogoUrl" alt="" class="brand-logo" aria-hidden="true" />
        <div v-if="!isRailMode">
          <p class="font-weight-bold">Syscom Cubi</p>
          <p class="text-caption text-medium-emphasis">
            {{ isAdminWorkspace ? "管理後台" : "凌群知識庫" }}
          </p>
        </div>
      </div>

      <VList
        nav
        density="compact"
        class="navigation-list px-3"
        :aria-label="isAdminWorkspace ? '管理後台導覽' : '員工前台導覽'"
      >
		<template v-if="isAdminWorkspace">
			<VListItem
				:to="adminOverviewItem.to"
				:prepend-icon="adminOverviewItem.icon"
				:title="adminOverviewItem.title"
			>
				<VTooltip v-if="isRailMode" activator="parent" location="right">{{ adminOverviewItem.title }}</VTooltip>
			</VListItem>
			<template v-for="group in adminNavigationGroups" :key="group.title">
				<VListSubheader v-if="!isRailMode" class="admin-nav-group">{{ group.title }}</VListSubheader>
				<VListItem
					v-for="item in group.items"
					:key="item.title"
					:to="item.to"
					:prepend-icon="item.icon"
					:title="item.title"
				>
					<VTooltip v-if="isRailMode" activator="parent" location="right">{{ item.title }}</VTooltip>
				</VListItem>
			</template>
		</template>
		<template v-else>
			<VListItem
				v-for="item in primaryNavigationItems"
				:key="item.title"
				:to="item.action ? undefined : item.to"
				:prepend-icon="item.icon"
				:title="item.title"
				@click="item.action ? handleNavigate(item) : undefined"
			>
				<template v-if="item.hint && !isRailMode" #append>
					<kbd class="nav-hint">{{ item.hint }}</kbd>
				</template>
				<VTooltip v-if="isRailMode" activator="parent" location="right">{{ item.title }}</VTooltip>
			</VListItem>
		</template>
      </VList>

			<VList v-if="isRailMode && !isAdminWorkspace" nav density="compact" class="navigation-list px-3" aria-label="其他功能">
				<VListItem v-for="item in secondaryNavigationItems" :key="item.title" :to="item.to" :prepend-icon="item.icon" :title="item.title">
					<VTooltip activator="parent" location="right">{{ item.title }}</VTooltip>
				</VListItem>
			</VList>

      <!--
        @ 歷史對話住在側邊欄導覽下方，吃掉剩餘高度。
          只在員工前台的完整寬度模式顯示：rail 太窄、管理後台導覽已有九項。
      -->
      <template v-if="showDrawerHistory">
				<ConversationHistoryPanel>
					<template #navigation>
						<VList nav density="compact" class="navigation-list secondary-navigation px-3" aria-label="其他功能">
							<VListItem v-for="item in secondaryNavigationItems" :key="item.title" :to="item.to" :prepend-icon="item.icon" :title="item.title" />
						</VList>
					</template>
				</ConversationHistoryPanel>
      </template>

    </VNavigationDrawer>

    <VAppBar flat border="b" height="64">
      <VAppBarNavIcon
        v-if="isCompactLayout"
        aria-label="開啟導覽"
        @click="appStore.toggleNavigation"
      />
      <VBtn
        v-else
        icon
        class="ml-2"
        :aria-label="railToggleLabel"
        :aria-pressed="appStore.isNavigationRail"
        @click="appStore.toggleNavigationRail"
      >
        <VIcon
          :icon="appStore.isNavigationRail ? 'mdi-menu' : 'mdi-dock-left'"
        />
        <VTooltip activator="parent" location="bottom">{{
          railToggleLabel
        }}</VTooltip>
      </VBtn>
      <VToolbarTitle class="text-body-1 font-weight-bold">{{
        route.meta.title
      }}</VToolbarTitle>
      <VSpacer />
      <VBtn
        v-if="appStore.isAdmin && !isCompactLayout"
        variant="tonal"
        :prepend-icon="workspaceSwitchIcon"
		:href="workspaceSwitchHref"
		:target="workspaceSwitchTarget"
      >
        {{ workspaceSwitchLabel }}
      </VBtn>
      <VBtn
        v-else-if="appStore.isAdmin"
        :icon="workspaceSwitchIcon"
        :aria-label="workspaceSwitchLabel"
		:href="workspaceSwitchHref"
		:target="workspaceSwitchTarget"
      >
        <VTooltip activator="parent">{{ workspaceSwitchLabel }}</VTooltip>
      </VBtn>
      <VBtn icon="mdi-magnify" aria-label="前往搜尋" to="/search" />
      <NotificationMenu />
      <VBtn
        :icon="
          appStore.themeMode === 'light'
            ? 'mdi-weather-night'
            : 'mdi-white-balance-sunny'
        "
        :aria-label="
          appStore.themeMode === 'light' ? '切換為深色模式' : '切換為淺色模式'
        "
        @click="appStore.toggleTheme(theme)"
      />
      <UserAccountMenu
        name="王小明"
        department="產品企劃部"
        email="employee@company.com"
        :role-label="currentUserRoleLabel"
        @logout="handleLogout"
      />
    </VAppBar>

    <VMain id="main-content" class="app-main" tabindex="-1">
      <RouterView />
    </VMain>

    <ConversationSearchDialog v-model="isSearchOpen" />
    <AdminAssistantWidget v-if="isAdminWorkspace" />
  </template>
</template>

<style scoped>
.skip-link {
  position: fixed;
  top: 8px;
  left: 8px;
  z-index: 2000;
  transform: translateY(-160%);
  padding: 10px 14px;
  border-radius: 8px;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  font-weight: 700;
}

.skip-link:focus {
  transform: translateY(0);
}

/*
 * > 側邊欄含歷史對話時，內容區改為 flex column：
 *   品牌與導覽維持自然高度，歷史面板吃掉剩餘空間並自行捲動。
 * @ 只在這個情況覆寫 overflow，管理後台的九項導覽仍需外層可捲。
 */
.has-drawer-history :deep(.v-navigation-drawer__content) {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

/* 主要功能列不可被下方歷史對話區壓縮，避免最後一項遭到裁切。 */
.has-drawer-history > .navigation-list {
	flex: 0 0 auto;
	margin-bottom: var(--space-xs);
}

/* @ 快捷鍵提示：不搶焦點，僅在完整寬度時出現 */
.nav-hint {
  padding: 1px 5px;
  border: 1px solid rgb(var(--v-theme-outline));
  border-radius: var(--radius-sm);
  color: var(--ink-subtle);
  font-family: var(--font-mono);
  font-size: 0.62rem;
  line-height: 1.6;
}

.brand-lockup {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-logo {
  width: 56px;
  height: 40px;
  object-fit: cover;
  object-position: center 56%;
}

.navigation-list :deep(.v-list-item) {
	min-height: 36px;
	margin-block: 2px;
}

.admin-nav-group {
	min-height: 30px;
	padding-top: var(--space-sm);
	font-size: 0.7rem;
	letter-spacing: 0.08em;
}

.secondary-navigation {
	padding-block: var(--space-xs) !important;
	margin-inline: calc(var(--space-sm) * -1);
}

.app-main {
  min-width: 0;
}
</style>

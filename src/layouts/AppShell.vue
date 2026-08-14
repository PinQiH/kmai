<script setup lang="ts">
import { computed, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useDisplay, useTheme } from "vuetify"

import brandLogoUrl from "@/assets/brand/kmai-logo.png"
import { useAppStore } from "@/stores/app"
import type { NavigationItem } from "@/types"

const employeeItems: NavigationItem[] = [
  { title: "首頁", icon: "mdi-home-outline", to: "/" },
  { title: "AI 問答", icon: "mdi-message-text-outline", to: "/ask" },
  { title: "知識庫", icon: "mdi-bookshelf", to: "/library" },
  { title: "知識圖譜", icon: "mdi-graph-outline", to: "/graph" },
  { title: "我的收藏", icon: "mdi-bookmark-outline", to: "/favorites" },
]

const adminItems: NavigationItem[] = [
  { title: "管理總覽", icon: "mdi-view-dashboard-outline", to: "/admin" },
  {
    title: "文件管理",
    icon: "mdi-file-document-multiple-outline",
    to: "/admin/documents",
  },
  { title: "處理監控", icon: "mdi-progress-wrench", to: "/admin/processing" },
  { title: "圖譜管理", icon: "mdi-vector-polyline", to: "/admin/graph" },
  {
    title: "回饋與問題",
    icon: "mdi-comment-alert-outline",
    to: "/admin/feedback",
  },
  {
    title: "AI 與檢索設定",
    icon: "mdi-tune-variant",
    to: "/admin/ai-settings",
  },
  {
    title: "使用者與存取",
    icon: "mdi-account-group-outline",
    to: "/admin/access",
  },
  { title: "系統紀錄", icon: "mdi-text-box-search-outline", to: "/admin/logs" },
  { title: "系統設定", icon: "mdi-cog-outline", to: "/admin/settings" },
]

const route = useRoute()
const router = useRouter()
const theme = useTheme()
const display = useDisplay()
const appStore = useAppStore()

const isPublicPage = computed(() => Boolean(route.meta.public))
const isAdminWorkspace = computed(() => Boolean(route.meta.admin))
const isCompactLayout = computed(() => display.smAndDown.value)
const navigationItems = computed(() =>
  isAdminWorkspace.value ? adminItems : employeeItems,
)
const workspaceSwitchLabel = computed(() =>
  isAdminWorkspace.value ? "返回員工前台" : "管理後台",
)
const workspaceSwitchIcon = computed(() =>
  isAdminWorkspace.value ? "mdi-arrow-left" : "mdi-shield-account-outline",
)
const workspaceSwitchTarget = computed(() =>
  isAdminWorkspace.value ? "/" : "/admin",
)
const navigationModel = computed({
  get: () => (isCompactLayout.value ? appStore.isNavigationOpen : true),
  set: (isOpen: boolean) => {
    if (isCompactLayout.value) appStore.isNavigationOpen = isOpen
  },
})

watch(
  () => route.fullPath,
  () => {
    if (isCompactLayout.value) appStore.isNavigationOpen = false
  },
)

async function handleLogout(): Promise<void> {
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
      width="264"
      border="0"
    >
      <div class="brand-lockup px-5 py-5">
        <img :src="brandLogoUrl" alt="" class="brand-logo" aria-hidden="true" />
        <div>
          <p class="font-weight-bold">Kmai</p>
          <p class="text-caption text-medium-emphasis">
            {{ isAdminWorkspace ? "管理後台" : "凌群知識庫" }}
          </p>
        </div>
      </div>

      <VList
        nav
        :density="isAdminWorkspace ? 'compact' : 'comfortable'"
        class="px-3"
        :aria-label="isAdminWorkspace ? '管理後台導覽' : '員工前台導覽'"
      >
        <VListItem
          v-for="item in navigationItems"
          :key="item.to"
          :to="item.to"
          :prepend-icon="item.icon"
          :title="item.title"
        />
      </VList>

      <template #append>
        <VDivider />
        <VList nav class="px-3 py-3">
          <VListItem
            to="/account"
            prepend-icon="mdi-account-circle-outline"
            title="王小明"
            subtitle="產品企劃部"
          />
          <VListItem
            prepend-icon="mdi-logout"
            title="登出"
            @click="handleLogout"
          />
        </VList>
      </template>
    </VNavigationDrawer>

    <VAppBar flat border="b" height="64">
      <VAppBarNavIcon
        v-if="isCompactLayout"
        aria-label="開啟導覽"
        @click="appStore.toggleNavigation"
      />
      <VToolbarTitle class="text-body-1 font-weight-bold">{{
        route.meta.title
      }}</VToolbarTitle>
      <VSpacer />
      <VBtn
        v-if="appStore.isAdmin && !isCompactLayout"
        variant="tonal"
        :prepend-icon="workspaceSwitchIcon"
        :to="workspaceSwitchTarget"
      >
        {{ workspaceSwitchLabel }}
      </VBtn>
      <VBtn
        v-else-if="appStore.isAdmin"
        :icon="workspaceSwitchIcon"
        :aria-label="workspaceSwitchLabel"
        :to="workspaceSwitchTarget"
      >
        <VTooltip activator="parent">{{ workspaceSwitchLabel }}</VTooltip>
      </VBtn>
      <VBtn icon="mdi-magnify" aria-label="前往搜尋" to="/search" />
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
      <VBtn
        icon="mdi-help-circle-outline"
        aria-label="問題回報"
        to="/account?tab=support"
      />
    </VAppBar>

    <VMain id="main-content" class="app-main" tabindex="-1">
      <RouterView />
    </VMain>
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

.app-main {
  min-width: 0;
}
</style>

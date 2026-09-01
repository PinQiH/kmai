<script setup lang="ts">
import { onMounted, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { useTheme } from "vuetify"

import DocumentVersionTimeline from "@/components/DocumentVersionTimeline.vue"
import PageHeader from "@/components/PageHeader.vue"
import { useAppStore } from "@/stores/app"
import type { ThemeMode } from "@/theme"
import type { DocumentVersionEntry } from "@/types"

const route = useRoute()
const theme = useTheme()
const appStore = useAppStore()

function handleModeChange(mode: ThemeMode): void {
  if (mode === appStore.themeMode) return
  appStore.toggleTheme(theme)
}

const activeTab = ref("profile")
const displayName = ref("王小明")
const email = ref("employee@company.com")
const issueCategory = ref("搜尋結果")
const issueTitle = ref("")
const issueDescription = ref("")
const isSaved = ref(false)
const isIssueSubmitted = ref(false)
const emailTouched = ref(false)
const currentPassword = ref("")
const newPassword = ref("")
const confirmedPassword = ref("")
const passwordTouched = ref(false)
const passwordMessage = ref("")
const isPrivacyOpen = ref(false)

const systemReleaseHistory: DocumentVersionEntry[] = [
  {
    version: "0.2.0",
    date: "2026-08-18",
    author: "系統管理團隊",
    summary: "整理個人筆記本、網路搜尋控制與導覽體驗，準備下一次發布。",
    changes: [
      "新增個人筆記本與文件上傳介面",
      "加入筆記本分享與成員權限設定",
      "問答頁可切換是否進行網路搜尋",
    ],
    status: "即將推出",
  },
  {
    version: "0.1.0",
    date: "2026-08-14",
    author: "系統管理團隊",
    summary: "Syscom Cubi 知識管理平台第一個展示版本。",
    changes: [
      "提供企業知識搜尋與 AI 問答",
      "支援文件版本與引用追溯",
      "建立管理端健康度與處理監控",
    ],
    isCurrent: true,
  },
  {
    version: "0.0.5",
    date: "2026-08-01",
    author: "產品開發團隊",
    summary: "完成內部測試版本，確認主要知識查詢流程。",
    changes: [
      "完成側邊導覽與權限路由",
      "加入文件列表與搜尋結果頁",
      "建立淺色及深色主題",
    ],
    status: "已封存",
  },
]

const allowedTabs = new Set([
  "profile",
  "appearance",
  "security",
  "support",
  "about",
])

async function saveProfile(): Promise<void> {
  emailTouched.value = true
  if (!email.value.includes("@")) return
  // TODO(api-integration): 改為串接個人資料 API。
  isSaved.value = true
  window.setTimeout(() => {
    isSaved.value = false
  }, 2500)
}

function updatePassword(): void {
  passwordTouched.value = true
  if (
    !currentPassword.value ||
    newPassword.value.length < 8 ||
    newPassword.value !== confirmedPassword.value
  )
    return
  currentPassword.value = ""
  newPassword.value = ""
  confirmedPassword.value = ""
  passwordTouched.value = false
  passwordMessage.value = "密碼已更新，下次登入請使用新密碼。"
}

function submitIssue(): void {
  if (!issueTitle.value.trim() || !issueDescription.value.trim()) return
  isIssueSubmitted.value = true
  issueTitle.value = ""
  issueDescription.value = ""
}

function syncTabFromRoute(): void {
  const requestedTab = String(route.query.tab ?? "profile")
  activeTab.value = allowedTabs.has(requestedTab) ? requestedTab : "profile"
}

watch(() => route.query.tab, syncTabFromRoute)
onMounted(syncTabFromRoute)
</script>

<template>
  <div class="page-shell account-page">
    <PageHeader
      title="個人設定"
      description="管理個人資料、密碼、問題回報與產品資訊。"
    />
    <VTabs v-model="activeTab" color="primary" class="mb-6" show-arrows>
      <VTab value="profile">個人資料</VTab
      ><VTab value="appearance">外觀設定</VTab
      ><VTab value="security">密碼與安全</VTab
      ><VTab value="support">問題回報</VTab
      ><VTab value="about">版本與隱私</VTab>
    </VTabs>
    <VWindow v-model="activeTab">
      <VWindowItem value="profile">
        <VCard
          class="surface-border pa-6"
          tag="form"
          @submit.prevent="saveProfile"
        >
          <h2 class="section-heading mb-5">基本資料</h2>
          <VTextField v-model="displayName" label="顯示名稱" />
          <VTextField
            v-model="email"
            label="電子郵件"
            type="email"
            autocomplete="email"
            :error-messages="
              emailTouched && !email.includes('@')
                ? '請輸入有效的電子郵件地址，例如 name@company.com'
                : undefined
            "
            @blur="emailTouched = true"
          />
          <VAlert v-if="isSaved" type="success" variant="tonal" class="mb-4"
            >個人資料已更新。</VAlert
          >
          <VBtn type="submit" color="primary">儲存變更</VBtn>
        </VCard>
      </VWindowItem>
      <VWindowItem value="appearance">
        <VCard class="surface-border pa-6">
          <h2 class="section-heading mb-1">外觀</h2>
          <p class="text-body-2 text-medium-emphasis mb-5">
            可依使用習慣選擇明暗模式；系統配色由管理員統一設定。
          </p>
          <VRadioGroup
            :model-value="appStore.themeMode"
            label="明暗模式"
            inline
            @update:model-value="handleModeChange($event as ThemeMode)"
          >
            <VRadio label="淺色" value="light" />
            <VRadio label="深色" value="dark" />
          </VRadioGroup>
        </VCard>
      </VWindowItem>
      <VWindowItem value="security">
        <VCard
          class="surface-border pa-6"
          tag="form"
          @submit.prevent="updatePassword"
        >
          <h2 class="section-heading mb-5">變更密碼</h2>
          <VTextField
            v-model="currentPassword"
            label="目前密碼"
            type="password"
            autocomplete="current-password"
          />
          <VTextField
            v-model="newPassword"
            label="新密碼"
            type="password"
            autocomplete="new-password"
            hint="至少 8 個字元"
            persistent-hint
            :error-messages="
              passwordTouched && newPassword.length < 8
                ? '新密碼至少需要 8 個字元'
                : undefined
            "
            @blur="passwordTouched = true"
          />
          <VTextField
            v-model="confirmedPassword"
            label="再次輸入新密碼"
            type="password"
            autocomplete="new-password"
            :error-messages="
              passwordTouched && confirmedPassword !== newPassword
                ? '兩次輸入的密碼不一致，請重新確認'
                : undefined
            "
            @blur="passwordTouched = true"
          />
          <VAlert
            v-if="passwordMessage"
            type="success"
            variant="tonal"
            class="mb-4"
            >{{ passwordMessage }}</VAlert
          >
          <VBtn type="submit" color="primary">更新密碼</VBtn>
        </VCard>
      </VWindowItem>
      <VWindowItem value="support">
        <VCard
          class="surface-border pa-6"
          tag="form"
          @submit.prevent="submitIssue"
        >
          <h2 class="section-heading mb-2">回報使用問題</h2>
          <p class="text-body-2 text-medium-emphasis mb-5">
            請描述你原本想完成的事情，以及實際發生的情況。
          </p>
          <VSelect
            v-model="issueCategory"
            label="問題分類"
            :items="['搜尋結果', 'AI 回答', '文件內容', '帳號權限', '其他']"
          />
          <VTextField v-model="issueTitle" label="問題標題" />
          <VTextarea v-model="issueDescription" label="詳細說明" rows="5" />
          <VAlert
            v-if="isIssueSubmitted"
            type="success"
            variant="tonal"
            class="mb-4"
            >問題已送出，管理者將透過電子郵件回覆處理進度。</VAlert
          >
          <VBtn
            type="submit"
            color="primary"
            :disabled="!issueTitle.trim() || !issueDescription.trim()"
            >送出問題</VBtn
          >
        </VCard>
      </VWindowItem>
      <VWindowItem value="about">
        <VCard class="surface-border pa-6">
          <div class="about-heading mb-6">
            <div>
              <h2 class="section-heading mb-1">系統版本</h2>
              <p class="text-body-2 text-medium-emphasis">
                依發布時間查看每一版的更新內容。
              </p>
            </div>
            <VBtn
              variant="tonal"
              prepend-icon="mdi-shield-account-outline"
              @click="isPrivacyOpen = true"
              >查看隱私權政策</VBtn
            >
          </div>
          <DocumentVersionTimeline :versions="systemReleaseHistory" />
        </VCard>
      </VWindowItem>
    </VWindow>
    <VDialog v-model="isPrivacyOpen" max-width="720"
      ><VCard
        ><VCardTitle class="pa-6 pb-2">隱私權暨個人資料保護政策</VCardTitle
        ><VCardText class="pa-6 pt-2"
          ><p class="mb-3">
            Syscom Cubi
            僅在授權範圍內處理公司知識與使用紀錄，用於提供搜尋、問答、系統安全及服務改善。
          </p>
          <p>
            使用者的提問、回饋與操作紀錄會依公司治理規範保存；如需查詢或更正個人資料，請聯絡系統管理員。
          </p></VCardText
        ><VCardActions class="pa-5"
          ><VSpacer /><VBtn color="primary" @click="isPrivacyOpen = false"
            >我知道了</VBtn
          ></VCardActions
        ></VCard
      ></VDialog
    >
  </div>
</template>

<style scoped>
.account-page {
  max-width: 860px;
}

.about-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
}

@media (max-width: 600px) {
  .about-heading {
    flex-direction: column;
  }
}
</style>

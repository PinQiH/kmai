<script setup lang="ts">
import { ref } from "vue"
import { useRoute, useRouter } from "vue-router"

import brandLogoUrl from "@/assets/brand/kmai-logo.png"
import { useAppStore } from "@/stores/app"

const router = useRouter()
const route = useRoute()
const appStore = useAppStore()
const account = ref("employee@company.com")
const password = ref("demo1234")
const isSubmitting = ref(false)
const isPasswordVisible = ref(false)

async function handleLogin(): Promise<void> {
  if (!account.value || password.value.length < 8) return
  isSubmitting.value = true
  // TODO(api-integration): 改為串接身分驗證 API。
  await new Promise((resolve) => window.setTimeout(resolve, 600))
  appStore.isAuthenticated = true
  appStore.isAdmin =
    account.value.toLowerCase().includes("admin") ||
    account.value === "employee@company.com"
  isSubmitting.value = false
  const redirect =
    typeof route.query.redirect === "string" &&
    route.query.redirect.startsWith("/")
      ? route.query.redirect
      : "/"
  await router.push(redirect)
}
</script>

<template>
  <main class="login-page">
    <section class="login-intro">
      <img :src="brandLogoUrl" alt="Syscom Cubi" class="login-logo mb-8" />
      <p class="eyebrow mb-3">Syscom Cubi 凌群知識庫</p>
      <h1 class="login-title text-balance">找資料，不必先知道要問誰。</h1>
      <p class="text-medium-emphasis mt-5 reading-width">
        搜尋公司文件、詢問工作流程，並從每個答案回到原始來源。
      </p>
    </section>
    <section class="login-form-wrap">
      <VCard
        class="login-card surface-border pa-7"
        tag="form"
        @submit.prevent="handleLogin"
      >
        <h2 class="text-h5 font-weight-bold">登入</h2>
        <p class="text-body-2 text-medium-emphasis mt-2 mb-6">
          使用公司帳號繼續
        </p>
        <VTextField
          v-model="account"
          label="公司帳號"
          autocomplete="username"
          type="email"
        />
        <VTextField
          v-model="password"
          label="密碼"
          :type="isPasswordVisible ? 'text' : 'password'"
          autocomplete="current-password"
          :append-inner-icon="
            isPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'
          "
          :error-messages="
            password && password.length < 8
              ? '密碼至少需要 8 個字元'
              : undefined
          "
          @click:append-inner="isPasswordVisible = !isPasswordVisible"
        />
        <VBtn
          type="submit"
          color="primary"
          block
          size="large"
          :loading="isSubmitting"
          :disabled="!account || password.length < 8"
          >登入</VBtn
        >
        <p class="text-caption text-medium-emphasis mt-4">
          展示帳號已預先填入，可直接登入。
        </p>
      </VCard>
    </section>
  </main>
</template>

<style scoped>
.login-page {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(360px, 0.9fr);
  min-height: 100vh;
  background: rgb(var(--v-theme-background));
}

.login-intro,
.login-form-wrap {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: clamp(32px, 7vw, 112px);
}

.login-form-wrap {
  background: rgb(var(--v-theme-surface-variant));
}

.login-card {
  width: min(100%, 440px);
  margin-inline: auto;
}

.login-logo {
  width: 88px;
  height: 60px;
  object-fit: cover;
  object-position: center 56%;
}

.login-title {
  max-width: 640px;
  font-size: clamp(2.3rem, 6vw, 4.8rem);
  line-height: 1.02;
  letter-spacing: -0.055em;
}

@media (max-width: 800px) {
  .login-page {
    grid-template-columns: 1fr;
  }

  .login-intro {
    padding-bottom: 24px;
  }

  .login-form-wrap {
    padding-top: 24px;
  }
}
</style>

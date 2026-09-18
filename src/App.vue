<script setup lang="ts">
import { computed, onUnmounted } from 'vue'
import { useTheme } from 'vuetify'

import AppShell from '@/layouts/AppShell.vue'
import { useAppStore } from '@/stores/app'

const theme = useTheme()
const appStore = useAppStore()

appStore.initializeTheme(theme)
onUnmounted(() => appStore.disposeTheme())

// @ imageUrl 只會是 readBackdropImage 重新編碼的 base64 data URL，不含引號，可安全放進 CSS url()
const backdropStyle = computed(() => appStore.backdrop
	? { '--backdrop-image': `url("${appStore.backdrop.imageUrl}")`, '--backdrop-scrim': appStore.backdropScrim ?? 'transparent' }
	: undefined)
</script>

<template>
	<VApp :class="{ 'has-backdrop': appStore.backdrop }" :style="backdropStyle">
		<AppShell />
	</VApp>
</template>

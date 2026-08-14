<script setup lang="ts">
import { useTheme } from 'vuetify'

import AppShell from '@/layouts/AppShell.vue'
import { useAppStore } from '@/stores/app'

const theme = useTheme()
const appStore = useAppStore()

appStore.initializeTheme(theme)
</script>

<template>
	<VApp>
		<AppShell />
	</VApp>
</template>

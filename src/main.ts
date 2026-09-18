import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'
import '@/styles/main.css'

import { createApp } from 'vue'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { zhHant } from 'vuetify/locale'

import App from '@/App.vue'
import { router } from '@/router'
import { pinia } from '@/stores'
import { createThemeDefinitions } from '@/theme'

const vuetify = createVuetify({
	components,
	directives,
	// @ 未設定語系時，資料表格分頁等內建文字會落回英文。
	locale: {
		locale: 'zhHant',
		messages: { zhHant },
	},
	theme: {
		defaultTheme: 'kmaiLight',
		themes: createThemeDefinitions(),
	},
	defaults: {
		VBtn: { rounded: 'lg', elevation: 0 },
		VCard: { rounded: 'lg', elevation: 0 },
		VTextField: { variant: 'outlined', density: 'comfortable' },
		VSelect: { variant: 'outlined', density: 'comfortable' },
		VTextarea: { variant: 'outlined', density: 'comfortable' },
	},
})

createApp(App).use(pinia).use(router).use(vuetify).mount('#app')

import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'
import '@/styles/main.css'

import { createApp } from 'vue'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import App from '@/App.vue'
import { router } from '@/router'
import { pinia } from '@/stores'
import { darkTheme, lightTheme, redDarkTheme, redLightTheme } from '@/theme'

const vuetify = createVuetify({
	components,
	directives,
	theme: {
		defaultTheme: 'kmaiLight',
		themes: {
			kmaiLight: lightTheme,
			kmaiDark: darkTheme,
			kmaiRedLight: redLightTheme,
			kmaiRedDark: redDarkTheme,
		},
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

import type { ThemeDefinition } from 'vuetify'

export const lightTheme: ThemeDefinition = {
	dark: false,
	colors: {
		background: '#F5F4F0',
		surface: '#FFFFFF',
		'surface-variant': '#ECEAE4',
		primary: '#315C91',
		'primary-darken-1': '#24466F',
		secondary: '#596673',
		error: '#B42318',
		warning: '#9A6700',
		success: '#28724F',
		info: '#315C91',
		'on-background': '#202428',
		'on-surface': '#202428',
		outline: '#D7D5CE',
	},
}

export const darkTheme: ThemeDefinition = {
	dark: true,
	colors: {
		background: '#24282D',
		surface: '#2D3339',
		'surface-variant': '#373E45',
		primary: '#A9C8EC',
		'primary-darken-1': '#84A9D4',
		secondary: '#C2CBD4',
		error: '#FFB4AB',
		warning: '#E9C978',
		success: '#94D6B4',
		info: '#A9C8EC',
		'on-background': '#F0F2F4',
		'on-surface': '#F0F2F4',
		outline: '#707D89',
	},
}

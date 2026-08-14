<template>
	<main class="forbidden-page">
		<VCard class="surface-border pa-8 text-center" max-width="520">
			<VIcon icon="mdi-shield-lock-outline" size="48" color="warning" aria-hidden="true" />
			<h1 class="text-h4 font-weight-bold mt-5">你沒有此頁面的權限</h1>
			<p class="text-medium-emphasis mt-3">如工作需要使用此功能，請聯絡主管或系統管理員協助調整權限。</p>
			<div class="d-flex flex-wrap justify-center ga-2 mt-6"><VBtn to="/" color="primary">回到首頁</VBtn><VBtn to="/login" variant="outlined">改用其他帳號</VBtn></div>
		</VCard>
	</main>
</template>

<style scoped>
.forbidden-page {
	display: grid;
	place-items: center;
	min-height: 100vh;
	padding: 24px;
	background: rgb(var(--v-theme-background));
}
</style>

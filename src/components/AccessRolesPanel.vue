<script setup lang="ts">
import { computed, ref } from 'vue'

import FilterSearchField from '@/components/FilterSearchField.vue'
import { useMasterDetailDraft } from '@/composables/useMasterDetailDraft'

import {
	CAPABILITIES,
	RESOURCE_LABELS,
	accessState,
	createRole,
	deleteRole,
	getRole,
	getRoleDeleteBlocker,
	getRoleUsage,
	ADMIN_ACCESS_CAPABILITY,
	ADMIN_ONLY_CAPABILITY_CODES,
	isRoleLocked,
	updateRole,
	type RoleDraft,
} from '@/mocks/access'

const emit = defineEmits<{ notify: [text: string, tone?: 'success' | 'error'] }>()

// @ system.admin 只屬於 SYSTEM_ADMIN，不讓其他角色勾選
const capabilityGroups = computed(() => {
	const groups = new Map<string, typeof CAPABILITIES>()
	CAPABILITIES.filter((capability) => capability.resource !== 'system').forEach((capability) => {
		groups.set(capability.resource, [...(groups.get(capability.resource) ?? []), capability])
	})
	return [...groups.entries()].map(([resource, items]) => ({ resource, label: RESOURCE_LABELS[resource] ?? resource, items }))
})

const search = ref('')
const confirmDelete = ref(false)

const { selectedId, pendingId, form, errors, isDirty, isCreating, resetForm, requestSelect, discardAndSwitch, clearError } = useMasterDetailDraft<RoleDraft>({
	initialId: accessState.roles[0]?.id ?? null,
	draftFromSelection: draftFromRole,
})

const filteredRoles = computed(() => {
	const keyword = search.value?.trim().toLowerCase() ?? ''
	return accessState.roles.filter((role) => !keyword || `${role.name} ${role.code} ${role.description}`.toLowerCase().includes(keyword))
})
const selectedRole = computed(() => (selectedId.value ? getRole(selectedId.value) : undefined))
const locked = computed(() => Boolean(selectedRole.value && isRoleLocked(selectedRole.value)))
const usage = computed(() => (selectedRole.value ? getRoleUsage(selectedRole.value.id) : null))
const deleteBlocker = computed(() => (selectedRole.value ? getRoleDeleteBlocker(selectedRole.value.id) : null))

function draftFromRole(id: string | null): RoleDraft {
	const role = id ? getRole(id) : undefined
	return role ? { code: role.code, name: role.name, description: role.description, capabilityCodes: [...role.capabilityCodes] } : { code: '', name: '', description: '', capabilityCodes: ['km.portal.access'] }
}

function toggleCapability(code: string, checked: boolean | null): void {
	let next = checked ? [...form.capabilityCodes, code] : form.capabilityCodes.filter((item) => item !== code)
	// @ 勾管理類權限時自動帶上「進入管理後台」；取消後台時一併取消依賴它的權限
	if (checked && ADMIN_ONLY_CAPABILITY_CODES.includes(code) && !next.includes(ADMIN_ACCESS_CAPABILITY)) next.push(ADMIN_ACCESS_CAPABILITY)
	if (!checked && code === ADMIN_ACCESS_CAPABILITY) next = next.filter((item) => !ADMIN_ONLY_CAPABILITY_CODES.includes(item))
	form.capabilityCodes = next
	clearError('capabilityCodes')
}

function save(): void {
	if (isCreating.value) {
		const result = createRole(form)
		if (!result.ok) { errors.value = result.errors; return }
		selectedId.value = result.value.id
		emit('notify', `已新增角色「${result.value.name}」。`)
		return
	}
	if (!selectedRole.value) return
	const result = updateRole(selectedRole.value.id, form)
	if (!result.ok) { errors.value = result.errors; return }
	resetForm()
	emit('notify', `已儲存角色「${form.name}」。`)
}

function remove(): void {
	const role = selectedRole.value
	confirmDelete.value = false
	if (!role) return
	const result = deleteRole(role.id)
	if (!result.ok) { emit('notify', result.errors.form, 'error'); return }
	selectedId.value = accessState.roles[0]?.id ?? null
	emit('notify', `已刪除角色「${role.name}」。`)
}

defineExpose({ isDirty })
</script>

<template>
	<div class="split">
		<section class="list-pane" aria-label="角色清單">
			<VBtn color="primary" variant="tonal" block prepend-icon="mdi-shield-plus-outline" class="mb-3" data-testid="roles-create" :active="isCreating" @click="requestSelect(null)">新增角色</VBtn>
			<FilterSearchField v-model="search" label="搜尋角色" density="compact" class="mb-3" />
			<ul class="item-list">
				<li v-if="isCreating"><span class="item-row is-active"><span class="item-top"><strong>新角色</strong></span><span class="item-sub">尚未儲存</span></span></li>
				<li v-for="role in filteredRoles" :key="role.id">
					<button type="button" class="item-row" :class="{ 'is-active': role.id === selectedId }" :aria-current="role.id === selectedId ? 'true' : undefined" @click="requestSelect(role.id)">
						<span class="item-top">
							<strong>{{ role.name }}</strong>
							<VIcon v-if="isRoleLocked(role)" icon="mdi-lock-outline" size="16" aria-label="保護角色" />
						</span>
						<span class="item-sub"><code>{{ role.code }}</code> · {{ getRoleUsage(role.id).effectiveUsers }} 人持有</span>
					</button>
				</li>
				<li v-if="!filteredRoles.length" class="empty-note">沒有符合的角色</li>
			</ul>
		</section>

		<section class="detail-pane" :aria-label="isCreating ? '新增角色' : '角色設定'">
			<header class="detail-head">
				<div>
					<p class="eyebrow-sm">{{ isCreating ? '新增角色' : selectedRole?.isSystem ? '內建角色' : '自訂角色' }}</p>
					<h2 class="section-heading">{{ isCreating ? '新角色' : selectedRole?.name }}</h2>
				</div>
				<div v-if="!locked" class="d-flex ga-2 flex-wrap">
					<VBtn v-if="!isCreating" variant="text" color="error" :disabled="Boolean(deleteBlocker)" @click="confirmDelete = true">刪除</VBtn>
					<VBtn v-if="isDirty && !isCreating" variant="text" @click="resetForm">取消變更</VBtn>
					<VBtn color="primary" :disabled="!isDirty && !isCreating" data-testid="role-save" @click="save">{{ isCreating ? '建立角色' : '儲存變更' }}</VBtn>
				</div>
			</header>

			<VAlert v-if="locked" type="info" variant="tonal" density="compact" class="mb-4" icon="mdi-lock-outline">系統管理員是保護角色，擁有全部權限且不可修改或刪除。要授予這個角色，請到「使用者」或「群組」指派。</VAlert>
			<VAlert v-if="errors.form" type="error" variant="tonal" density="compact" class="mb-4">{{ errors.form }}</VAlert>
			<p v-if="usage" class="note mb-4">
				直接指派給 {{ usage.users }} 位使用者、{{ usage.groups }} 個群組，含群組繼承共 {{ usage.effectiveUsers }} 人持有。
				<template v-if="deleteBlocker && !locked">刪除限制：{{ deleteBlocker }}。</template>
			</p>

			<div class="form-grid">
				<VTextField v-model="form.name" label="角色名稱" :readonly="locked" :error-messages="errors.name" counter="30" @update:model-value="clearError('name')" />
				<VTextField v-model="form.code" label="角色代碼" :disabled="!isCreating" :hint="isCreating ? '建立後不可修改，例如 DEPT_EDITOR' : '建立後不可修改'" persistent-hint :error-messages="errors.code" @update:model-value="clearError('code')" />
				<VTextField v-model="form.description" label="說明" class="span-2" :readonly="locked" :error-messages="errors.description" counter="200" />
			</div>

			<h3 class="sub-heading">功能權限 <span class="note">已選 {{ locked ? '全部' : form.capabilityCodes.length }} 項</span></h3>
			<VAlert v-if="errors.capabilityCodes" type="error" variant="tonal" density="compact" class="mb-3">{{ errors.capabilityCodes }}</VAlert>
			<div v-if="!locked" class="capability-groups">
				<fieldset v-for="group in capabilityGroups" :key="group.resource" class="capability-group">
					<legend>{{ group.label }}</legend>
					<VCheckbox v-for="capability in group.items" :key="capability.code" :model-value="form.capabilityCodes.includes(capability.code)" density="compact" hide-details @update:model-value="toggleCapability(capability.code, $event)">
						<template #label><span class="cap-label"><span>{{ capability.name }}</span><small>{{ capability.description }}</small></span></template>
					</VCheckbox>
				</fieldset>
			</div>
		</section>

		<VDialog :model-value="pendingId !== undefined" max-width="440" @update:model-value="pendingId = undefined">
			<VCard title="捨棄未儲存的變更？" text="目前角色有尚未儲存的設定，切換後會遺失。">
				<VCardActions><VSpacer /><VBtn @click="pendingId = undefined">繼續編輯</VBtn><VBtn color="error" @click="discardAndSwitch">捨棄變更</VBtn></VCardActions>
			</VCard>
		</VDialog>
		<VDialog v-model="confirmDelete" max-width="440">
			<VCard title="刪除角色" :text="`確定刪除「${selectedRole?.name ?? ''}」？此操作無法復原。`">
				<VCardActions><VSpacer /><VBtn @click="confirmDelete = false">取消</VBtn><VBtn color="error" @click="remove">刪除</VBtn></VCardActions>
			</VCard>
		</VDialog>
	</div>
</template>

<style scoped src="./access-panel.css"></style>
<style scoped>
.capability-groups { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.capability-group { border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); border-radius: 8px; padding: 8px 12px 10px; }
.capability-group legend { padding: 0 6px; font-size: 0.8125rem; font-weight: 600; }
.cap-label { display: flex; flex-direction: column; line-height: 1.3; }
.cap-label small { color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)); }
</style>

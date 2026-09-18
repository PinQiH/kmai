import { createPinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it } from 'vitest'

import {
	CURRENT_USER_ID,
	SYSTEM_ADMIN_ROLE_ID,
	accessState,
	createGroup,
	createRole,
	createUser,
	deleteGroup,
	deleteRole,
	getEffectiveCapabilityCodes,
	getEffectiveRoles,
	getUser,
	grantsAdminAccess,
	resetAccessState,
	resetUserPassword,
	setUsersStatus,
	updateGroup,
	updateRole,
	updateUser,
} from '@/mocks/access'
import AdminAccessView from '@/views/admin/AdminAccessView.vue'

globalThis.ResizeObserver = class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
} as typeof ResizeObserver

beforeEach(() => resetAccessState())

const newUser = { account: 'new.user', email: 'new.user@syscom.com.tw', displayName: '新同仁', status: 'active' as const, roleIds: ['role-km-user'], groupIds: [], temporaryPassword: '' }

describe('access state: users', () => {
	it('01. 有效角色包含上層群組繼承，並標示來源', () => {
		const roles = getEffectiveRoles(getUser('user-wang')!)
		expect(roles.map((entry) => entry.role.code)).toEqual(expect.arrayContaining(['KM_USER', 'KM_CONTRIBUTOR']))
		expect(roles.find((entry) => entry.role.code === 'KM_USER')?.sources).toEqual(['群組：全公司（上層）'])
	})

	it('02. 系統管理員的有效權限為全部', () => {
		expect(getEffectiveCapabilityCodes(getUser('user-sysadmin')!)).toContain('km.access.manage')
	})

	it('03. 建立帳號時帳號、Email 不可重複，並回傳一次性臨時密碼', () => {
		expect(createUser({ ...newUser, account: 'yjlin', email: 'YJLIN@syscom.com.tw' })).toMatchObject({ ok: false, errors: { account: expect.any(String), email: expect.any(String) } })
		const result = createUser(newUser)
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.value.temporaryPassword).toHaveLength(12)
		expect(JSON.stringify(accessState.users)).not.toContain(result.value.temporaryPassword)
		expect(getUser(result.value.userId)).toMatchObject({ source: 'local', mustChangePassword: true })
	})

	it('04. 自訂臨時密碼少於 8 碼不可建立', () => {
		expect(createUser({ ...newUser, temporaryPassword: 'short' })).toMatchObject({ ok: false, errors: { temporaryPassword: expect.any(String) } })
	})

	it('05. 非系統管理員不能指派系統管理員角色', () => {
		const user = getUser('user-wang')!
		expect(updateUser(user.id, { ...user, roleIds: [SYSTEM_ADMIN_ROLE_ID] })).toMatchObject({ ok: false, errors: { roleIds: expect.any(String) } })
		expect(updateUser(user.id, { ...user, roleIds: [SYSTEM_ADMIN_ROLE_ID] }, 'user-sysadmin').ok).toBe(true)
	})

	it('06. 不能停用自己、非管理員不能停用系統管理員、不能移除最後一位系統管理員', () => {
		const self = getUser(CURRENT_USER_ID)!
		expect(updateUser(self.id, { ...self, status: 'suspended' })).toMatchObject({ ok: false, errors: { status: expect.any(String) } })
		const admin = getUser('user-sysadmin')!
		expect(updateUser(admin.id, { ...admin, status: 'disabled' })).toMatchObject({ ok: false, errors: { status: expect.stringContaining('只有系統管理員') } })
		expect(updateUser(admin.id, { ...admin, roleIds: [] }, 'user-sysadmin')).toMatchObject({ ok: false, errors: { status: expect.stringContaining('最後一位') } })
	})

	it('07. SSO 群組成員不可手動調整，本機群組可以', () => {
		const user = getUser('user-wang')!
		expect(updateUser(user.id, { ...user, groupIds: [] }).ok).toBe(false)
		expect(updateUser(user.id, { ...user, groupIds: [...user.groupIds, 'group-helpdesk-project'] }).ok).toBe(true)
	})

	it('08. 批次停用會略過不允許的帳號並回報原因', () => {
		const result = setUsersStatus(['user-chen', CURRENT_USER_ID, 'user-sysadmin'], 'disabled')
		expect(result.changed).toEqual(['user-chen'])
		expect(result.skipped.map((item) => item.userId)).toEqual([CURRENT_USER_ID, 'user-sysadmin'])
	})

	it('09. SSO 帳號不能重設密碼，本機帳號重設後須變更密碼', () => {
		expect(resetUserPassword('user-wang').ok).toBe(false)
		expect(resetUserPassword('user-consultant').ok).toBe(true)
	})
})

describe('access state: roles and groups', () => {
	it('10. 角色代碼需合法且不重複，不可勾選系統管理權限', () => {
		const draft = { code: 'km_user', name: '新角色', description: '', capabilityCodes: [] }
		expect(createRole(draft)).toMatchObject({ ok: false, errors: { code: expect.any(String) } })
		expect(createRole({ ...draft, code: 'DEPT_EDITOR', capabilityCodes: ['system.admin'] })).toMatchObject({ ok: false, errors: { capabilityCodes: expect.any(String) } })
		expect(createRole({ ...draft, code: 'DEPT_EDITOR' }).ok).toBe(true)
	})

	it('11. 系統管理員角色不可修改，使用中或內建角色不可刪除', () => {
		const admin = accessState.roles.find((role) => role.id === SYSTEM_ADMIN_ROLE_ID)!
		expect(updateRole(admin.id, { ...admin, name: '改名' }).ok).toBe(false)
		expect(deleteRole('role-km-user').ok).toBe(false)
		expect(deleteRole('role-km-reviewer').ok).toBe(false)
	})

	it('12. 移除自己唯一的權限管理能力會被擋下', () => {
		const manager = accessState.roles.find((role) => role.id === 'role-km-manager')!
		expect(updateRole(manager.id, { ...manager, capabilityCodes: manager.capabilityCodes.filter((code) => code !== 'km.access.manage') })).toMatchObject({ ok: false, errors: { capabilityCodes: expect.any(String) } })
	})

	it('13. 群組不可形成循環，SSO 群組只能改角色', () => {
		const company = accessState.groups.find((group) => group.id === 'group-company')!
		expect(updateGroup(company.id, { ...company, name: '改名' })).toMatchObject({ ok: false, errors: { form: expect.any(String) } })
		expect(updateGroup(company.id, { ...company, roleIds: [] }).ok).toBe(true)
		const created = createGroup({ name: '導入小組', type: 'team', parentId: 'group-helpdesk-project', roleIds: [] })
		expect(created.ok).toBe(true)
		expect(updateGroup('group-helpdesk-project', { name: '客服知識庫導入專案', type: 'project', parentId: created.ok ? created.value.id : null, roleIds: [] })).toMatchObject({ ok: false, errors: { parentId: expect.any(String) } })
	})

	it('14. 有成員或子群組的群組不可刪除', () => {
		expect(deleteGroup('group-helpdesk-project').ok).toBe(false)
		const created = createGroup({ name: '空群組', type: 'team', parentId: null, roleIds: [] })
		expect(created.ok && deleteGroup(created.value.id).ok).toBe(true)
	})
})

describe('admin access', () => {
	it('16. 是否能進管理後台由「進入管理後台」權限決定，管理類權限必須搭配它', () => {
		const draft = { code: 'AUDITOR', name: '稽核員', description: '', capabilityCodes: ['km.audit.read'] }
		expect(createRole(draft)).toMatchObject({ ok: false, errors: { capabilityCodes: expect.any(String) } })
		expect(createRole({ ...draft, capabilityCodes: ['km.admin.access', 'km.audit.read'] }).ok).toBe(true)
		const role = (id: string) => accessState.roles.find((item) => item.id === id)!.capabilityCodes
		expect(grantsAdminAccess(role('role-km-user'))).toBe(false)
		expect(grantsAdminAccess(role('role-km-reviewer'))).toBe(true)
		expect(grantsAdminAccess(role(SYSTEM_ADMIN_ROLE_ID))).toBe(true)
	})
})

describe('AdminAccessView', () => {
	it('15. 清單顯示使用者、繼承角色標記與帳號概況', async () => {
		const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/admin/access', component: AdminAccessView }] })
		await router.push('/admin/access')
		const wrapper = mount(AdminAccessView, { global: { plugins: [router, createPinia(), createVuetify({ components, directives })] } })
		await flushPromises()
		expect(wrapper.text()).toContain('王小明')
		expect(wrapper.text()).toContain('一般使用者*')
		expect(wrapper.text()).toContain('啟用但從未登入')
		expect(wrapper.text()).toContain('新增使用者')
		wrapper.unmount()
	})
})

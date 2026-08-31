import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router"

import { useAppStore } from "@/stores/app"
import { pinia } from "@/stores"

export interface AccessContext {
	isAuthenticated: boolean
	isAdmin: boolean
	mustChangePassword: boolean
}

export interface AccessRequirement {
	public?: boolean
	admin?: boolean
	passwordChange?: boolean
}

/**
 * 判斷使用者是否可存取指定路由。
 * @param requirement 路由所需條件。
 * @param context 目前使用者的登入與角色狀態。
 * @returns 允許存取時回傳 true。
 */
export function canAccessRoute(
	requirement: AccessRequirement,
	context: AccessContext,
): boolean {
	if (requirement.public) return true
	if (!context.isAuthenticated) return false
	if (context.mustChangePassword && !requirement.passwordChange) return false
	if (requirement.admin && !context.isAdmin) return false
	return true
}

const routes: RouteRecordRaw[] = [
	{
		path: "/login",
		name: "login",
		component: () => import("@/views/LoginView.vue"),
		meta: { public: true, title: "登入" },
	},
	{
		path: "/change-password",
		name: "change-password",
		component: () => import("@/views/ChangePasswordView.vue"),
		meta: { passwordChange: true, title: "設定新密碼" },
	},
	{
		path: "/",
		name: "home",
		component: () => import("@/views/HomeView.vue"),
		meta: { title: "首頁" },
	},
	{
		path: "/search",
		name: "search",
		component: () => import("@/views/SearchView.vue"),
		meta: { title: "搜尋" },
	},
	{
		path: "/ask",
		name: "ask",
		component: () => import("@/views/AskView.vue"),
		meta: { title: "AI 問答" },
	},
	{
		path: "/library",
		name: "library",
		component: () => import("@/views/LibraryView.vue"),
		meta: { title: "知識庫" },
	},
	{
		path: "/notebooks",
		name: "notebooks",
		component: () => import("@/views/NotebooksView.vue"),
		meta: { title: "個人筆記本" },
	},
	{
		path: "/notebooks/:id",
		name: "notebook-detail",
		component: () => import("@/views/NotebookDetailView.vue"),
		meta: { title: "筆記本內容" },
	},
	{
		path: "/documents/:id",
		name: "document",
		component: () => import("@/views/DocumentView.vue"),
		meta: { title: "文件詳情" },
	},
	{
		path: "/graph",
		name: "graph",
		component: () => import("@/views/GraphView.vue"),
		meta: { title: "知識圖譜" },
	},
	{
		path: "/favorites",
		name: "favorites",
		component: () => import("@/views/FavoritesView.vue"),
		meta: { title: "我的收藏" },
	},
	{
		path: "/notifications",
		name: "notifications",
		component: () => import("@/views/NotificationsView.vue"),
		meta: { title: "通知中心" },
	},
	{
		path: "/account",
		name: "account",
		component: () => import("@/views/AccountView.vue"),
		meta: { title: "個人設定" },
	},
	{
		path: "/admin",
		name: "admin-overview",
		component: () => import("@/views/admin/AdminOverviewView.vue"),
		meta: { admin: true, title: "管理總覽" },
	},
	{
		path: "/admin/documents",
		name: "admin-documents",
		component: () => import("@/views/admin/AdminDocumentsView.vue"),
		meta: { admin: true, title: "文件管理" },
	},
	{
		path: "/admin/documents/:id/manage",
		name: "admin-document-detail",
		component: () => import("@/views/admin/AdminDocumentDetailView.vue"),
		meta: { admin: true, title: "文件管理詳情" },
	},
	{
		path: "/admin/documents/upload",
		name: "admin-upload",
		component: () => import("@/views/admin/AdminUploadView.vue"),
		meta: { admin: true, title: "新增文件" },
	},
	{
		path: "/admin/processing",
		name: "admin-processing",
		component: () => import("@/views/admin/AdminProcessingView.vue"),
		meta: { admin: true, title: "處理監控" },
	},
	{
		path: "/admin/monitoring",
		name: "admin-monitoring",
		component: () => import("@/views/admin/AdminMonitoringView.vue"),
		meta: { admin: true, title: "營運監控" },
	},
	{
		path: "/admin/notifications",
		name: "admin-notifications",
		component: () => import("@/views/admin/AdminNotificationsView.vue"),
		meta: { admin: true, title: "通知管理" },
	},
	{
		path: "/admin/graph",
		name: "admin-graph",
		component: () => import("@/views/admin/AdminWorkspaceView.vue"),
		meta: { admin: true, workspace: "graph", title: "圖譜管理" },
	},
	{
		path: "/admin/feedback",
		name: "admin-feedback",
		component: () => import("@/views/admin/AdminWorkspaceView.vue"),
		meta: { admin: true, workspace: "feedback", title: "回饋與問題" },
	},
	{
		path: "/admin/ai-settings",
		name: "admin-ai",
		component: () => import("@/views/admin/AdminWorkspaceView.vue"),
		meta: { admin: true, workspace: "ai", title: "AI 與檢索設定" },
	},
	{
		path: "/admin/access",
		name: "admin-access",
		component: () => import("@/views/admin/AdminWorkspaceView.vue"),
		meta: { admin: true, workspace: "access", title: "使用者與存取" },
	},
	{
		path: "/admin/logs",
		name: "admin-logs",
		component: () => import("@/views/admin/AdminSystemRecordsView.vue"),
		meta: { admin: true, workspace: "logs", title: "系統紀錄" },
	},
	{
		path: "/admin/settings",
		name: "admin-settings",
		component: () => import("@/views/admin/AdminWorkspaceView.vue"),
		meta: { admin: true, workspace: "settings", title: "系統設定" },
	},
	{
		path: "/forbidden",
		name: "forbidden",
		component: () => import("@/views/ForbiddenView.vue"),
		meta: { public: true, title: "禁止存取" },
	},
	{ path: "/:pathMatch(.*)*", redirect: "/" },
]

export const router = createRouter({
	history: createWebHashHistory(import.meta.env.BASE_URL),
	routes,
	scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach((to) => {
	const appStore = useAppStore(pinia)
	const requirement: AccessRequirement = {
		public: Boolean(to.meta.public),
		admin: Boolean(to.meta.admin),
		passwordChange: Boolean(to.meta.passwordChange),
	}
	const context: AccessContext = {
		isAuthenticated: appStore.isAuthenticated,
		isAdmin: appStore.isAdmin,
		mustChangePassword: appStore.mustChangePassword,
	}

	if (canAccessRoute(requirement, context)) return true
	if (!appStore.isAuthenticated)
		return { name: "login", query: { redirect: to.fullPath } }
	if (appStore.mustChangePassword) return { name: "change-password" }
	return { name: "forbidden" }
})

router.afterEach((to) => {
	document.title = `${String(to.meta.title ?? "凌群知識庫")}｜Syscom Cubi`
	window.requestAnimationFrame(() => {
		document
			.querySelector<HTMLElement>("#main-content")
			?.focus({ preventScroll: true })
	})
})

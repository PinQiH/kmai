// > 知識圖譜畫布的共用型別
// @ 放在 SFC 外部：`<script setup>` 不允許 export，知識庫與筆記本兩邊都由這裡取用

export interface KnowledgeGraphCanvasNode {
	id: string
	label: string
	/** 節點類型，顯示在無障礙名稱與詳情面板，也是類型篩選的依據 */
	type: string
	/** 所屬主題群，決定顏色與力導向的初始佈局 */
	cluster: string
}

export interface KnowledgeGraphCanvasEdge {
	from: string
	to: string
}

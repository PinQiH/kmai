---
name: Kmai
description: 像查閱一份可信公司手冊般，快速找到有根據的答案。
colors:
  archive-indigo: "#315C91"
  archive-indigo-deep: "#24466F"
  paper-white: "#FFFFFF"
  warm-canvas: "#F5F4F0"
  graphite-ink: "#202428"
  quiet-rule: "#D7D5CE"
  positive-green: "#28724F"
  warning-amber: "#9A6700"
  critical-red: "#B42318"
  night-canvas: "#24282D"
  night-surface: "#2D3339"
  night-surface-variant: "#373E45"
  night-primary: "#A9C8EC"
  night-ink: "#F0F2F4"
  night-rule: "#707D89"
typography:
  display:
    fontFamily: "Noto Sans TC, Microsoft JhengHei, system-ui, sans-serif"
    fontSize: "clamp(2.4rem, 6vw, 4.8rem)"
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: "-0.055em"
  headline:
    fontFamily: "Noto Sans TC, Microsoft JhengHei, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 3vw, 2.35rem)"
    fontWeight: 650
    lineHeight: 1.18
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Noto Sans TC, Microsoft JhengHei, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "8px"
  md: "12px"
  lg: "14px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.archive-indigo}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
  search-field:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.graphite-ink}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
  content-card:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.graphite-ink}"
    rounded: "{rounded.md}"
    padding: "20px"
---

# Design System: Kmai

## 1. Overview

**Creative North Star: "The Living Field Guide"**

Kmai 應像一本持續更新、容易翻閱的公司工作手冊：資訊安靜地排列，重點在需要時才浮現。整體採瑞士式網格、紙張般的淺色表面與節制的單一重點色，讓搜尋、答案與來源本身成為視覺焦點。

介面延續「可靠、平靜、俐落」的產品個性，吸收 Google 搜尋的直接性、Notion 的內容閱讀感與 Linear 的操作效率。動態只用於回應操作與交代狀態，不用於裝飾。系統明確拒絕通用 AI SaaS 的紫藍漸層、發光邊框、巨大 AI 圖示、漂浮卡片與滿版卡片牆。

**Key Characteristics:**

- 搜尋與提問永遠是最清楚的第一步。
- 以穩定網格、留白和字級建立層級，不以裝飾堆疊層級。
- 來源、版本與狀態緊鄰內容呈現，信任資訊不藏在第二層。
- 管理介面可提高密度，但仍維持清楚分組與可掃讀性。
- 介面在 150–220ms 內回應，減少動態模式下移除非必要轉場。

## 2. Colors

採低彩度暖灰與紙白作為主要表面，以深石墨承載文字，單一靛藍只標示主要操作、連結、焦點與選取狀態。所有色彩均由 `src/theme.ts` 的 Vuetify semantic theme 統一套用。

深色模式採柔和石墨灰而非接近純黑的背景，透過 `Night Canvas`、`Night Surface` 與 `Night Surface Variant` 三層亮度建立結構，降低長時間閱讀的壓迫感。

### Primary

- **Archive Indigo**：主要操作、可點擊文字、鍵盤焦點與目前選取狀態。

### Neutral

- **Paper White**：主要工作表面與閱讀區。
- **Warm Canvas**：應用程式底色與區域分層。
- **Graphite Ink**：主要文字與高重要度圖示。
- **Quiet Rule**：邊界、分隔與停用狀態。

**The Ten Percent Rule.** Archive Indigo 在任何畫面中不得超過約 10%；它的稀少性用來維持清楚的操作優先順序。

**The Meaning Before Color Rule.** 狀態必須同時具有文字、圖示或形狀差異，禁止只靠顏色傳達。

## 3. Typography

**Display Font:** Noto Sans TC，回退至 Microsoft JhengHei 與系統無襯線字體
**Body Font:** Noto Sans TC，回退至 Microsoft JhengHei 與系統無襯線字體

**Character:** 字形應自然、開放且容易長時間閱讀。標題依靠尺寸與粗細形成層級，不使用超大字、全大寫標題或刻意科技感字型。

### Hierarchy

- **Display**（700，clamp 2.4–4.8rem，1.04）：僅用於登入或首頁的核心提問，不出現在一般管理頁。
- **Headline**（650，clamp 1.75–2.35rem，1.18）：頁面標題與主要結果摘要。
- **Title**（650，1.1rem）：區塊、文件與對話標題。
- **Body**（400，1rem，1.5）：答案、文件與說明文字；長文最大寬度 760px。
- **Label**（700，0.78rem，0.08em）：小型分類標籤；只在 eyebrow 使用大寫轉換。

**The Reading First Rule.** 任何視覺效果都不得降低文件、答案與引用內容的閱讀速度。

## 4. Elevation

介面預設平坦，以色調差、細邊界與空間建立層次。陰影只用於暫時浮在內容上方的選單、對話框與拖曳項目，不用來讓每張卡片看起來可點擊。

**The Flat by Default Rule.** 靜止表面不得使用裝飾性陰影；若一個頁面看起來像一面浮動卡片牆，層級設計即為失敗。

## 5. Components

### Buttons

- **Shape:** 穩定且輕微圓角（8px），主要按鈕使用 Archive Indigo；文字與圖示操作使用 tonal 或 text variant。
- **Hover / Focus:** 不位移版面；使用色調變化與 3px 可見焦點框。

### Inputs / Fields

- **Style:** 具永久 label 的 outlined 欄位；核心搜尋欄使用 14px 圓角與 Paper White 表面。
- **Focus:** Archive Indigo 邊界與焦點框；錯誤訊息直接顯示於欄位旁。

### Cards / Containers

- **Corner Style:** 12px 圓角與 1px Quiet Rule 邊界。
- **Shadow Strategy:** 靜止狀態無陰影，hover 只改變邊界色。
- **Internal Padding:** 主要使用 16px、20px 或 24px。

### Navigation

- 桌面使用 264px 左側工作導覽；員工前台與管理後台使用各自獨立的選單，管理者透過頂部工作區切換按鈕往返。中小螢幕改為 temporary drawer。

### Answer and Citation

- 使用者問題以 quiet surface 呈現；AI 回答使用有邊界的閱讀表面。引用緊鄰回答，詳細證據由右側抽屜展開。

## 6. Do's and Don'ts

### Do:

- **Do** 讓搜尋框或提問入口成為員工首頁最明確的互動焦點。
- **Do** 使用穩定網格、清楚字級與留白組織內容。
- **Do** 讓來源、版本、適用範圍與處理狀態在需要判斷時立即可見。
- **Do** 為 Loading、Error、Empty 與 Success 提供明確文字及可行動的下一步。
- **Do** 維持完整鍵盤操作、可見焦點、足夠對比與減少動態支援。

### Don't:

- **Don't** 採用大量漸層、發光效果、漂浮卡片與裝飾性機器人圖像的通用 AI SaaS 樣板。
- **Don't** 以過多儀表板卡片、圖表或技術術語堆疊資訊。
- **Don't** 讓聊天介面壟斷所有工作流程；搜尋、文件閱讀與管理操作必須使用最合適的互動模式。
- **Don't** 隱藏回答依據，也不要把 AI 回答表現成無條件正確。
- **Don't** 使用紫藍漸層、發光邊框、巨大 AI 圖示或滿版卡片牆。

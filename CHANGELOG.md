# 更新公告

## v2.2.0 開拓轶事重構版 - 2026-08-29

### 修复
- 修复读取存档后游戏主界面黑屏的问题：重构版丢失的「游戏主界面」渲染分支（GameView + 手机快捷菜单 + 全部游戏内弹层）已从原版完整恢复，读档后可正常进入游戏界面
- 修复相册系统面板无法渲染的问题（系统菜单渲染函数补回相册分支）
- 修复 GitHub Pages 子路径部署下智库内置预设全部 404 的问题：内置预设请求改为按构建期 base（import.meta.env.BASE_URL）解析，子路径部署（/KaiTuoYiShi_re/）与根路径部署均兼容

### 原版存档兼容
- 验证并固化对原版 KaiTuoYiShi 存档包（ktysave v2）的完整导入支持：解析 → 读档归一化 → 非法清单拒绝
- 新增回归测试 `pnpm test:original-save-import`（现场构造原版格式存档包，不依赖大型二进制 fixture）

### 重大更新
- 專案遷移至新倉庫：Tim6682/KaiTuoYiShi_re
- 完善專案結構與模組化架構
- 全系統 TypeScript 嚴格模式覆蓋
- 新增 150+ 回歸測試腳本覆蓋所有核心功能
- CI/CD 整合：GitHub Pages + Cloudflare Pages 雙部署管道

### 核心系統完善
- **主劇情系統**：流式/非流式回復、重開局、重 roll、行動選項
- **世界書與提示詞**：內置/額外世界書分欄、開局預設注入 IndexedDB
- **變量系統**：獨立變量模型、結構化歸檔、NPC 歸一化層、錯誤字段過濾
- **伙伴系統**：伙伴/路人分欄、好感度、同行記憶、頭像/立繪/NSFW 档案預留
- **背包與裝備**：方格 UI、8 個裝備槽位、AI 寫入物品解析兜底
- **記憶系統**：即時/短期/長期三層、NPC 同行記憶、壓縮閾值配置
- **手機系統**：獨立通訊終端、聯繫人/會話/主動來信種子
- **新聞與劇情編織**：星際和平周報、原著/自制劇情軌道、智庫檢索
- **相册與文生圖**：角色中心管理、生成隊列、規則中心、NPC 圖像档案

### 技術棧升級
- React 19 + TypeScript 5.8 + Vite 6
- Tailwind CSS 3 + Storybook 10
- IndexedDB 本地存儲 + 多 AI 提供商支持
- pnpm 10.15.0 包管理

## v1.2.6 OpenCode Zen 修复及工作流程优化版 - 2026-07-23

### 修复 OpenCode Zen 模型获取
- 修复了 OpenCode Zen 在选择 openai_compatible 提供商时无法获取模型列表的问题
- 移除了冗余的 handleOpenCodeModelFetch 函数存根
- 确保 OpenCode Zen 检测和模型获取函数正常工作
- 修复了 fetchOpenCodeModels 函数中的多余闭合括号，解决 TypeScript TS1128 错误
- 添加了 fetchMimoModels、fetchGeminiModels、fetchClaudeModels、fetchBaiduQianfanModels、fetchArkModels、fetchPioneerModels 存根函数以及 testConnection 函数，解决 TS2305 错误
- 在 App.tsx 中添加 /// <reference types="vite-client" /> 指令，解决 ImportMeta env 错误
- 重新排序了函数定义以确保所有引用在声明前可见

### 修复 GitHub Actions 工作流程
- 解决了 pnpm 版本规范冲突（在 workflow 中移除了重复的版本指定）
- 确保 workflow 使用 package.json 中指定的 pnpm 版本

## v1.2.5 Hugging Face 支持版 - 2026-07-23
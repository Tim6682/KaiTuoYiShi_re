# 更新公告

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
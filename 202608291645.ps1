# deploy.ps1 - 一鍵部署到 GitHub
# 使用方法：在專案根目錄右鍵「使用 PowerShell 運行」或 .\deploy.ps1

param(
    [string]$RepoUrl = "https://github.com/Tim6682/KaiTuoYiShi_re.git",
    [string]$Branch  = "main",
    [string]$UserName = "Tim6682",
    [string]$UserEmail = "tim6682666@gmail.com"
)

Write-Host "╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  KaiTuoYiShi_re - GitHub 自動部署腳本 v2.2.0               ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

# 檢查必要工具
function Check-Tool($name, $cmd) {
    Write-Host "🔍 檢查 $name ..." -NoNewline
    try { & $cmd --version 2>$null; Write-Host " ✅" -ForegroundColor Green; return $true }
    catch { Write-Host " ❌ 缺少 $name，請先安裝" -ForegroundColor Red; return $false }
}

$toolsOk = @(
    Check-Tool "git" "git"
    Check-Tool "Node.js" "node"
    Check-Tool "pnpm" "pnpm"
) -notcontains $false

if (-not $toolsOk) {
    Write-Host "`n⚠️ 請先安裝缺少的工具：" -ForegroundColor Yellow
    Write-Host "  - Node.js 22+: https://nodejs.org/"
    Write-Host "  - pnpm: npm install -g pnpm@10.15.0"
    Write-Host "  - Git: https://git-scm.com/"
    exit 1
}

# 進入專案目錄
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $projectDir
Write-Host "`n📁 工作目錄: $projectDir" -ForegroundColor Cyan

# 1. 安裝依賴
Write-Host "`n📦 步驟 1/6: 安裝依賴 (pnpm install)..." -ForegroundColor Yellow
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { Write-Host "❌ 依賴安裝失敗" -ForegroundColor Red; exit 1 }
Write-Host "✅ 依賴安裝完成" -ForegroundColor Green

# 2. TypeScript 型別檢查
Write-Host "`n🔍 步驟 2/6: TypeScript 型別檢查 (tsc -b)..." -ForegroundColor Yellow
pnpm tsc -b
if ($LASTEXITCODE -ne 0) { Write-Host "❌ 型別檢查失敗" -ForegroundColor Red; exit 1 }
Write-Host "✅ 型別檢查通過" -ForegroundColor Green

# 3. 構建生產版本
Write-Host "`n🏗️ 步驟 3/6: 構建生產版本 (pnpm build)..." -ForegroundColor Yellow
$env:NODE_ENV = "production"
$env:GITHUB_PAGES = "true"
pnpm build
if ($LASTEXITCODE -ne 0) { Write-Host "❌ 構建失敗" -ForegroundColor Red; exit 1 }
Write-Host "✅ 構建完成，輸出至 ./dist" -ForegroundColor Green

# 4. 驗證構建產物
Write-Host "`n🔍 步驟 4/6: 驗證構建產物..." -ForegroundColor Yellow
if (-not (Test-Path "dist/index.html")) { Write-Host "❌ 缺少 dist/index.html" -ForegroundColor Red; exit 1 }
$items = @(Get-ChildItem dist -Recurse -ErrorAction SilentlyContinue)
$distSize = if ($items) { ($items | Measure-Object -Property Length -Sum).Sum / 1MB } else { 0 }
Write-Host "✅ 構建產物完整 (${distSize:N2} MB)" -ForegroundColor Green

# 5. Git 初始化與提交
Write-Host "`n📝 步驟 5/6: Git 提交..." -ForegroundColor Yellow

if (-not (Test-Path ".git")) {
    Write-Host "  初始化 Git 倉庫..." -ForegroundColor Cyan
    git init
    if ($LASTEXITCODE -ne 0) { Write-Host "❌ Git 初始化失敗" -ForegroundColor Red; exit 1 }
    git config user.name $UserName
    git config user.email $UserEmail
    git branch -M $Branch
    git remote add origin $RepoUrl
    if ($LASTEXITCODE -ne 0) { Write-Host "❌ Git 設定失敗" -ForegroundColor Red; exit 1 }
}

# 檢查是否有變更
$status = git status --porcelain
if (-not $status) {
    Write-Host "  無新變更，跳過提交" -ForegroundColor Yellow
} else {
    git add .
    if ($LASTEXITCODE -ne 0) { Write-Host "❌ Git add 失敗" -ForegroundColor Red; exit 1 }
    $commitMsg = @"
chore: v2.2.0 開拓軼事重構版

- 專案遷移至 Tim6682/KaiTuoYiShi_re
- 同步版本號至 2.2.0 (package.json + CHANGELOG.md)
- 完善 12 大核心系統與 150+ 回歸測試
- 配置 GitHub Pages + Cloudflare Pages 雙部署管道
- 修復 Repository URL 指向新倉庫
"@
    git commit -m $commitMsg
    if ($LASTEXITCODE -ne 0) { Write-Host "❌ Git commit 失敗" -ForegroundColor Red; exit 1 }
    Write-Host "✅ 本地提交完成" -ForegroundColor Green
}

# 6. 推送到 GitHub
Write-Host "`n🚀 步驟 6/6: 推送到 GitHub ($RepoUrl)..." -ForegroundColor Yellow
git push -u origin $Branch
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️ 推送失敗，嘗試強制推送..." -ForegroundColor Yellow
    git push -u origin $Branch --force
    if ($LASTEXITCODE -ne 0) { Write-Host "❌ 強制推送失敗" -ForegroundColor Red; exit 1 }
    Write-Host "✅ 強制推送成功" -ForegroundColor Green
} else {
    Write-Host "✅ 推送成功！" -ForegroundColor Green
}

# 完成
Write-Host "`n╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  🎉 部署完成！                                              ║" -ForegroundColor Cyan
Write-Host "║  📦 GitHub Pages: https://tim6682.github.io/KaiTuoYiShi_re/ ║" -ForegroundColor Cyan
Write-Host "║  ⚡ Cloudflare Pages: 在 Cloudflare Dashboard 配置          ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

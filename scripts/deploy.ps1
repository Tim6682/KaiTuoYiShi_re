<# 
.SYNOPSIS
    開拓軼事 - Windows PowerShell 部署腳本
    支援：生產部署、預覽部署、自動版本標記

.DESCRIPTION
    部署到 Cloudflare Pages 的 PowerShell 腳本，
    提供與 deploy.sh 相同功能但相容 Windows 環境。

.PARAMETER Environment
    部署環境: Production | Preview (預設: Production)

.PARAMETER ProjectName
    Cloudflare Pages 專案名稱 (預設: kaituoyishi)

.PARAMETER Branch
    Git 分支名稱 (預設: main)

.PARAMETER SkipTests
    跳過測試

.PARAMETER SkipBuild
    跳過建置 (僅部署已存在的 dist/)

.PARAMETER DryRun
    僅顯示將執行的指令，不實際執行

.PARAMETER Verbose
    詳細輸出

.EXAMPLE
    .\scripts\deploy.ps1
    # 部署到生產環境

.EXAMPLE
    .\scripts\deploy.ps1 -Environment Preview
    # 部署到預覽環境

.EXAMPLE
    .\scripts\deploy.ps1 -SkipTests -Verbose
    # 跳過測試，詳細輸出
#>

param(
    [ValidateSet('Production', 'Preview')]
    [string]$Environment = 'Production',

    [string]$ProjectName = 'kaituoyishi',

    [string]$Branch = 'main',

    [switch]$SkipTests,

    [switch]$SkipBuild,

    [switch]$DryRun,

    [switch]$Verbose
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# 顏色輸出函數
function Write-Log {
    param(
        [string]$Message,
        [ValidateSet('Info', 'Success', 'Warn', 'Error')]
        [string]$Level = 'Info'
    )
    $color = switch ($Level) {
        'Info'    { 'Cyan' }
        'Success' { 'Green' }
        'Warn'    { 'Yellow' }
        'Error'   { 'Red' }
    }
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] [$Level] $Message" -ForegroundColor $color
}

function Invoke-CommandSafe {
    param([string]$Command)
    if ($Verbose) { Write-Log "執行: $Command" 'Info' }
    if ($DryRun) {
        Write-Host "[DRY-RUN] $Command" -ForegroundColor 'Gray'
        return
    }
    try {
        Invoke-Expression $Command
    } catch {
        Write-Log "指令執行失敗: $Command" 'Error'
        Write-Log $_.Exception.Message 'Error'
        exit 1
    }
}

# 主流程
Write-Host @"
╔══════════════════════════════════════════╗
║    開拓軼事 - Cloudflare Pages 部署     ║
╚══════════════════════════════════════════╝
"@ -ForegroundColor 'Cyan'

Write-Log "環境: $Environment"
Write-Log "專案: $ProjectName"
Write-Log "分支: $Branch"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectRoot = Split-Path -Parent $scriptDir

# 設定專案名稱
if ($Environment -eq 'Preview') {
    $ProjectName = "${ProjectName}-preview"
}

# 檢查前置需求
Write-Log "檢查前置需求..." 'Info'

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Log "未找到 pnpm，請先安裝: npm install -g pnpm" 'Error'
    exit 1
}

$wranglerCmd = if (Get-Command wrangler -ErrorAction SilentlyContinue) { 'wrangler' } else { 'npx wrangler' }

if (-not $DryRun) {
    try {
        & $wranglerCmd whoami | Out-Null
    } catch {
        Write-Log "未登入 Cloudflare，請先執行: wrangler login" 'Error'
        exit 1
    }
}

# 檢查 Git 狀態
if (Test-Path "$projectRoot\.git") {
    Push-Location $projectRoot
    $status = (git status --porcelain 2>$null).Count
    if ($status -gt 0) {
        Write-Log "工作目錄有 $status 個未提交的變更" 'Warn'
    }
    Pop-Location
}

Write-Log "前置需求檢查完成" 'Success'

# 執行測試
if (-not $SkipTests) {
    Write-Log "執行測試套件..." 'Info'
    Push-Location $projectRoot
    
    $testCmds = @(
        'pnpm test:api-connection',
        'pnpm test:settings-save',
        'pnpm test:story-weaving',
        'pnpm test:save-package'
    )
    
    foreach ($cmd in $testCmds) {
        Write-Log "執行: $cmd" 'Info'
        Invoke-CommandSafe $cmd
    }
    
    Pop-Location
    Write-Log "所有測試通過" 'Success'
} else {
    Write-Log "跳過測試 (-SkipTests)" 'Warn'
}

# 建置專案
if (-not $SkipBuild) {
    Write-Log "開始建置專案..." 'Info'
    Push-Location $projectRoot
    Invoke-CommandSafe 'pnpm build'
    
    if (-not (Test-Path "$projectRoot\dist")) {
        Write-Log "建置失敗：未生成 dist 目錄" 'Error'
        exit 1
    }
    
    $distSize = (Get-ChildItem "$projectRoot\dist" -Recurse | Measure-Object -Property Length -Sum).Sum
    $distSizeMB = [math]::Round($distSize / 1MB, 2)
    Write-Log "建置完成，輸出大小: ${distSizeMB} MB" 'Success'
    Pop-Location
} else {
    Write-Log "跳過建置 (-SkipBuild)" 'Warn'
    if (-not (Test-Path "$projectRoot\dist")) {
        Write-Log "dist 目錄不存在，無法跳過建置" 'Error'
        exit 1
    }
}

# 部署到 Cloudflare Pages
Write-Log "部署到 Cloudflare Pages ($Environment)..." 'Info'
Push-Location $projectRoot

$deployCmd = "$wranglerCmd pages deploy dist --project-name=$ProjectName --branch=$Branch"
if ($Environment -eq 'Preview') {
    $deployCmd += ' --preview'
}

Invoke-CommandSafe $deployCmd

Write-Log "部署成功！" 'Success'

if ($Environment -eq 'Production') {
    Write-Log "生產環境網址: https://$ProjectName.pages.dev" 'Info'
} else {
    Write-Log "預覽環境網址: https://$ProjectName.pages.dev" 'Info'
}

Pop-Location

# 建立部署標籤 (僅生產環境)
if ($Environment -eq 'Production' -and -not $DryRun) {
    Write-Log "建立部署標籤..." 'Info'
    Push-Location $projectRoot
    
    $tag = "deploy/$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    $commitHash = (git rev-parse --short HEAD).Trim()
    
    try {
        Invoke-CommandSafe "git tag -a '$tag' -m '部署 $Environment 環境於 $(Get-Date -Format "yyyy-MM-dd HH:mm:ss") - commit: $commitHash'"
        Invoke-CommandSafe "git push origin '$tag'"
        Write-Log "已建立並推送標籤: $tag" 'Success'
    } catch {
        Write-Log "建立標籤失敗 (可能已存在)，跳過" 'Warn'
    }
    Pop-Location
}

Write-Log "🎉 部署流程完成！" 'Success'
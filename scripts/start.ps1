<#
.SYNOPSIS
    開拓軼事 - Windows PowerShell 啟動腳本
    支援：開發模式、生產預覽、Docker 啟動

.DESCRIPTION
    本地開發/生產啟動的 PowerShell 腳本，
    提供與 start.sh 相同功能但相容 Windows 環境。

.PARAMETER Mode
    啟動模式: Dev | Preview | Docker (預設: Dev)

.PARAMETER Port
    監聽埠號 (預設: 3000)

.PARAMETER Host
    監聽主機 (預設: 0.0.0.0)

.PARAMETER OpenBrowser
    啟動後自動開啟瀏覽器

.PARAMETER Build
    Preview 模式下先建置

.PARAMETER Verbose
    詳細輸出

.EXAMPLE
    .\scripts\start.ps1
    # 開發模式啟動

.EXAMPLE
    .\scripts\start.ps1 -Mode Preview -Build
    # 建置並啟動生產預覽

.EXAMPLE
    .\scripts\start.ps1 -Mode Dev -OpenBrowser
    # 開發模式並自動開啟瀏覽器

.EXAMPLE
    .\scripts\start.ps1 -Mode Docker
    # 使用 Docker 啟動
#>

param(
    [ValidateSet('Dev', 'Preview', 'Docker')]
    [string]$Mode = 'Dev',

    [int]$Port = 3000,

    [string]$Host = '0.0.0.0',

    [switch]$OpenBrowser,

    [switch]$Build,

    [switch]$Verbose
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

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
    try {
        Invoke-Expression $Command
    } catch {
        Write-Log "指令執行失敗: $Command" 'Error'
        Write-Log $_.Exception.Message 'Error'
        exit 1
    }
}

Write-Host @"
╔══════════════════════════════════════════╗
║      開拓軼事 - 本地啟動腳本            ║
╚══════════════════════════════════════════╝
"@ -ForegroundColor 'Cyan'

Write-Log "模式: $Mode"
Write-Log "埠號: $Port"
Write-Log "主機: $Host"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectRoot = Split-Path -Parent $scriptDir

# 檢查環境
Write-Log "檢查環境..." 'Info'

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Log "未找到 pnpm，請先安裝: npm install -g pnpm" 'Error'
    exit 1
}

if (-not (Test-Path "$projectRoot\package.json")) {
    Write-Log "找不到 package.json，請確認在專案根目錄執行" 'Error'
    exit 1
}

if (-not (Test-Path "$projectRoot\node_modules")) {
    Write-Log "未找到 node_modules，正在安裝依賴..." 'Warn'
    Invoke-CommandSafe "cd '$projectRoot'; pnpm install"
}

Write-Log "環境檢查完成" 'Success'

Push-Location $projectRoot

switch ($Mode) {
    'Dev' {
        Write-Log "啟動開發伺服器 (埠: $Port, 主機: $Host)..." 'Info'
        
        $viteCmd = "pnpm dev -- --port $Port --host $Host"
        if ($OpenBrowser) { $viteCmd += ' --open' }
        
        Write-Log "開發伺服器啟動中... 訪問: http://$Host:$Port" 'Success'
        Write-Log "按 Ctrl+C 停止" 'Info'
        
        Invoke-CommandSafe $viteCmd
    }
    
    'Preview' {
        Write-Log "啟動生產預覽模式..." 'Info'
        
        if ($Build -or -not (Test-Path "$projectRoot\dist")) {
            Write-Log "建置生產版本..." 'Info'
            Invoke-CommandSafe 'pnpm build'
        }
        
        $previewCmd = "pnpm preview -- --port $Port --host $Host"
        if ($OpenBrowser) { $previewCmd += ' --open' }
        
        Write-Log "預覽伺服器啟動中... 訪問: http://$Host:$Port" 'Success'
        Write-Log "按 Ctrl+C 停止" 'Info'
        
        Invoke-CommandSafe $previewCmd
    }
    
    'Docker' {
        Write-Log "使用 Docker 啟動..." 'Info'
        
        if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
            Write-Log "未找到 Docker，請先安裝 Docker Desktop" 'Error'
            exit 1
        }
        
        if (-not (Test-Path "$projectRoot\Dockerfile")) {
            Write-Log "未找到 Dockerfile，建立預設 Dockerfile..." 'Warn'
            $dockerfileContent = @'
# 開拓軼事 - Docker 映像
# 多階段建置：建置階段 + 生產階段

# 建置階段
FROM node:22-alpine AS builder

WORKDIR /app

# 啟用 corepack 並使用 pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# 複製 package 檔案
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# 安裝依賴
RUN pnpm install --frozen-lockfile

# 複製原始碼
COPY . .

# 建置生產版本
RUN pnpm build

# 生產階段 - 使用輕量級 Nginx
FROM nginx:alpine AS production

# 複製建置產物
COPY --from=builder /app/dist /usr/share/nginx/html

# 複製 Nginx 設定
COPY <<'NGINX_CONF' /etc/nginx/conf.d/default.conf
server {
    listen 3000;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # SPA 路由支援
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 靜態資源快取
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # 安全標頭
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header Referrer-Policy "strict-origin-when-cross-origin";

    # Gzip 壓縮
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml application/json;
}
NGINX_CONF

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
'@
            Set-Content -Path "$projectRoot\Dockerfile" -Value $dockerfileContent -Encoding UTF8
            Write-Log "已建立 Dockerfile" 'Success'
        }
        
        $imageName = "kaituoyishi:local"
        $containerName = "kaituoyishi-dev"
        
        # 停止現有容器
        $existing = docker ps -a --format '{{.Names}}' | Where-Object { $_ -eq $containerName }
        if ($existing) {
            Write-Log "停止現有容器: $containerName" 'Info'
            Invoke-CommandSafe "docker stop $containerName"
            Invoke-CommandSafe "docker rm $containerName"
        }
        
        # 建置映像
        Write-Log "建置 Docker 映像: $imageName" 'Info'
        Invoke-CommandSafe "docker build -t $imageName ."
        
        # 啟動容器
        Write-Log "啟動容器: $containerName" 'Info'
        Invoke-CommandSafe "docker run -d --name $containerName -p $Port:3000 --restart unless-stopped $imageName"
        
        Write-Log "容器啟動成功！訪問: http://localhost:$Port" 'Success'
        Write-Log "查看日誌: docker logs -f $containerName" 'Info'
        Write-Log "停止容器: docker stop $containerName" 'Info'
    }
}

Pop-Location
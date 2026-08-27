#!/usr/bin/env bash
# ===========================================
# 開拓軼事 - 本地開發/生產啟動腳本
# 支援：開發模式、生產預覽、Docker 啟動
# ===========================================

set -euo pipefail

# 顏色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 預設值
MODE="dev"
PORT=3000
HOST="0.0.0.0"
OPEN_BROWSER=false
DOCKER_MODE=false
BUILD_FIRST=false
VERBOSE=false

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

log_info() { echo -e "${BLUE}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

usage() {
    cat <<EOF
用法: $0 [選項]

模式:
  dev         開發模式 (預設) - 熱重載、開發工具
  preview     生產預覽模式 - 建置後用 vite preview 啟動
  docker      Docker 容器模式

選項:
  -m, --mode MODE         啟動模式: dev | preview | docker (預設: dev)
  -p, --port PORT         監聽埠號 (預設: 3000)
  -H, --host HOST         監聽主機 (預設: 0.0.0.0)
  -o, --open              啟動後自動開啟瀏覽器
  --build                 preview 模式下先建置
  -v, --verbose           詳細輸出
  -h, --help              顯示此說明

範例:
  $0                      # 開發模式啟動
  $0 -m preview --build   # 建置並啟動生產預覽
  $0 -m dev -o            # 開發模式並自動開啟瀏覽器
  $0 -m docker            # 使用 Docker 啟動
EOF
}

while [[ $# -gt 0 ]]; do
    case $1 in
        -m|--mode)
            MODE="$2"
            shift 2
            ;;
        -p|--port)
            PORT="$2"
            shift 2
            ;;
        -H|--host)
            HOST="$2"
            shift 2
            ;;
        -o|--open)
            OPEN_BROWSER=true
            shift
            ;;
        --build)
            BUILD_FIRST=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            log_error "未知選項: $1"
            usage
            exit 1
            ;;
    esac
done

if [[ "$MODE" != "dev" && "$MODE" != "preview" && "$MODE" != "docker" ]]; then
    log_error "模式必須是 'dev'、'preview' 或 'docker'"
    exit 1
fi

run_cmd() {
    local cmd="$*"
    if [[ "$VERBOSE" == true ]]; then
        log_info "執行: $cmd"
    fi
    eval "$cmd"
}

check_prerequisites() {
    log_info "檢查環境..."
    
    if ! command -v pnpm &> /dev/null; then
        log_error "未找到 pnpm，請先安裝: npm install -g pnpm"
        exit 1
    fi
    
    if [[ ! -f "$PROJECT_ROOT/package.json" ]]; then
        log_error "找不到 package.json，請確認在專案根目錄執行"
        exit 1
    fi
    
    # 檢查 node_modules
    if [[ ! -d "$PROJECT_ROOT/node_modules" ]]; then
        log_warn "未找到 node_modules，正在安裝依賴..."
        run_cmd "cd \"$PROJECT_ROOT\" && pnpm install"
    fi
    
    log_success "環境檢查完成"
}

start_dev() {
    log_info "啟動開發伺服器 (埠: $PORT, 主機: $HOST)..."
    cd "$PROJECT_ROOT"
    
    local vite_cmd="pnpm dev -- --port $PORT --host $HOST"
    if [[ "$OPEN_BROWSER" == true ]]; then
        vite_cmd="$vite_cmd --open"
    fi
    
    log_success "開發伺服器啟動中... 訪問: http://$HOST:$PORT"
    log_info "按 Ctrl+C 停止"
    
    exec $vite_cmd
}

start_preview() {
    log_info "啟動生產預覽模式..."
    cd "$PROJECT_ROOT"
    
    if [[ "$BUILD_FIRST" == true || ! -d "$PROJECT_ROOT/dist" ]]; then
        log_info "建置生產版本..."
        run_cmd "pnpm build"
    fi
    
    local preview_cmd="pnpm preview -- --port $PORT --host $HOST"
    if [[ "$OPEN_BROWSER" == true ]]; then
        preview_cmd="$preview_cmd --open"
    fi
    
    log_success "預覽伺服器啟動中... 訪問: http://$HOST:$PORT"
    log_info "按 Ctrl+C 停止"
    
    exec $preview_cmd
}

start_docker() {
    log_info "使用 Docker 啟動..."
    cd "$PROJECT_ROOT"
    
    # 檢查 Docker
    if ! command -v docker &> /dev/null; then
        log_error "未找到 Docker，請先安裝 Docker"
        exit 1
    fi
    
    # 檢查 Dockerfile
    if [[ ! -f "$PROJECT_ROOT/Dockerfile" ]]; then
        log_warn "未找到 Dockerfile，建立預設 Dockerfile..."
        create_dockerfile
    fi
    
    local image_name="kaituoyishi:local"
    local container_name="kaituoyishi-dev"
    
    # 停止現有容器
    if docker ps -a --format '{{.Names}}' | grep -q "^$container_name$"; then
        log_info "停止現有容器: $container_name"
        run_cmd "docker stop $container_name && docker rm $container_name"
    fi
    
    # 建置映像
    log_info "建置 Docker 映像: $image_name"
    run_cmd "docker build -t $image_name ."
    
    # 啟動容器
    log_info "啟動容器: $container_name"
    run_cmd "docker run -d --name $container_name -p $PORT:3000 --restart unless-stopped $image_name"
    
    log_success "容器啟動成功！訪問: http://localhost:$PORT"
    log_info "查看日誌: docker logs -f $container_name"
    log_info "停止容器: docker stop $container_name"
}

create_dockerfile() {
    cat > "$PROJECT_ROOT/Dockerfile" <<'EOF'
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
EOF
    log_success "已建立 Dockerfile"
}

main() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════╗"
    echo "║      開拓軼事 - 本地啟動腳本            ║"
    echo "╚══════════════════════════════════════════╝"
    echo -e "${NC}"
    
    log_info "模式: $MODE"
    log_info "埠號: $PORT"
    log_info "主機: $HOST"
    
    check_prerequisites
    
    case $MODE in
        dev)
            start_dev
            ;;
        preview)
            start_preview
            ;;
        docker)
            start_docker
            ;;
    esac
}

main "$@"
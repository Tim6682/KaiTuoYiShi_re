#!/usr/bin/env bash
# ===========================================
# 開拓軼事 - Cloudflare Pages 部署腳本
# 支援：生產部署、預覽部署、自動版本標記
# ===========================================

set -euo pipefail

# 顏色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 預設值
ENVIRONMENT="production"
PROJECT_NAME="kaituoyishi"
BRANCH="main"
SKIP_TESTS=false
SKIP_BUILD=false
DRY_RUN=false
VERBOSE=false

# 專案根目錄
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# ===========================================
# 輔助函數
# ===========================================
log_info() { echo -e "${BLUE}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

usage() {
    cat <<EOF
用法: $0 [選項]

選項:
  -e, --env ENV           部署環境: production | preview (預設: production)
  -p, --project NAME      Cloudflare Pages 專案名稱 (預設: kaituoyishi)
  -b, --branch BRANCH     Git 分支名稱 (預設: main)
  --skip-tests            跳過測試
  --skip-build            跳過建置 (僅部署已存在的 dist/)
  --dry-run               僅顯示將執行的指令，不實際執行
  -v, --verbose           詳細輸出
  -h, --help              顯示此說明

範例:
  $0                              # 部署到生產環境
  $0 -e preview                   # 部署到預覽環境
  $0 --skip-tests                 # 跳過測試直接部署
  $0 --dry-run -v                 # 查看將執行的指令
EOF
}

# 解析參數
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--env)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -p|--project)
            PROJECT_NAME="$2"
            shift 2
            ;;
        -b|--branch)
            BRANCH="$2"
            shift 2
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
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

# 驗證環境
if [[ "$ENVIRONMENT" != "production" && "$ENVIRONMENT" != "preview" ]]; then
    log_error "環境必須是 'production' 或 'preview'"
    exit 1
fi

# 設定專案名稱
if [[ "$ENVIRONMENT" == "preview" ]]; then
    PROJECT_NAME="${PROJECT_NAME}-preview"
fi

# ===========================================
# 執行函數
# ===========================================
run_cmd() {
    local cmd="$*"
    if [[ "$VERBOSE" == true ]]; then
        log_info "執行: $cmd"
    fi
    if [[ "$DRY_RUN" == true ]]; then
        echo "[DRY-RUN] $cmd"
        return 0
    fi
    eval "$cmd"
}

check_prerequisites() {
    log_info "檢查前置需求..."
    
    # 檢查 pnpm
    if ! command -v pnpm &> /dev/null; then
        log_error "未找到 pnpm，請先安裝: npm install -g pnpm"
        exit 1
    fi
    
    # 檢查 wrangler
    if ! command -v wrangler &> /dev/null; then
        log_warn "未在 PATH 中找到 wrangler，將使用 npx"
        WRANGLER_CMD="npx wrangler"
    else
        WRANGLER_CMD="wrangler"
    fi
    
    # 檢查 Cloudflare 登入狀態
    if [[ "$DRY_RUN" == false ]]; then
        if ! $WRANGLER_CMD whoami &> /dev/null; then
            log_error "未登入 Cloudflare，請先執行: wrangler login"
            exit 1
        fi
    fi
    
    # 檢查 Git 狀態
    if [[ -d "$PROJECT_ROOT/.git" ]]; then
        cd "$PROJECT_ROOT"
        local status=$(git status --porcelain 2>/dev/null | wc -l)
        if [[ $status -gt 0 ]]; then
            log_warn "工作目錄有未提交的變更，建議先提交或暫存"
        fi
    fi
    
    log_success "前置需求檢查完成"
}

run_tests() {
    if [[ "$SKIP_TESTS" == true ]]; then
        log_warn "跳過測試 (--skip-tests)"
        return 0
    fi
    
    log_info "執行測試套件..."
    cd "$PROJECT_ROOT"
    
    # 執行關鍵測試
    local test_cmds=(
        "pnpm test:api-connection"
        "pnpm test:settings-save"
        "pnpm test:story-weaving"
        "pnpm test:save-package"
    )
    
    for cmd in "${test_cmds[@]}"; do
        log_info "執行: $cmd"
        if ! run_cmd "$cmd"; then
            log_error "測試失敗: $cmd"
            exit 1
        fi
    done
    
    log_success "所有測試通過"
}

build_project() {
    if [[ "$SKIP_BUILD" == true ]]; then
        log_warn "跳過建置 (--skip-build)"
        if [[ ! -d "$PROJECT_ROOT/dist" ]]; then
            log_error "dist/ 目錄不存在，無法跳過建置"
            exit 1
        fi
        return 0
    fi
    
    log_info "開始建置專案..."
    cd "$PROJECT_ROOT"
    
    # 清理並建置
    run_cmd "pnpm build"
    
    # 驗證建置結果
    if [[ ! -d "$PROJECT_ROOT/dist" ]]; then
        log_error "建置失敗：未生成 dist/ 目錄"
        exit 1
    fi
    
    local dist_size=$(du -sh "$PROJECT_ROOT/dist" | cut -f1)
    log_success "建置完成，輸出大小: $dist_size"
}

deploy_to_cf() {
    log_info "部署到 Cloudflare Pages ($ENVIRONMENT)..."
    cd "$PROJECT_ROOT"
    
    local deploy_cmd="$WRANGLER_CMD pages deploy dist --project-name=$PROJECT_NAME --branch=$BRANCH"
    
    if [[ "$ENVIRONMENT" == "preview" ]]; then
        deploy_cmd="$deploy_cmd --preview"
    fi
    
    if ! run_cmd "$deploy_cmd"; then
        log_error "部署失敗"
        exit 1
    fi
    
    log_success "部署成功！"
    
    # 顯示部署資訊
    if [[ "$ENVIRONMENT" == "production" ]]; then
        log_info "生產環境網址: https://$PROJECT_NAME.pages.dev"
    else
        log_info "預覽環境網址: https://$PROJECT_NAME.pages.dev"
    fi
}

create_deployment_tag() {
    if [[ "$ENVIRONMENT" != "production" || "$DRY_RUN" == true ]]; then
        return 0
    fi
    
    log_info "建立部署標籤..."
    cd "$PROJECT_ROOT"
    
    local tag="deploy/$(date +%Y%m%d-%H%M%S)"
    local commit_hash=$(git rev-parse --short HEAD)
    
    if run_cmd "git tag -a \"$tag\" -m \"部署 $ENVIRONMENT 環境於 $(date '+%Y-%m-%d %H:%M:%S') - commit: $commit_hash\""; then
        run_cmd "git push origin \"$tag\""
        log_success "已建立並推送標籤: $tag"
    else
        log_warn "建立標籤失敗 (可能已存在)，跳過"
    fi
}

# ===========================================
# 主流程
# ===========================================
main() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════╗"
    echo "║    開拓軼事 - Cloudflare Pages 部署     ║"
    echo "╚══════════════════════════════════════════╝"
    echo -e "${NC}"
    
    log_info "環境: $ENVIRONMENT"
    log_info "專案: $PROJECT_NAME"
    log_info "分支: $BRANCH"
    log_info "專案根目錄: $PROJECT_ROOT"
    
    check_prerequisites
    run_tests
    build_project
    deploy_to_cf
    create_deployment_tag
    
    log_success "🎉 部署流程完成！"
}

main "$@"
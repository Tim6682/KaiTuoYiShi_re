@echo off
REM ===========================================
REM 開拓軼事 - Windows 批次部署腳本
REM 雙擊即可執行部署到 Cloudflare Pages
REM ===========================================

chcp 65001 >nul
title 開拓軼事 - 部署器

echo.
echo ╔══════════════════════════════════════════╗
echo ║      開拓軼事 - 部署器                  ║
echo ╚══════════════════════════════════════════╝
echo.

echo 選擇部署環境：
echo   1) 生產環境 (預設) - kaituoyishi.pages.dev
echo   2) 預覽環境 - kaituoyishi-preview.pages.dev
echo   3) 生產環境 (跳過測試)
echo   4) 預覽環境 (跳過測試)
echo   5) 乾跑模式 (只顯示指令不執行)
echo.

set /p choice=請輸入選項 [1-5] (預設 1): 
if "%choice%"=="" set choice=1

set SKIP_TESTS=
set DRY_RUN=

if "%choice%"=="1" (
    echo.
    echo 部署到生產環境...
    powershell -ExecutionPolicy Bypass -File "%~dp0scripts\deploy.ps1" -Environment Production
) else if "%choice%"=="2" (
    echo.
    echo 部署到預覽環境...
    powershell -ExecutionPolicy Bypass -File "%~dp0scripts\deploy.ps1" -Environment Preview
) else if "%choice%"=="3" (
    echo.
    echo 部署到生產環境 (跳過測試)...
    powershell -ExecutionPolicy Bypass -File "%~dp0scripts\deploy.ps1" -Environment Production -SkipTests
) else if "%choice%"=="4" (
    echo.
    echo 部署到預覽環境 (跳過測試)...
    powershell -ExecutionPolicy Bypass -File "%~dp0scripts\deploy.ps1" -Environment Preview -SkipTests
) else if "%choice%"=="5" (
    echo.
    echo 乾跑模式 (生產環境)...
    powershell -ExecutionPolicy Bypass -File "%~dp0scripts\deploy.ps1" -Environment Production -DryRun -Verbose
) else (
    echo 無效選項
    pause
    exit /b 1
)

echo.
echo 部署流程結束
pause
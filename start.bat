@echo off
REM ===========================================
REM 開拓軼事 - Windows 批次啟動腳本
REM 雙擊即可執行，預設開發模式
REM ===========================================

chcp 65001 >nul
title 開拓軼事 - 啟動器

echo.
echo ╔══════════════════════════════════════════╗
echo ║      開拓軼事 - 本地啟動器              ║
echo ╚══════════════════════════════════════════╝
echo.

echo 選擇啟動模式：
echo   1) 開發模式 (預設) - 熱重載、開發工具
echo   2) 生產預覽模式 - 建置後預覽
echo   3) Docker 模式 - 容器化部署
echo   4) 僅安裝依賴
echo.

set /p choice=請輸入選項 [1-4] (預設 1): 
if "%choice%"=="" set choice=1

if "%choice%"=="1" (
    echo.
    echo 啟動開發模式...
    powershell -ExecutionPolicy Bypass -File "%~dp0start.ps1" -Mode Dev -OpenBrowser
) else if "%choice%"=="2" (
    echo.
    echo 啟動生產預覽模式...
    powershell -ExecutionPolicy Bypass -File "%~dp0start.ps1" -Mode Preview -Build -OpenBrowser
) else if "%choice%"=="3" (
    echo.
    echo 啟動 Docker 模式...
    powershell -ExecutionPolicy Bypass -File "%~dp0start.ps1" -Mode Docker
) else if "%choice%"=="4" (
    echo.
    echo 安裝依賴...
    pnpm install
    echo.
    echo 完成！按任意鍵退出...
    pause >nul
) else (
    echo 無效選項
    pause
)
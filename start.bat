@echo off
chcp 65001 >nul
echo ========================================
echo    AI Agent 工具 - 启动中...
echo ========================================
echo.

REM 检查 Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 Python，请先安装 Python 3.8+
    pause
    exit /b 1
)

REM 安装依赖
echo [1/2] 检查依赖...
pip install flask requests flask-cors -q

REM 启动服务
echo [2/2] 启动服务...
echo.
start "" http://localhost:5000
python app.py

pause

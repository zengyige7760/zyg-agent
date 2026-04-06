#!/bin/bash
echo "========================================"
echo "   AI Agent 工具 - 启动中..."
echo "========================================"
echo ""

# 检查 Python
if ! command -v python3 &> /dev/null && ! command -v python &> /dev/null; then
    echo "[错误] 未找到 Python，请先安装 Python 3.8+"
    exit 1
fi

# 确定Python命令
PYTHON="python3"
if ! command -v python3 &> /dev/null; then
    PYTHON="python"
fi

# 安装依赖
echo "[1/2] 检查依赖..."
$PYTHON -m pip install flask requests flask-cors -q

# 启动服务
echo "[2/2] 启动服务..."
echo ""

# 尝试打开浏览器
if command -v xdg-open &> /dev/null; then
    (sleep 2 && xdg-open http://localhost:5000) &
elif command -v open &> /dev/null; then
    (sleep 2 && open http://localhost:5000) &
fi

$PYTHON app.py

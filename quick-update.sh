#!/bin/bash

# 房产CRM系统快速更新脚本
# 在服务器上运行此脚本即可完成更新

echo "🚀 开始更新房产CRM系统..."
echo "================================"

# 进入项目目录
cd /var/www/realestate-crm || exit 1

# 拉取最新代码
echo ""
echo "📥 拉取最新代码..."
git pull origin main

# 构建前端
echo ""
echo "🔨 构建前端..."
cd frontend
npm run build

# 重启后端服务
echo ""
echo "🔄 重启后端服务..."
cd ../backend
pm2 restart realestate-backend

# 查看服务状态
echo ""
echo "📊 服务状态:"
pm2 status

echo ""
echo "================================"
echo "✅ 更新完成!"
echo ""
echo "访问地址: http://182.254.146.23"
echo "管理员账号: admin / admin123"
echo ""

#!/bin/bash

echo "🚀 开始部署房产CRM系统到腾讯云服务器..."
echo "================================================"

# 服务器信息
SERVER="root@182.254.146.23"
PROJECT_DIR="/var/www/realestate-crm"

echo ""
echo "📥 步骤1: 拉取最新代码..."
ssh $SERVER << 'ENDSSH'
cd /var/www/realestate-crm
echo "当前目录: $(pwd)"
echo "拉取最新代码..."
git pull origin main
echo "✓ 代码拉取完成"
ENDSSH

echo ""
echo "📦 步骤2: 安装后端依赖..."
ssh $SERVER << 'ENDSSH'
cd /var/www/realestate-crm/backend
echo "安装后端依赖..."
npm install
echo "✓ 后端依赖安装完成"
ENDSSH

echo ""
echo "📦 步骤3: 安装前端依赖..."
ssh $SERVER << 'ENDSSH'
cd /var/www/realestate-crm/frontend
echo "安装前端依赖..."
npm install
echo "✓ 前端依赖安装完成"
ENDSSH

echo ""
echo "🔨 步骤4: 构建前端..."
ssh $SERVER << 'ENDSSH'
cd /var/www/realestate-crm/frontend
echo "构建前端..."
npm run build
echo "✓ 前端构建完成"
ENDSSH

echo ""
echo "🔄 步骤5: 重启后端服务..."
ssh $SERVER << 'ENDSSH'
cd /var/www/realestate-crm/backend
echo "重启后端服务..."
pm2 restart realestate-backend || pm2 start server.js --name realestate-backend
echo "✓ 后端服务重启完成"
ENDSSH

echo ""
echo "📊 步骤6: 查看服务状态..."
ssh $SERVER << 'ENDSSH'
pm2 status
pm2 logs realestate-backend --lines 20
ENDSSH

echo ""
echo "================================================"
echo "✅ 部署完成！"
echo ""
echo "访问地址: http://182.254.146.23"
echo "管理员账号: admin / admin123"
echo ""

#!/bin/bash

echo "========================================="
echo "开始诊断和修复503错误"
echo "========================================="

cd /var/www/realestate-crm

echo ""
echo "1. 检查后端服务状态..."
pm2 status | grep realestate-backend

echo ""
echo "2. 检查api.js当前配置..."
grep "const BASE" frontend/src/api.js

echo ""
echo "3. 修复api.js配置..."
cd frontend/src
cp api.js api.js.backup
cat > api.js << 'APIEOF'
const BASE = process.env.REACT_APP_API_URL !== undefined ? process.env.REACT_APP_API_URL : '';

export function getToken() {
  return localStorage.getItem('crm_token');
}

export async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
    window.location.reload();
    return;
  }
  return res;
}
APIEOF

echo "api.js已修复"
grep "const BASE" api.js

echo ""
echo "4. 重新构建前端..."
cd /var/www/realestate-crm/frontend
npm run build

echo ""
echo "5. 检查构建结果..."
ls -lh build/

echo ""
echo "6. 检查Nginx配置..."
cat /etc/nginx/conf.d/realestate-crm.conf

echo ""
echo "7. 测试Nginx配置..."
nginx -t

echo ""
echo "8. 重载Nginx..."
systemctl reload nginx

echo ""
echo "9. 测试后端API..."
curl -s http://localhost:3001/api/stores | head -20

echo ""
echo "10. 测试Nginx代理..."
curl -s http://localhost:8082/api/stores | head -20

echo ""
echo "========================================="
echo "修复完成！请访问: http://182.254.146.23:8082"
echo "========================================="

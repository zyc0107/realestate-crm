# 🚀 腾讯云服务器部署指南

## 服务器信息
- **IP地址：** 182.254.146.23
- **用户名：** root
- **项目路径：** /var/www/realestate-crm

---

## 📋 部署步骤

### 方法一：使用SSH命令逐步部署（推荐）

#### 1. SSH登录到服务器
```bash
ssh root@182.254.146.23
```

#### 2. 进入项目目录
```bash
cd /var/www/realestate-crm
```

#### 3. 查看当前代码版本
```bash
git log --oneline -3
```

#### 4. 拉取最新代码
```bash
git pull origin main
```

如果提示有冲突或本地修改，先备份数据库，然后强制更新：
```bash
# 备份数据库
cp backend/crm.db backend/crm.db.backup

# 强制更新代码
git fetch origin
git reset --hard origin/main
```

#### 5. 安装后端依赖
```bash
cd backend
npm install
```

#### 6. 安装前端依赖
```bash
cd ../frontend
npm install
```

#### 7. 构建前端
```bash
npm run build
```

#### 8. 重启后端服务
```bash
cd ../backend
pm2 restart realestate-backend
```

如果提示找不到进程，则启动新进程：
```bash
pm2 start server.js --name realestate-backend
pm2 save
```

#### 9. 查看服务状态
```bash
pm2 status
pm2 logs realestate-backend --lines 50
```

#### 10. 测试访问
在浏览器中打开：http://182.254.146.23

---

### 方法二：一键部署脚本

如果你在本地Windows上，可以使用Git Bash执行：

```bash
cd /c/Users/张宇驰/Desktop/realestate-crm/realestate-crm
bash deploy.sh
```

---

## 🔍 常见问题排查

### 问题1：显示的是旧项目
**原因：** 服务器上的代码没有更新

**解决：**
```bash
ssh root@182.254.146.23
cd /var/www/realestate-crm
git pull origin main
pm2 restart realestate-backend
```

### 问题2：前端显示不正常
**原因：** 前端没有重新构建

**解决：**
```bash
ssh root@182.254.146.23
cd /var/www/realestate-crm/frontend
npm run build
```

### 问题3：后端API报错
**原因：** 后端依赖没有安装或服务没有重启

**解决：**
```bash
ssh root@182.254.146.23
cd /var/www/realestate-crm/backend
npm install
pm2 restart realestate-backend
pm2 logs realestate-backend
```

### 问题4：端口被占用
**查看端口占用：**
```bash
netstat -tlnp | grep 3001
```

**杀死占用进程：**
```bash
pm2 delete realestate-backend
pm2 start server.js --name realestate-backend
```

---

## 📊 验证部署成功

### 1. 检查后端服务
```bash
curl http://localhost:3001/api/auth/me
```
应该返回：`{"error":"请先登录"}`

### 2. 检查前端页面
在浏览器访问：http://182.254.146.23

应该看到登录页面

### 3. 测试登录
- 用户名：admin
- 密码：admin123

登录后应该看到仪表盘

---

## 🔐 Nginx配置（如果使用）

如果使用Nginx作为反向代理，配置文件通常在：
```bash
/etc/nginx/sites-available/realestate-crm
```

基本配置：
```nginx
server {
    listen 80;
    server_name 182.254.146.23;

    # 前端静态文件
    location / {
        root /var/www/realestate-crm/frontend/build;
        try_files $uri /index.html;
    }

    # 后端API代理
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

重启Nginx：
```bash
nginx -t
systemctl restart nginx
```

---

## 📝 部署检查清单

- [ ] SSH登录成功
- [ ] 进入项目目录
- [ ] 拉取最新代码
- [ ] 安装后端依赖
- [ ] 安装前端依赖
- [ ] 构建前端
- [ ] 重启后端服务
- [ ] 检查PM2状态
- [ ] 浏览器访问测试
- [ ] 管理员登录测试
- [ ] 功能测试

---

## 🆘 需要帮助？

如果遇到问题，请提供以下信息：
1. 执行的命令
2. 错误信息
3. PM2日志：`pm2 logs realestate-backend --lines 100`
4. 浏览器控制台错误信息

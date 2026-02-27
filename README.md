# 🏢 房产CRM - 房产中介管理系统

专为房产中介经纪人设计的全功能CRM系统，支持房源管理、客户跟进、AI智能回访分析和交易管理。

## ✨ 功能特色

- **🏠 房源管理** - 录入、搜索、筛选、管理房源状态
- **👥 客户管理** - 客户档案、等级分类、智能房源匹配
- **🤖 AI智能回访** - 粘贴聊天记录，自动分析意向、生成回访话术
- **💼 交易管理** - 全流程追踪（带看→签约→过户→完成）+ 佣金计算
- **📊 数据看板** - 业绩统计、图表分析、待回访提醒

## 🚀 本地启动

### 前置要求
- Node.js v18+
- npm

### 第一步：配置环境变量

```bash
cd backend
cp .env.example .env
```

编辑 `.env` 文件，填入你的 DeepSeek API Key：
```
DEEPSEEK_API_KEY=your_deepseek_api_key_here
PORT=3001
```

> 获取 API Key：https://platform.deepseek.com/

### 第二步：启动后端

```bash
cd backend
npm install
npm start
```

后端运行在 http://localhost:3001

### 第三步：启动前端（新开一个终端）

```bash
cd frontend
npm install
npm start
```

前端运行在 http://localhost:3000，会自动打开浏览器。

---

## 🌐 部署到 Vercel（让朋友在线使用）

### 方法一：通过 Vercel 网页部署（推荐）

1. 将项目代码推送到 GitHub
2. 访问 https://vercel.com，用 GitHub 登录
3. 点击 "New Project"，导入你的仓库
4. 在 "Environment Variables" 中添加：
   - `DEEPSEEK_API_KEY` = 你的DeepSeek API Key
5. 点击 "Deploy"
6. 部署完成后，Vercel 会给你一个 `.vercel.app` 的链接，分享给朋友即可！

### 方法二：命令行部署

```bash
npm install -g vercel
vercel login
vercel --prod
```

---

## 📁 项目结构

```
realestate-crm/
├── backend/
│   ├── server.js        # Express API 服务器
│   ├── database.js      # SQLite 数据库配置
│   ├── package.json
│   └── .env.example     # 环境变量模板
├── frontend/
│   ├── src/
│   │   ├── App.js       # 主应用 + 导航
│   │   ├── App.css      # 全局样式（深蓝主题）
│   │   └── pages/
│   │       ├── Dashboard.js    # 数据看板
│   │       ├── Properties.js   # 房源管理
│   │       ├── Customers.js    # 客户管理
│   │       ├── Transactions.js # 交易管理
│   │       └── AIFollowUp.js   # AI智能回访
│   └── package.json
└── vercel.json          # Vercel 部署配置
```

---

## 🤖 AI回访功能使用方法

1. 进入「AI智能回访」页面
2. （可选）选择关联的客户
3. 将与客户的微信/电话聊天记录粘贴到文本框
4. 点击「开始AI分析」
5. 系统自动分析并输出：
   - 客户意向程度（高/中/低）
   - 关注点和需求变化
   - 建议回访时间
   - 专业回访话术
6. 如果关联了客户，记录和提醒自动保存

---

## 💡 技术栈

| 层次 | 技术 |
|------|------|
| 前端 | React 18 + CSS Variables |
| 图表 | Recharts |
| 后端 | Node.js + Express |
| 数据库 | SQLite (sql.js) |
| AI | DeepSeek API |
| 部署 | Vercel |

---

## 📞 常见问题

**Q: AI分析提示API Key错误？**
A: 检查 `.env` 文件中的 `DEEPSEEK_API_KEY` 是否正确，或在系统设置页面中配置

**Q: 数据库在哪里？**
A: SQLite数据库文件 `crm.db` 在 `backend/` 目录下，本地数据不会丢失

**Q: 部署到Vercel后数据会保存吗？**
A: Vercel的无服务器函数不支持持久化SQLite，建议生产环境换用 PlanetScale 或 Railway + PostgreSQL

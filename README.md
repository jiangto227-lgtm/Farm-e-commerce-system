# 白马有机果蔬农场 - 完整电商平台

## 项目简介

White Horse Organic Farm (白马有机果蔬农场) 是一套完整的商业级有机果蔬电商运营平台，包含用户PC端商城、用户H5移动端、管理后台和后端API四大模块。

## 系统架构

```
White Horse Organic Farm E-Commerce Platform
|
|-- pc-web/          # 用户PC端商城 (2,370行)
|-- app-pro/         # 用户H5移动端/PWA (3,327行)
|-- admin-backend/   # 管理后台 (7,668行)
|-- backend/         # Node.js后端API (52个文件)
```

## 三端功能

### 1. PC端商城 (pc-web/)
- 品牌展示与产品浏览
- 三语言切换 (中文/英文/高棉语)
- 购物车与在线支付
- 用户中心与订单管理

### 2. H5移动端 (app-pro/)
- PWA离线缓存支持
- 13个完整功能页面
- 三语言国际化
- AI智能客服系统
- 骑手入驻与配送
- 扫码溯源与食谱推荐

### 3. 管理后台 (admin-backend/)
- 数据可视化仪表盘
- 订单/产品/用户管理
- 品控中心
- 客户关系管理
- 发票管理
- 采收计划
- API配置中心
- 柬埔寨骑手管理
- 手机H5自适应

### 4. 后端API (backend/)
- Node.js + Fastify框架
- 40+ RESTful API端点
- 三大支付网关集成 (ABA/Wing/ACLEDA)
- JWT认证 + RBAC权限
- 完整安全防护 (XSS/CSRF/限流/CSP)

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | HTML5, CSS3, JavaScript, Tailwind CSS, ECharts |
| 后端 | Node.js, Fastify, MongoDB |
| 支付 | ABA PayWay, Wing Money, ACLEDA PayGo |
| 部署 | Nginx, PM2 |
| 其他 | PWA, IndexedDB, Service Worker |

## 安全特性

- XSS输入消毒
- CSRF Token验证
- 请求限流 (5类限制)
- 数据加密 (XOR+Base64)
- API签名验证
- CSP安全策略头

## 部署

三端分别部署到服务器不同目录：
- PC端: `/var/www/pc/`
- 移动端: `/var/www/app/`
- 管理后台: `/var/www/admin/`

## 许可证

Copyright (c) 2026 White Horse Organic Farm. All rights reserved.

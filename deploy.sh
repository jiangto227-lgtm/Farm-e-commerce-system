#!/bin/bash
# ============================================
# 白马有机果蔬农场 - 自动化部署脚本
# 服务器: 35.240.237.86
# ============================================
set -e

echo "=========================================="
echo "  白马有机果蔬农场 - 自动部署脚本"
echo "=========================================="

# 1. 安装Nginx
echo "[1/6] 安装Nginx..."
apt-get update -qq
apt-get install -y -qq nginx git
systemctl enable nginx

# 2. 创建目录结构
echo "[2/6] 创建部署目录..."
mkdir -p /var/www/pc
mkdir -p /var/www/app
mkdir -p /var/www/admin
mkdir -p /var/www/backend

# 3. 克隆代码仓库
echo "[3/6] 从GitHub拉取最新代码..."
cd /var/www
rm -rf Farm-e-commerce-system
# 如果仓库是私有的，需要设置token（如果是公开的则不需要）
git clone https://github.com/jiangto227-lgtm/Farm-e-commerce-system.git 2>&1 || {
    echo "GitHub仓库访问失败，使用本地备份部署..."
    exit 1
}

# 4. 复制文件到对应目录
echo "[4/6] 部署三端文件..."
cp Farm-e-commerce-system/pc-web/index.html /var/www/pc/index.html
cp Farm-e-commerce-system/app-pro/index.html /var/www/app/index.html
cp Farm-e-commerce-system/admin-backend/index.html /var/www/admin/index.html
cp -r Farm-e-commerce-system/backend/* /var/www/backend/

echo "  PC端: $(wc -c < /var/www/pc/index.html) bytes"
echo "  H5移动端: $(wc -c < /var/www/app/index.html) bytes"
echo "  管理后台: $(wc -c < /var/www/admin/index.html) bytes"
echo "  后端: $(find /var/www/backend -type f | wc -l) files"

# 5. 配置Nginx
echo "[5/6] 配置Nginx..."
cat > /etc/nginx/sites-available/whitehorse << 'NGINXEOF'
# PC端商城
server {
    listen 80;
    server_name pc.whitehorse.local;
    root /var/www/pc;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}

# H5移动端
server {
    listen 80;
    server_name app.whitehorse.local;
    root /var/www/app;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}

# 管理后台
server {
    listen 80;
    server_name admin.whitehorse.local;
    root /var/www/admin;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}

# 默认站点 - 显示三端入口
server {
    listen 80 default_server;
    server_name _;
    
    location / {
        root /var/www/pc;
        try_files $uri $uri/ /index.html;
    }
    
    location /app {
        alias /var/www/app;
        try_files $uri $uri/ /app/index.html;
    }
    
    location /admin {
        alias /var/www/admin;
        try_files $uri $uri/ /admin/index.html;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/whitehorse /etc/nginx/sites-enabled/whitehorse
rm -f /etc/nginx/sites-enabled/default

nginx -t 2>&1 && systemctl restart nginx

# 6. 检查部署状态
echo "[6/6] 验证部署状态..."
echo ""
echo "=========================================="
echo "  部署完成!"
echo "=========================================="
echo ""
echo "三端访问地址:"
echo "  PC端商城:     http://35.240.237.86/"
echo "  H5移动端:     http://35.240.237.86/app/"
echo "  管理后台:     http://35.240.237.86/admin/"
echo ""
echo "文件状态:"
echo "  PC端:         $(test -f /var/www/pc/index.html && echo 'OK' || echo 'FAIL')"
echo "  H5移动端:     $(test -f /var/www/app/index.html && echo 'OK' || echo 'FAIL')"
echo "  管理后台:     $(test -f /var/www/admin/index.html && echo 'OK' || echo 'FAIL')"
echo "  Nginx:        $(systemctl is-active nginx 2>/dev/null || echo 'inactive')"
echo "=========================================="

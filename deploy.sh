#!/bin/bash
echo "=========================================="
echo "  白马有机果蔬农场 - 一键部署"
echo "=========================================="
apt-get update -qq && apt-get install -y -qq nginx git
echo "[1/4] Nginx+Git 安装完成"

mkdir -p /var/www/pc /var/www/app /var/www/admin
cd /var/www
git clone https://github.com/jiangto227-lgtm/Farm-e-commerce-system.git farm-src
echo "[2/4] 代码拉取完成"

cp farm-src/pc-web/index.html /var/www/pc/
cp farm-src/app-pro/index.html /var/www/app/
cp farm-src/admin-backend/index.html /var/www/admin/
echo "[3/4] 文件部署完成"

cat > /etc/nginx/sites-available/whitehorse << 'NGINXCF'
server{listen 80;root /var/www/pc;index index.html;location /{try_files $uri $uri/ /index.html;}}
server{listen 8080;root /var/www/app;index index.html;location /{try_files $uri $uri/ /index.html;}}
server{listen 9090;root /var/www/admin;index index.html;location /{try_files $uri $uri/ /index.html;}}
NGINXCF
ln -sf /etc/nginx/sites-available/whitehorse /etc/nginx/sites-enabled/whitehorse
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
echo "[4/4] Nginx配置完成"

echo ""
echo "=========================================="
echo "  部署成功!"
echo "=========================================="
echo "  PC端商城:     http://35.240.237.86:80"
echo "  H5移动端:     http://35.240.237.86:8080"
echo "  管理后台:     http://35.240.237.86:9090"
echo "=========================================="

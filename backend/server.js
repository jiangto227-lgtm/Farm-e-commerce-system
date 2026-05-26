/**
 * ==========================================
 * 白马有机果蔬农场 API 服务器入口
 * ==========================================
 * 基于 Fastify 框架构建的高性能 Node.js 后端服务
 * 
 * 主要功能：
 * - 加载环境变量配置
 * - 初始化 Fastify 实例（含插件注册）
 * - 连接 MongoDB 数据库
 * - 注册全局中间件（CORS、JWT、错误处理等）
 * - 挂载所有业务路由
 * - 启动 HTTP 服务器
 * 
 * 路由前缀说明：
 * - /api/auth      认证相关
 * - /api/products  产品相关
 * - /api/orders    订单相关
 * - /api/payments  支付相关
 * - /api/cart      购物车相关
 * - /api/users     用户相关
 * - /api/riders    骑手相关
 * - /api/disputes  争议相关
 * - /api/analytics 数据分析相关
 * - /api/admin     管理后台相关
 */

'use strict';

// 加载环境变量（必须在其他模块之前）
require('dotenv').config();

const path = require('path');
const Fastify = require('fastify');
const cors = require('@fastify/cors');
const multipart = require('@fastify/multipart');

// 数据库连接
const { connectDatabase } = require('./config/database');

// JWT 插件
const jwtPlugin = require('./plugins/jwt');

// 全局错误处理
const { setupErrorHandler } = require('./middleware/errorHandler');

// 工具模块
const { info, error: logError } = require('./utils/logger');

// ==========================================
// 创建 Fastify 实例
// ==========================================

const fastify = Fastify({
  logger: false,  // 使用自定义日志
  trustProxy: true,  // 信任代理（用于获取真实IP）
  // 请求超时配置
  connectionTimeout: 30000,
  keepAliveTimeout: 30000,
});

// ==========================================
// 注册全局插件
// ==========================================

/**
 * 注册 CORS 插件 - 允许跨域请求
 * 生产环境中应配置具体的允许来源
 */
async function registerCors() {
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN || '*',  // 生产环境应指定具体域名
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    credentials: true,
  });
  info('[插件] CORS 已注册');
}

/**
 * 注册文件上传插件 - 用于头像、凭证等上传
 */
async function registerMultipart() {
  await fastify.register(multipart, {
    limits: {
      fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024,  // 默认5MB
      files: 5,  // 最多同时上传5个文件
    },
  });
  info('[插件] Multipart 已注册');
}

/**
 * 注册 JWT 认证插件
 */
async function registerJwt() {
  await fastify.register(jwtPlugin);
  info('[插件] JWT 已注册');
}

// ==========================================
// 注册路由
// ==========================================

/**
 * 挂载所有业务路由模块
 * 每个路由模块通过 Fastify 的 register 方法挂载，自动添加前缀
 */
async function registerRoutes() {
  // 认证路由
  await fastify.register(require('./routes/auth'), { prefix: '/api/auth' });
  info('[路由] /api/auth 已挂载');

  // 产品路由
  await fastify.register(require('./routes/products'), { prefix: '/api/products' });
  info('[路由] /api/products 已挂载');

  // 订单路由
  await fastify.register(require('./routes/orders'), { prefix: '/api/orders' });
  info('[路由] /api/orders 已挂载');

  // 支付路由
  await fastify.register(require('./routes/payments'), { prefix: '/api/payments' });
  info('[路由] /api/payments 已挂载');

  // 购物车路由
  await fastify.register(require('./routes/cart'), { prefix: '/api/cart' });
  info('[路由] /api/cart 已挂载');

  // 用户路由
  await fastify.register(require('./routes/users'), { prefix: '/api/users' });
  info('[路由] /api/users 已挂载');

  // 骑手路由
  await fastify.register(require('./routes/riders'), { prefix: '/api/riders' });
  info('[路由] /api/riders 已挂载');

  // 争议路由
  await fastify.register(require('./routes/disputes'), { prefix: '/api/disputes' });
  info('[路由] /api/disputes 已挂载');

  // 数据分析路由
  await fastify.register(require('./routes/analytics'), { prefix: '/api/analytics' });
  info('[路由] /api/analytics 已挂载');

  // 管理员路由
  await fastify.register(require('./routes/admin'), { prefix: '/api/admin' });
  info('[路由] /api/admin 已挂载');

  // 健康检查路由（无需认证）
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      service: 'baima-farm-api',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });
  info('[路由] /health 已挂载');
}

// ==========================================
// 全局钩子
// ==========================================

/**
 * 注册请求日志钩子
 * 记录每个请求的 Method、URL、状态码和响应时间
 */
function registerHooks() {
  const { requestLog } = require('./utils/logger');

  // 请求开始时的日志
  fastify.addHook('onRequest', async (request, reply) => {
    request.startTime = Date.now();
  });

  // 响应完成时的日志
  fastify.addHook('onSend', async (request, reply, payload) => {
    const responseTime = Date.now() - request.startTime;
    requestLog(request, reply.statusCode, responseTime);
  });

  info('[钩子] 请求日志钩子已注册');
}

// ==========================================
// 初始化管理员账号
// ==========================================

/**
 * 如果数据库中不存在管理员，自动创建默认管理员账号
 * 仅在开发/测试环境使用，生产环境应删除此功能
 */
async function initAdminAccount() {
  try {
    const User = require('./models/User');
    const adminPhone = process.env.ADMIN_PHONE;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPhone || !adminPassword) {
      info('[初始化] 未配置管理员账号环境变量，跳过创建');
      return;
    }

    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      info('[初始化] 管理员账号已存在');
      return;
    }

    await User.create({
      phone: adminPhone,
      password: adminPassword,
      name: '系统管理员',
      role: 'admin',
      status: 'active',
    });

    info('[初始化] 默认管理员账号已创建:', adminPhone);
  } catch (err) {
    logError('[初始化] 创建管理员账号失败', err);
  }
}

// ==========================================
// 服务器启动
// ==========================================

/**
 * 主启动函数
 * 按顺序初始化所有组件并启动服务器
 */
async function start() {
  try {
    info('==========================================');
    info('  白马有机果蔬农场 API 服务启动中...');
    info('==========================================');

    // 1. 连接数据库
    const dbUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/baima_farm';
    await connectDatabase(dbUri);

    // 2. 注册全局插件
    await registerCors();
    await registerMultipart();
    await registerJwt();

    // 3. 设置全局错误处理
    setupErrorHandler(fastify);

    // 4. 注册请求钩子
    registerHooks();

    // 5. 注册所有路由
    await registerRoutes();

    // 6. 初始化管理员账号
    await initAdminAccount();

    // 7. 启动 HTTP 服务器
    const port = parseInt(process.env.PORT) || 3000;
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ port, host });

    info('==========================================');
    info(`  服务器已启动: http://${host}:${port}`);
    info(`  环境: ${process.env.NODE_ENV || 'development'}`);
    info('==========================================');

  } catch (err) {
    logError('服务器启动失败', err);
    process.exit(1);
  }
}

// 处理未捕获的异常，防止进程崩溃
process.on('uncaughtException', (err) => {
  logError('未捕获的异常', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logError('未处理的 Promise 拒绝', { reason, promise });
});

// 启动服务器
start();

// 导出 fastify 实例（便于测试）
module.exports = fastify;

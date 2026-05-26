/**
 * ==========================================
 * 认证路由模块 (Auth Routes)
 * ==========================================
 * 处理用户认证相关接口：
 * - POST /api/auth/register  用户注册
 * - POST /api/auth/login     用户登录
 * - POST /api/auth/refresh   刷新访问令牌
 * - GET  /api/auth/me        获取当前登录用户信息
 */

'use strict';

const User = require('../models/User');
const { verifyToken } = require('../middleware/auth');
const { validate, authSchemas } = require('../utils/validator');
const { success, error } = require('../utils/response');
const { BusinessError } = require('../middleware/errorHandler');

/**
 * 注册认证路由
 * @param {Object} fastify - Fastify 实例
 * @param {Object} options - 路由选项
 */
async function authRoutes(fastify, options) {

  /**
   * POST /api/auth/register
   * 用户注册 - 使用手机号、密码、昵称创建新账号
   */
  fastify.post('/register', {
    schema: {
      description: '用户注册',
      tags: ['认证'],
      body: {
        type: 'object',
        required: ['phone', 'password', 'name'],
        properties: {
          phone: { type: 'string', description: '手机号' },
          password: { type: 'string', description: '密码' },
          name: { type: 'string', description: '昵称' },
        },
      },
    },
  }, async (request, reply) => {
    // 1. 校验输入
    const data = validate(authSchemas.register, request.body);

    // 2. 检查手机号是否已注册
    const existingUser = await User.findOne({ phone: data.phone });
    if (existingUser) {
      throw new BusinessError(409002, '该手机号已被注册', 409);
    }

    // 3. 创建用户
    const user = await User.create({
      phone: data.phone,
      password: data.password,
      name: data.name,
      role: 'customer',
      status: 'active',
    });

    // 4. 生成 Token
    const payload = { userId: user._id, phone: user.phone, role: user.role };
    const accessToken = fastify.generateToken(payload);
    const refreshToken = fastify.generateRefreshToken(payload);

    // 5. 返回用户信息和 Token
    return success({
      data: {
        user: user.toSafeObject(),
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: 3600, // 1小时（秒）
        },
      },
      message: '注册成功',
    });
  });

  /**
   * POST /api/auth/login
   * 用户登录 - 使用手机号和密码获取访问令牌
   */
  fastify.post('/login', {
    schema: {
      description: '用户登录',
      tags: ['认证'],
      body: {
        type: 'object',
        required: ['phone', 'password'],
        properties: {
          phone: { type: 'string', description: '手机号' },
          password: { type: 'string', description: '密码' },
        },
      },
    },
  }, async (request, reply) => {
    // 1. 校验输入
    const data = validate(authSchemas.login, request.body);

    // 2. 查找用户（需要返回密码字段）
    const user = await User.findOne({ phone: data.phone }).select('+password');
    if (!user) {
      throw new BusinessError(401003, '手机号或密码错误', 401);
    }

    // 3. 校验密码
    const isMatch = await user.comparePassword(data.password);
    if (!isMatch) {
      throw new BusinessError(401003, '手机号或密码错误', 401);
    }

    // 4. 检查账号状态
    if (user.status === 'banned') {
      throw new BusinessError(403002, '账号已被禁用，请联系客服', 403);
    }

    // 5. 生成 Token
    const payload = { userId: user._id, phone: user.phone, role: user.role };
    const accessToken = fastify.generateToken(payload);
    const refreshToken = fastify.generateRefreshToken(payload);

    // 6. 返回用户信息和 Token
    return success({
      data: {
        user: user.toSafeObject(),
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: 3600,
        },
      },
      message: '登录成功',
    });
  });

  /**
   * POST /api/auth/refresh
   * 刷新访问令牌 - 使用刷新令牌获取新的访问令牌
   */
  fastify.post('/refresh', {
    schema: {
      description: '刷新访问令牌',
      tags: ['认证'],
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string', description: '刷新令牌' },
        },
      },
    },
  }, async (request, reply) => {
    const data = validate(authSchemas.refresh, request.body);

    // 验证刷新令牌
    let decoded;
    try {
      decoded = fastify.verifyRefreshToken(data.refreshToken);
    } catch (err) {
      throw new BusinessError(401004, '刷新令牌无效或已过期', 401);
    }

    // 检查用户是否仍然存在且有效
    const user = await User.findById(decoded.userId);
    if (!user || user.status !== 'active') {
      throw new BusinessError(401005, '用户不存在或已被禁用', 401);
    }

    // 生成新的访问令牌
    const payload = { userId: user._id, phone: user.phone, role: user.role };
    const accessToken = fastify.generateToken(payload);

    return success({
      data: {
        accessToken,
        expiresIn: 3600,
      },
      message: '令牌刷新成功',
    });
  });

  /**
   * GET /api/auth/me
   * 获取当前登录用户信息
   */
  fastify.get('/me', {
    onRequest: [verifyToken],
    schema: {
      description: '获取当前用户信息',
      tags: ['认证'],
    },
  }, async (request, reply) => {
    const userId = request.user.userId;
    const user = await User.findById(userId);

    if (!user) {
      throw new BusinessError(404005, '用户不存在', 404);
    }

    return success({
      data: user.toSafeObject(),
      message: '获取用户信息成功',
    });
  });
}

module.exports = authRoutes;

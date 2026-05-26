/**
 * ==========================================
 * JWT 插件配置模块
 * ==========================================
 * 注册 Fastify JWT 插件，配置认证与刷新 Token 的生成验证逻辑
 */

'use strict';

const fp = require('fastify-plugin');

async function jwtPlugin(fastify, options) {
  // 注册 @fastify/jwt 插件
  await fastify.register(require('@fastify/jwt'), {
    secret: process.env.JWT_SECRET,
    cookie: {
      cookieName: 'token',
      signed: false,
    },
    sign: {
      expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    },
  });

  /**
   * 生成访问令牌 (Access Token)
   * @param {Object} payload - 要编码到 Token 中的数据
   * @returns {string} JWT 访问令牌
   */
  fastify.decorate('generateToken', function (payload) {
    return this.jwt.sign(payload);
  });

  /**
   * 生成刷新令牌 (Refresh Token)
   * @param {Object} payload - 要编码到 Token 中的数据
   * @returns {string} JWT 刷新令牌
   */
  fastify.decorate('generateRefreshToken', function (payload) {
    const jwt = require('jsonwebtoken');
    return jwt.sign(
      payload,
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    );
  });

  /**
   * 验证刷新令牌
   * @param {string} token - 刷新令牌字符串
   * @returns {Object} 解码后的 Token 数据
   */
  fastify.decorate('verifyRefreshToken', function (token) {
    const jwt = require('jsonwebtoken');
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  });

  /**
   * 验证请求中的 JWT Token（用于受保护路由）
   * 优先从 Authorization 头部获取，其次从 Cookie 获取
   */
  fastify.decorate('authenticate', async function (request, reply) {
    try {
      // 从请求头或 Cookie 中验证 Token
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({
        code: 401,
        message: '认证失败，请重新登录',
        data: null,
        timestamp: new Date().toISOString(),
      });
    }
  });
}

module.exports = fp(jwtPlugin, { name: 'jwt-plugin' });

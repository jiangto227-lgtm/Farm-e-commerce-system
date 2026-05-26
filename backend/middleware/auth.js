/**
 * ==========================================
 * JWT 认证中间件 (Authentication Middleware)
 * ==========================================
 * 提供用户认证相关的中间件函数，包括 JWT 验证、可选认证等
 * 所有需要登录才能访问的接口都应使用这些中间件
 */

'use strict';

/**
 * 验证 JWT Token 的中间件
 * 从请求头 Authorization: Bearer <token> 中提取并验证 Token
 * 验证成功后将用户信息挂载到 request.user 上
 * @param {Object} request - Fastify 请求对象
 * @param {Object} reply - Fastify 响应对象
 */
async function verifyToken(request, reply) {
  try {
    // 检查 Authorization 请求头
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return reply.code(401).send({
        code: 401,
        message: '缺少认证信息，请先登录',
        data: null,
        timestamp: new Date().toISOString(),
      });
    }

    // 验证 Token 格式
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return reply.code(401).send({
        code: 401,
        message: '认证格式错误，请使用 Bearer Token',
        data: null,
        timestamp: new Date().toISOString(),
      });
    }

    // 使用 Fastify JWT 插件验证 Token
    await request.jwtVerify();

    // 检查用户状态（可选，视业务需求）
    if (request.user && request.user.status === 'banned') {
      return reply.code(403).send({
        code: 403,
        message: '账号已被禁用，请联系客服',
        data: null,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (err) {
    // 区分不同的 Token 错误类型
    if (err.code === 'FST_JWT_NO_AUTHORIZATION_IN_COOKIE' || 
        err.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
      return reply.code(401).send({
        code: 401,
        message: '登录已过期，请重新登录',
        data: null,
        timestamp: new Date().toISOString(),
      });
    }
    if (err.code === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID') {
      return reply.code(401).send({
        code: 401,
        message: '无效的认证信息',
        data: null,
        timestamp: new Date().toISOString(),
      });
    }
    return reply.code(401).send({
      code: 401,
      message: '认证失败：' + (err.message || '未知错误'),
      data: null,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * 可选认证中间件
 * 有 Token 则解析用户信息，没有也不阻止访问
 * 适用于部分公开、登录后可查看更多内容的接口
 * @param {Object} request - Fastify 请求对象
 */
async function optionalAuth(request, reply) {
  try {
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      await request.jwtVerify();
    }
  } catch (err) {
    // 可选认证失败不阻止请求，仅不设置用户信息
    request.user = null;
  }
}

module.exports = {
  verifyToken,
  optionalAuth,
};

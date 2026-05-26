/**
 * ==========================================
 * 全局错误处理中间件 (Error Handler)
 * ==========================================
 * 统一处理应用中的各种错误，包括：
 * - 业务逻辑错误（自定义错误码和消息）
 * - Mongoose 验证错误
 * - MongoDB 重复键错误
 * - JWT 认证错误
 * - 其他未预期错误
 * 所有错误最终都会以统一的响应格式返回给客户端
 */

'use strict';

/**
 * 自定义业务错误类
 * 用于区分业务逻辑错误和系统错误
 */
class BusinessError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = 'BusinessError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Fastify 全局错误处理钩子
 * @param {Error} error - 错误对象
 * @param {Object} request - Fastify 请求对象
 * @param {Object} reply - Fastify 响应对象
 */
async function globalErrorHandler(error, request, reply) {
  // 获取请求ID用于日志追踪
  const requestId = request.id || 'unknown';

  // 默认错误响应
  let statusCode = 500;
  let errorCode = 500;
  let message = '服务器内部错误';
  let data = null;

  // 1. 业务逻辑错误
  if (error instanceof BusinessError) {
    statusCode = error.statusCode;
    errorCode = error.code;
    message = error.message;
  }
  // 2. Fastify 验证错误 (请求参数不符合 schema)
  else if (error.validation) {
    statusCode = 400;
    errorCode = 400001;
    message = `请求参数错误: ${error.message}`;
    data = error.validation;
  }
  // 3. Mongoose 验证错误
  else if (error.name === 'ValidationError') {
    statusCode = 400;
    errorCode = 400002;
    const messages = Object.values(error.errors).map(e => e.message);
    message = `数据验证失败: ${messages.join('; ')}`;
    data = messages;
  }
  // 4. Mongoose CastError (类型转换错误，如无效的 ObjectId)
  else if (error.name === 'CastError') {
    statusCode = 400;
    errorCode = 400003;
    message = `参数类型错误: ${error.path} 的值 "${error.value}" 无效`;
  }
  // 5. MongoDB 重复键错误
  else if (error.code === 11000) {
    statusCode = 409;
    errorCode = 409001;
    const field = Object.keys(error.keyValue || {})[0];
    message = `数据重复: ${field || '字段'} 已被使用`;
    data = error.keyValue;
  }
  // 6. JWT 相关错误
  else if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorCode = 401001;
    message = '无效的认证令牌';
  }
  else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    errorCode = 401002;
    message = '认证令牌已过期，请重新登录';
  }
  // 7. Fastify JWT 插件错误
  else if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
    statusCode = 401;
    errorCode = 401002;
    message = '登录已过期，请重新登录';
  }
  else if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID') {
    statusCode = 401;
    errorCode = 401001;
    message = '无效的认证信息';
  }
  // 8. 请求体过大
  else if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
    statusCode = 413;
    errorCode = 413001;
    message = '请求体过大，请减小数据量';
  }
  // 9. 其他未预期错误（记录日志但不暴露详细信息）
  else {
    console.error(`[错误处理][${requestId}] 未预期错误:`, error);
    statusCode = error.statusCode || 500;
    errorCode = 500001;
    message = process.env.NODE_ENV === 'development' 
      ? error.message || '服务器内部错误'
      : '服务器内部错误，请稍后重试';
  }

  // 非500错误记录警告日志
  if (statusCode < 500) {
    console.warn(`[错误处理][${requestId}] ${request.method} ${request.url} => ${statusCode}: ${message}`);
  }

  // 发送统一格式的错误响应
  reply.code(statusCode).send({
    code: errorCode,
    message: message,
    data: data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * 设置 Fastify 全局错误处理
 * @param {Object} fastify - Fastify 实例
 */
function setupErrorHandler(fastify) {
  fastify.setErrorHandler(globalErrorHandler);

  // 设置未匹配到路由的 404 处理
  fastify.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      code: 404,
      message: `未找到接口: ${request.method} ${request.url}`,
      data: null,
      timestamp: new Date().toISOString(),
    });
  });
}

module.exports = {
  BusinessError,
  globalErrorHandler,
  setupErrorHandler,
};

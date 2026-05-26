/**
 * ==========================================
 * 统一响应格式工具 (Response Utilities)
 * ==========================================
 * 提供标准化的 API 响应格式，确保所有接口返回一致的数据结构：
 * { code: 状态码, message: 消息, data: 数据, timestamp: 时间戳 }
 */

'use strict';

/**
 * 生成成功响应
 * @param {Object} options - 配置项
 * @param {*} options.data - 响应数据（默认 null）
 * @param {string} options.message - 成功消息（默认 '操作成功'）
 * @param {number} options.code - 状态码（默认 200）
 * @returns {Object} 统一格式的成功响应对象
 */
function success({ data = null, message = '操作成功', code = 200 } = {}) {
  return {
    code,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * 生成分页响应（在成功响应基础上包含分页信息）
 * @param {Object} options - 配置项
 * @param {Array} options.list - 数据列表
 * @param {number} options.total - 总记录数
 * @param {number} options.page - 当前页码
 * @param {number} options.limit - 每页数量
 * @param {string} options.message - 成功消息
 * @returns {Object} 包含分页信息的响应对象
 */
function paginated({ list = [], total = 0, page = 1, limit = 10, message = '查询成功' } = {}) {
  const totalPages = Math.ceil(total / limit) || 0;
  return {
    code: 200,
    message,
    data: {
      list,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: Number(total),
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * 生成错误响应
 * @param {Object} options - 配置项
 * @param {string} options.message - 错误消息（默认 '操作失败'）
 * @param {number} options.code - 错误码（默认 500）
 * @param {*} options.data - 错误相关数据（默认 null）
 * @returns {Object} 统一格式的错误响应对象
 */
function error({ message = '操作失败', code = 500, data = null } = {}) {
  return {
    code,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * 发送响应的快捷方法（绑定到 Fastify reply）
 * @param {Object} reply - Fastify reply 对象
 * @param {Object} options - 响应配置
 */
function sendReply(reply, { data = null, message = '操作成功', code = 200 } = {}) {
  return reply.code(code).send(success({ data, message, code }));
}

module.exports = {
  success,
  paginated,
  error,
  sendReply,
};

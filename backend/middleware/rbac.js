/**
 * ==========================================
 * 角色权限控制中间件 (RBAC Middleware)
 * ==========================================
 * 基于角色的访问控制，限制特定角色才能访问某些接口
 * 支持三种角色：customer(顾客)、rider(骑手)、admin(管理员)
 * 必须先通过认证中间件后才能使用 RBAC 中间件
 */

'use strict';

/**
 * 创建角色校验中间件
 * 只允许指定角色的用户访问
 * @param {string[]} allowedRoles - 允许访问的角色列表，如 ['admin'] 或 ['admin', 'rider']
 * @returns {Function} Fastify 前置钩子函数
 */
function requireRole(allowedRoles) {
  return async function (request, reply) {
    // 确保用户已认证
    if (!request.user) {
      return reply.code(401).send({
        code: 401,
        message: '未登录，无法访问该资源',
        data: null,
        timestamp: new Date().toISOString(),
      });
    }

    const userRole = request.user.role;

    // 检查用户角色是否在允许列表中
    if (!allowedRoles.includes(userRole)) {
      return reply.code(403).send({
        code: 403,
        message: '权限不足，无权访问该资源',
        data: null,
        timestamp: new Date().toISOString(),
      });
    }
  };
}

/**
 * 快捷导出：仅管理员可访问
 */
const requireAdmin = requireRole(['admin']);

/**
 * 快捷导出：仅骑手可访问
 */
const requireRider = requireRole(['rider']);

/**
 * 快捷导出：管理员或骑手可访问
 */
const requireAdminOrRider = requireRole(['admin', 'rider']);

/**
 * 资源所有者或管理员校验
 * 允许用户访问自己的资源，管理员可以访问所有资源
 * @param {Function} getOwnerId - 获取资源所有者ID的函数
 */
function requireOwnerOrAdmin(getOwnerId) {
  return async function (request, reply) {
    if (!request.user) {
      return reply.code(401).send({
        code: 401,
        message: '未登录',
        data: null,
        timestamp: new Date().toISOString(),
      });
    }

    const userRole = request.user.role;
    const userId = request.user.userId || request.user._id;

    // 管理员直接放行
    if (userRole === 'admin') {
      return;
    }

    // 非管理员需要校验资源所有权
    const ownerId = await getOwnerId(request);
    if (ownerId && ownerId.toString() !== userId.toString()) {
      return reply.code(403).send({
        code: 403,
        message: '无权访问他人的资源',
        data: null,
        timestamp: new Date().toISOString(),
      });
    }
  };
}

module.exports = {
  requireRole,
  requireAdmin,
  requireRider,
  requireAdminOrRider,
  requireOwnerOrAdmin,
};

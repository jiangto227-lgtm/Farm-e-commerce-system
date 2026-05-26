/**
 * ==========================================
 * 订单路由模块 (Order Routes)
 * ==========================================
 * 处理订单相关的接口：
 * - GET  /api/orders              订单列表（用户看自己/管理员看全部）
 * - GET  /api/orders/:id          订单详情
 * - POST /api/orders              创建订单
 * - PUT  /api/orders/:id/status   更新订单状态
 */

'use strict';

const orderService = require('../services/orderService');
const notificationService = require('../services/notificationService');
const { verifyToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/rbac');
const { validate, orderSchemas } = require('../utils/validator');
const { success, paginated } = require('../utils/response');

/**
 * 注册订单路由
 * @param {Object} fastify - Fastify 实例
 * @param {Object} options - 路由选项
 */
async function orderRoutes(fastify, options) {

  /**
   * GET /api/orders
   * 订单列表 - 顾客看自己的，管理员看全部
   * Query: page, limit, status(状态筛选)
   */
  fastify.get('/', {
    onRequest: [verifyToken],
    schema: {
      description: '获取订单列表',
      tags: ['订单'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', default: 1 },
          limit: { type: 'integer', default: 10 },
          status: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.userId;
    const role = request.user.role;
    const { page, limit, status } = request.query;

    const result = await orderService.getOrderList({
      userId,
      role,
      status,
      page: Number(page) || 1,
      limit: Number(limit) || 10,
    });
    return paginated(result);
  });

  /**
   * POST /api/orders
   * 创建订单 - 需要登录
   * Body: { addressId, items: [{productId, quantity}], remark, paymentMethod }
   */
  fastify.post('/', {
    onRequest: [verifyToken],
    schema: {
      description: '创建订单',
      tags: ['订单'],
      body: {
        type: 'object',
        required: ['addressId', 'items'],
        properties: {
          addressId: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['productId', 'quantity'],
              properties: {
                productId: { type: 'string' },
                quantity: { type: 'integer' },
              },
            },
          },
          remark: { type: 'string' },
          paymentMethod: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.userId;
    const data = validate(orderSchemas.create, request.body);

    const order = await orderService.createOrder(userId, data);

    // 发送订单创建通知
    await notificationService.sendOrderStatusNotification(
      userId,
      order.orderNo,
      order.status
    );

    return success({ data: order, message: '订单创建成功' });
  });

  /**
   * GET /api/orders/:id
   * 订单详情 - 用户只能看自己的，管理员可以看全部
   */
  fastify.get('/:id', {
    onRequest: [verifyToken],
    schema: {
      description: '获取订单详情',
      tags: ['订单'],
    },
  }, async (request, reply) => {
    const userId = request.user.userId;
    const role = request.user.role;

    const order = await orderService.getOrderDetail(request.params.id, userId, role);
    return success({ data: order, message: '获取订单详情成功' });
  });

  /**
   * PUT /api/orders/:id/status
   * 更新订单状态 - 管理员可以更新任意状态，用户只能取消自己的待处理订单
   */
  fastify.put('/:id/status', {
    onRequest: [verifyToken],
    schema: {
      description: '更新订单状态',
      tags: ['订单'],
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', description: '新状态' },
          remark: { type: 'string', description: '备注' },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.userId;
    const role = request.user.role;

    const data = validate(orderSchemas.updateStatus, request.body);

    // 非管理员只能取消自己的pending订单
    if (role !== 'admin') {
      if (data.status !== 'cancelled') {
        return reply.code(403).send({
          code: 403,
          message: '无权进行此操作，只有管理员可以更新订单状态',
          data: null,
          timestamp: new Date().toISOString(),
        });
      }

      // 校验订单归属
      const order = await orderService.getOrderDetail(request.params.id, userId, role);
      if (order.status !== 'pending') {
        return reply.code(400).send({
          code: 400,
          message: '只能取消待处理状态的订单',
          data: null,
          timestamp: new Date().toISOString(),
        });
      }
    }

    const operator = role === 'admin' ? 'admin' : 'customer';
    const updatedOrder = await orderService.updateOrderStatus(
      request.params.id,
      data.status,
      operator,
      data.remark
    );

    // 发送状态变更通知
    await notificationService.sendOrderStatusNotification(
      updatedOrder.user._id || updatedOrder.user,
      updatedOrder.orderNo,
      data.status,
      data.remark
    );

    return success({ data: updatedOrder, message: '订单状态更新成功' });
  });
}

module.exports = orderRoutes;

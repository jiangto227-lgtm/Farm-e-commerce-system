/**
 * ==========================================
 * 支付路由模块 (Payment Routes)
 * ==========================================
 * 处理支付相关的接口：
 * - POST /api/payments           创建支付记录
 * - GET  /api/payments           支付记录列表
 * - GET  /api/payments/:id       支付详情
 * - POST /api/payments/callback  支付回调（第三方支付网关调用）
 * - POST /api/payments/refund    退款申请
 */

'use strict';

const paymentService = require('../services/paymentService');
const notificationService = require('../services/notificationService');
const { verifyToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/rbac');
const { validate, paymentSchemas } = require('../utils/validator');
const { success, paginated } = require('../utils/response');

/**
 * 注册支付路由
 * @param {Object} fastify - Fastify 实例
 * @param {Object} options - 路由选项
 */
async function paymentRoutes(fastify, options) {

  /**
   * POST /api/payments
   * 创建支付记录 - 需要登录
   */
  fastify.post('/', {
    onRequest: [verifyToken],
    schema: {
      description: '创建支付',
      tags: ['支付'],
      body: {
        type: 'object',
        required: ['orderId', 'method', 'amount'],
        properties: {
          orderId: { type: 'string', description: '订单ID' },
          method: { type: 'string', description: '支付方式' },
          amount: { type: 'number', description: '支付金额' },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.userId;
    const data = validate(paymentSchemas.create, request.body);

    const payment = await paymentService.createPayment(userId, data);

    // 发送支付成功通知（现金支付直接成功）
    if (payment.method === 'cash') {
      await notificationService.sendPaymentNotification(
        userId,
        payment.orderNo,
        payment.amount
      );
    }

    return success({ data: payment, message: '支付记录创建成功' });
  });

  /**
   * GET /api/payments
   * 支付记录列表 - 用户看自己的，管理员看全部
   */
  fastify.get('/', {
    onRequest: [verifyToken],
    schema: {
      description: '获取支付记录列表',
      tags: ['支付'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', default: 1 },
          limit: { type: 'integer', default: 10 },
          method: { type: 'string' },
          status: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.userId;
    const role = request.user.role;
    const { page, limit, method, status } = request.query;

    const result = await paymentService.getPaymentList({
      userId,
      role,
      method,
      status,
      page: Number(page) || 1,
      limit: Number(limit) || 10,
    });

    return paginated(result);
  });

  /**
   * GET /api/payments/:id
   * 支付详情
   */
  fastify.get('/:id', {
    onRequest: [verifyToken],
    schema: {
      description: '获取支付详情',
      tags: ['支付'],
    },
  }, async (request, reply) => {
    const Payment = require('../models/Payment');
    const payment = await Payment.findById(request.params.id)
      .populate('order', 'orderNo status totalAmount')
      .populate('user', 'name phone')
      .lean();

    if (!payment) {
      return reply.code(404).send({
        code: 404,
        message: '支付记录不存在',
        data: null,
        timestamp: new Date().toISOString(),
      });
    }

    // 非管理员只能看自己的
    if (request.user.role !== 'admin' && payment.user._id.toString() !== request.user.userId) {
      return reply.code(403).send({
        code: 403,
        message: '无权查看该支付记录',
        data: null,
        timestamp: new Date().toISOString(),
      });
    }

    return success({ data: payment, message: '获取支付详情成功' });
  });

  /**
   * POST /api/payments/callback
   * 支付回调 - 由第三方支付网关调用，无需认证
   * Body: 网关返回的回调数据
   */
  fastify.post('/callback', {
    schema: {
      description: '支付网关回调',
      tags: ['支付'],
    },
  }, async (request, reply) => {
    const callbackData = request.body;
    console.log('[支付回调] 收到回调数据:', JSON.stringify(callbackData));

    const result = await paymentService.handlePaymentCallback(callbackData);

    // 如果支付成功，发送通知
    if (result.success) {
      const Payment = require('../models/Payment');
      const payment = await Payment.findOne({ paymentNo: callbackData.paymentNo });
      if (payment) {
        await notificationService.sendPaymentNotification(
          payment.user,
          payment.orderNo,
          payment.amount
        );
      }
    }

    return success({ data: result, message: result.message });
  });

  /**
   * POST /api/payments/refund
   * 退款申请 - 管理员可操作
   */
  fastify.post('/refund', {
    onRequest: [verifyToken],
    schema: {
      description: '申请退款',
      tags: ['支付'],
      body: {
        type: 'object',
        required: ['paymentId', 'amount'],
        properties: {
          paymentId: { type: 'string', description: '支付记录ID' },
          amount: { type: 'number', description: '退款金额' },
          reason: { type: 'string', description: '退款原因' },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.userId;
    const role = request.user.role;
    const data = validate(paymentSchemas.refund, request.body);

    const result = await paymentService.processRefund(userId, userId, role, {
      amount: data.amount,
      reason: data.reason,
    });

    // 发送退款通知
    const Payment = require('../models/Payment');
    const payment = await Payment.findById(data.paymentId);
    if (payment) {
      await notificationService.sendRefundNotification(
        payment.user,
        payment.orderNo,
        data.amount,
        data.reason
      );
    }

    return success({ data: result, message: '退款处理成功' });
  });
}

module.exports = paymentRoutes;

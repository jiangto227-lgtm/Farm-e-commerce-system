/**
 * ==========================================
 * 争议路由模块 (Dispute Routes)
 * ==========================================
 * 处理订单争议相关的接口：
 * - POST /api/disputes              提交争议
 * - GET  /api/disputes              争议列表（用户看自己/管理员看全部）
 * - PUT  /api/disputes/:id/handle   处理争议（管理员）
 */

'use strict';

const Dispute = require('../models/Dispute');
const Order = require('../models/Order');
const { verifyToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/rbac');
const { validate, disputeSchemas } = require('../utils/validator');
const { success, paginated } = require('../utils/response');
const { BusinessError } = require('../middleware/errorHandler');
const notificationService = require('../services/notificationService');
const paymentService = require('../services/paymentService');

/**
 * 注册争议路由
 * @param {Object} fastify - Fastify 实例
 * @param {Object} options - 路由选项
 */
async function disputeRoutes(fastify, options) {

  /**
   * POST /api/disputes
   * 提交争议 - 需要登录，只能提交自己的订单争议
   */
  fastify.post('/', {
    onRequest: [verifyToken],
    schema: {
      description: '提交争议',
      tags: ['争议'],
      body: {
        type: 'object',
        required: ['orderId', 'type', 'reason'],
        properties: {
          orderId: { type: 'string', description: '订单ID' },
          type: { type: 'string', description: '争议类型: refund/return/quality/missing/other' },
          reason: { type: 'string', description: '争议原因' },
          evidence: { type: 'array', items: { type: 'string' }, description: '凭证图片URL列表' },
          refundAmount: { type: 'number', description: '期望退款金额' },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.userId;
    const data = validate(disputeSchemas.create, request.body);

    // 1. 校验订单是否存在且属于当前用户
    const order = await Order.findById(data.orderId);
    if (!order) {
      throw new BusinessError(404003, '订单不存在', 404);
    }
    if (order.user.toString() !== userId) {
      throw new BusinessError(403001, '只能为自己的订单提交争议', 403);
    }

    // 2. 校验订单是否已完成（已完成才能发起争议）
    const allowedStatuses = ['delivered', 'completed', 'refunded'];
    if (!allowedStatuses.includes(order.status)) {
      throw new BusinessError(
        400016,
        `当前订单状态为「${order.status}」，无法提交争议`,
        400
      );
    }

    // 3. 检查是否已存在该订单的争议
    const existingDispute = await Dispute.findOne({
      order: data.orderId,
      status: { $in: ['pending', 'processing'] },
    });
    if (existingDispute) {
      throw new BusinessError(400017, '该订单已有进行中的争议，请勿重复提交', 400);
    }

    // 4. 生成争议编号并创建记录
    const disputeNo = Dispute.generateDisputeNo();
    const dispute = await Dispute.create({
      disputeNo,
      order: data.orderId,
      orderNo: order.orderNo,
      user: userId,
      type: data.type,
      reason: data.reason,
      evidence: data.evidence || [],
      refundAmount: data.refundAmount || 0,
      status: 'pending',
    });

    return success({ data: dispute, message: '争议提交成功，我们会尽快处理' });
  });

  /**
   * GET /api/disputes
   * 争议列表 - 用户看自己的，管理员看全部
   */
  fastify.get('/', {
    onRequest: [verifyToken],
    schema: {
      description: '获取争议列表',
      tags: ['争议'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', default: 1 },
          limit: { type: 'integer', default: 10 },
          status: { type: 'string', description: '状态筛选' },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.userId;
    const role = request.user.role;
    const { page = 1, limit = 10, status } = request.query;

    const query = {};
    if (role !== 'admin') {
      query.user = userId;
    }
    if (status) {
      query.status = status;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [disputes, total] = await Promise.all([
      Dispute.find(query)
        .populate('user', 'name phone')
        .populate('order', 'orderNo totalAmount status')
        .populate('handledBy', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Dispute.countDocuments(query),
    ]);

    return paginated({ list: disputes, total, page: Number(page), limit: Number(limit) });
  });

  /**
   * PUT /api/disputes/:id/handle
   * 处理争议 - 仅管理员可访问
   * Body: { result: 'refunded'|'rejected'|'negotiated', remark }
   */
  fastify.put('/:id/handle', {
    onRequest: [verifyToken, requireAdmin],
    schema: {
      description: '处理争议（管理员）',
      tags: ['争议'],
      body: {
        type: 'object',
        required: ['result'],
        properties: {
          result: { type: 'string', description: '处理结果: refunded/rejected/negotiated' },
          remark: { type: 'string', description: '处理说明' },
        },
      },
    },
  }, async (request, reply) => {
    const adminId = request.user.userId;
    const disputeId = request.params.id;
    const data = validate(disputeSchemas.handle, request.body);

    // 1. 查找争议
    const dispute = await Dispute.findById(disputeId);
    if (!dispute) {
      throw new BusinessError(404010, '争议不存在', 404);
    }
    if (dispute.status !== 'pending' && dispute.status !== 'processing') {
      throw new BusinessError(400018, '该争议已被处理，无法重复操作', 400);
    }

    // 2. 更新争议状态
    dispute.status = 'resolved';
    dispute.result = data.result;
    dispute.handleRemark = data.remark || '';
    dispute.handledBy = adminId;
    dispute.handledAt = new Date();
    await dispute.save();

    // 3. 根据处理结果执行相应操作
    if (data.result === 'refunded') {
      // 同意退款 - 查找对应支付记录并退款
      const Payment = require('../models/Payment');
      const payment = await Payment.findOne({
        order: dispute.order,
        status: 'success',
      });

      if (payment) {
        // 执行退款
        await paymentService.processRefund(
          payment._id,
          adminId,
          'admin',
          {
            amount: dispute.refundAmount || payment.amount,
            reason: `争议退款: ${dispute.reason}`,
          }
        );
      }

      // 更新订单状态
      await Order.findByIdAndUpdate(dispute.order, {
        status: 'refunded',
        paymentStatus: 'refunded',
      });
    } else if (data.result === 'rejected') {
      // 拒绝退款 - 无需额外操作
    } else if (data.result === 'negotiated') {
      // 协商解决 - 可扩展为部分退款等
    }

    // 4. 发送争议处理结果通知
    await notificationService.sendDisputeResultNotification(
      dispute.user,
      dispute.disputeNo,
      data.result,
      data.remark
    );

    return success({ data: dispute, message: '争议处理完成' });
  });
}

module.exports = disputeRoutes;

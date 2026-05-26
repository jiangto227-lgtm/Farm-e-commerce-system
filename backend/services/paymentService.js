/**
 * ==========================================
 * 支付业务逻辑服务 (Payment Service)
 * ==========================================
 * 封装支付相关的核心业务逻辑，包括：
 * - 创建支付记录
 * - 支付回调处理
 * - 退款申请处理
 * - 支付记录查询
 * - 支付方式统计分析
 */

'use strict';

const Payment = require('../models/Payment');
const Order = require('../models/Order');
const { BusinessError } = require('../middleware/errorHandler');

/**
 * 创建支付记录
 * @param {string} userId - 用户ID
 * @param {Object} data - 支付数据 { orderId, method, amount }
 * @returns {Object} 创建的支付记录
 */
async function createPayment(userId, data) {
  const { orderId, method, amount } = data;

  // 1. 校验订单是否存在且属于当前用户
  const order = await Order.findById(orderId);
  if (!order) {
    throw new BusinessError(404003, '订单不存在', 404);
  }
  if (order.user.toString() !== userId) {
    throw new BusinessError(403001, '无权为该订单创建支付', 403);
  }
  if (order.paymentStatus === 'paid') {
    throw new BusinessError(400009, '该订单已支付，请勿重复支付', 400);
  }
  if (order.status === 'cancelled') {
    throw new BusinessError(400010, '已取消的订单无法支付', 400);
  }

  // 2. 校验金额
  if (amount !== order.totalAmount) {
    throw new BusinessError(
      400011,
      `支付金额不正确，应付金额: ${order.totalAmount}`,
      400
    );
  }

  // 3. 生成支付单号
  const paymentNo = Payment.generatePaymentNo();

  // 4. 创建支付记录
  const payment = await Payment.create({
    paymentNo,
    order: orderId,
    orderNo: order.orderNo,
    user: userId,
    method,
    amount,
    status: method === 'cash' ? 'success' : 'pending', // 现金支付直接成功
    paidAt: method === 'cash' ? new Date() : null,
  });

  // 5. 如果是现金支付，同步更新订单状态
  if (method === 'cash') {
    order.paymentStatus = 'paid';
    order.paymentMethod = method;
    await order.save();
  }

  return payment;
}

/**
 * 处理支付回调（来自第三方支付网关）
 * @param {Object} callbackData - 回调数据
 * @returns {Object} 处理结果
 */
async function handlePaymentCallback(callbackData) {
  // 这里根据实际支付网关的回调格式进行解析
  // 以下为通用处理逻辑，实际对接时需根据具体网关调整
  const { paymentNo, trxId, status, amount } = callbackData;

  if (!paymentNo) {
    throw new BusinessError(400012, '回调数据缺少支付单号', 400);
  }

  const payment = await Payment.findOne({ paymentNo });
  if (!payment) {
    throw new BusinessError(404004, '支付记录不存在', 404);
  }

  // 已处理的回调直接返回
  if (payment.status === 'success') {
    return { success: true, message: '该支付已处理' };
  }

  // 更新支付状态
  if (status === 'success' || status === 'completed') {
    payment.status = 'success';
    payment.thirdPartyTrxId = trxId || '';
    payment.paidAt = new Date();
    payment.callbackData = callbackData;
    await payment.save();

    // 同步更新订单支付状态
    await Order.findByIdAndUpdate(payment.order, {
      paymentStatus: 'paid',
      paymentMethod: payment.method,
    });

    return { success: true, message: '支付成功' };
  } else {
    payment.status = 'failed';
    payment.callbackData = callbackData;
    await payment.save();
    return { success: false, message: `支付失败: ${callbackData.message || '未知原因'}` };
  }
}

/**
 * 退款处理
 * @param {string} paymentId - 支付记录ID
 * @param {string} userId - 操作人ID
 * @param {string} role - 操作人角色
 * @param {Object} refundData - 退款数据 { amount, reason }
 * @returns {Object} 退款结果
 */
async function processRefund(paymentId, userId, role, refundData) {
  const { amount, reason } = refundData;

  const payment = await Payment.findById(paymentId);
  if (!payment) {
    throw new BusinessError(404004, '支付记录不存在', 404);
  }

  // 只有管理员或支付本人可申请退款
  if (role !== 'admin' && payment.user.toString() !== userId) {
    throw new BusinessError(403001, '无权操作该支付记录', 403);
  }

  if (payment.status !== 'success') {
    throw new BusinessError(400013, '只有已成功的支付才能退款', 400);
  }

  if (amount > payment.amount) {
    throw new BusinessError(400014, '退款金额不能大于支付金额', 400);
  }

  // 更新支付记录为退款中
  payment.status = 'refunding';
  payment.refundAmount = amount;
  payment.refundReason = reason || '';
  await payment.save();

  // 同步更新订单状态
  await Order.findByIdAndUpdate(payment.order, {
    status: 'refunded',
    paymentStatus: 'refunded',
  });

  // 完成退款（实际对接时需要调用支付网关的退款接口）
  payment.status = 'refunded';
  payment.refundedAt = new Date();
  await payment.save();

  return { success: true, refundAmount: amount };
}

/**
 * 获取支付记录列表
 * @param {Object} options - 查询选项
 * @returns {Object} 分页支付记录
 */
async function getPaymentList({ userId, role, method, status, page = 1, limit = 10 }) {
  const query = {};

  if (role !== 'admin') {
    query.user = userId;
  }
  if (method) query.method = method;
  if (status) query.status = status;

  const skip = (page - 1) * limit;

  const [payments, total] = await Promise.all([
    Payment.find(query)
      .populate('order', 'orderNo status')
      .populate('user', 'name phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Payment.countDocuments(query),
  ]);

  return { list: payments, total, page, limit };
}

/**
 * 获取支付方式分布统计
 * @returns {Array} 各支付方式的金额和次数
 */
async function getPaymentMethodStats(startDate, endDate) {
  const match = {
    status: 'success',
    createdAt: { $gte: startDate, $lte: endDate },
  };

  return Payment.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$method',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
      },
    },
    { $sort: { totalAmount: -1 } },
    {
      $project: {
        method: '$_id',
        count: 1,
        totalAmount: 1,
        _id: 0,
      },
    },
  ]);
}

module.exports = {
  createPayment,
  handlePaymentCallback,
  processRefund,
  getPaymentList,
  getPaymentMethodStats,
};

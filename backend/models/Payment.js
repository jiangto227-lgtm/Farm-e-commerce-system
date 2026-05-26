/**
 * ==========================================
 * 支付记录模型 (Payment Model)
 * ==========================================
 * 定义支付交易记录的数据结构，包含支付单号、关联订单、支付方式、金额、状态等
 * 用于跟踪每一笔支付交易的完整生命周期
 */

'use strict';

const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  // 支付单号（唯一）
  paymentNo: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  // 关联订单
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true,
  },
  // 订单编号（冗余存储）
  orderNo: {
    type: String,
    required: true,
  },
  // 支付用户
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // 支付方式
  method: {
    type: String,
    enum: ['cash', 'card', 'aba', 'wing', 'acleda', 'other'],
    required: true,
  },
  // 支付金额（KHR）
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  // 支付状态
  status: {
    type: String,
    enum: ['pending', 'success', 'failed', 'cancelled', 'refunding', 'refunded'],
    default: 'pending',
    index: true,
  },
  // 第三方支付交易号
  thirdPartyTrxId: {
    type: String,
    default: '',
  },
  // 支付时间
  paidAt: {
    type: Date,
    default: null,
  },
  // 退款金额
  refundAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  // 退款原因
  refundReason: {
    type: String,
    default: '',
  },
  // 退款时间
  refundedAt: {
    type: Date,
    default: null,
  },
  // 支付备注
  remark: {
    type: String,
    default: '',
  },
  // 回调通知原始数据
  callbackData: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  createdAt: {
    type: Date,
    default: () => new Date(),
  },
  updatedAt: {
    type: Date,
    default: () => new Date(),
  },
}, {
  timestamps: true,
});

// 索引
paymentSchema.index({ order: 1, status: 1 });
paymentSchema.index({ user: 1, createdAt: -1 });
paymentSchema.index({ method: 1, status: 1 });
paymentSchema.index({ createdAt: -1 });

/**
 * 静态方法：生成唯一支付单号
 * 格式: PAY + 年月日 + 6位随机数
 */
paymentSchema.statics.generatePaymentNo = function () {
  const moment = require('moment-timezone');
  const date = moment().tz('Asia/Phnom_Penh').format('YYYYMMDD');
  const random = Math.floor(100000 + Math.random() * 900000);
  return `PAY${date}${random}`;
};

module.exports = mongoose.model('Payment', paymentSchema);

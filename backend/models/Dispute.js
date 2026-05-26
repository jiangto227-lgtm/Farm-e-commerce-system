/**
 * ==========================================
 * 争议/投诉模型 (Dispute Model)
 * ==========================================
 * 定义订单争议的数据结构，用户可对订单提交争议申请
 * 支持退款、退货、协商等多种处理方式
 */

'use strict';

const mongoose = require('mongoose');

const disputeSchema = new mongoose.Schema({
  // 争议编号（唯一）
  disputeNo: {
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
  },
  // 订单编号（冗余存储）
  orderNo: {
    type: String,
    required: true,
  },
  // 提交用户
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // 争议类型
  type: {
    type: String,
    enum: ['refund', 'return', 'quality', 'missing', 'other'],
    required: true,
  },
  // 争议原因/描述
  reason: {
    type: String,
    required: [true, '争议原因不能为空'],
    maxlength: [1000, '描述不能超过1000个字符'],
  },
  // 凭证图片
  evidence: {
    type: [String],
    default: [],
  },
  // 期望退款金额
  refundAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  // 争议状态
  status: {
    type: String,
    enum: ['pending', 'processing', 'resolved', 'rejected'],
    default: 'pending',
    index: true,
  },
  // 处理结果
  result: {
    type: String,
    enum: ['', 'refunded', 'rejected', 'negotiated'],
    default: '',
  },
  // 处理说明
  handleRemark: {
    type: String,
    default: '',
  },
  // 处理人
  handledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  // 处理时间
  handledAt: {
    type: Date,
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
disputeSchema.index({ user: 1, createdAt: -1 });
disputeSchema.index({ order: 1 });
disputeSchema.index({ status: 1, createdAt: -1 });
disputeSchema.index({ type: 1 });

/**
 * 静态方法：生成唯一争议编号
 * 格式: DSP + 年月日 + 6位随机数
 */
disputeSchema.statics.generateDisputeNo = function () {
  const moment = require('moment-timezone');
  const date = moment().tz('Asia/Phnom_Penh').format('YYYYMMDD');
  const random = Math.floor(100000 + Math.random() * 900000);
  return `DSP${date}${random}`;
};

module.exports = mongoose.model('Dispute', disputeSchema);

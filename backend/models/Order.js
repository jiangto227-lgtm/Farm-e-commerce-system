/**
 * ==========================================
 * 订单模型 (Order Model)
 * ==========================================
 * 定义用户订单的数据结构，包含订单商品、收货地址、金额、状态流转等
 * 订单状态: pending -> processing -> delivering -> delivered -> completed/cancelled
 */

'use strict';

const mongoose = require('mongoose');

// 订单中的商品项
const orderItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  name: { type: String, required: true },
  image: { type: String, default: '' },
  price: { type: Number, required: true, min: 0 },
  quantity: { type: Number, required: true, min: 1 },
  specs: { type: String, default: '' },
  subtotal: { type: Number, required: true, min: 0 },
}, { _id: true });

// 收货地址快照
const addressSnapshotSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  province: { type: String, default: '' },
  city: { type: String, default: '' },
  district: { type: String, default: '' },
  detail: { type: String, required: true },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  // 订单编号（唯一）
  orderNo: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  // 下单用户
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  // 订单商品列表
  items: {
    type: [orderItemSchema],
    required: true,
    validate: [val => val.length > 0, '订单至少包含一个商品'],
  },
  // 商品总金额
  subtotal: {
    type: Number,
    required: true,
    min: 0,
  },
  // 配送费
  deliveryFee: {
    type: Number,
    default: 0,
    min: 0,
  },
  // 优惠金额
  discount: {
    type: Number,
    default: 0,
    min: 0,
  },
  // 订单总金额
  totalAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  // 收货地址快照
  address: {
    type: addressSnapshotSchema,
    required: true,
  },
  // 订单备注
  remark: {
    type: String,
    default: '',
    maxlength: [500, '备注不能超过500个字符'],
  },
  // 订单状态
  status: {
    type: String,
    enum: ['pending', 'processing', 'delivering', 'delivered', 'completed', 'cancelled', 'refunded'],
    default: 'pending',
    index: true,
  },
  // 支付方式
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'aba', 'wing', 'acleda', ''],
    default: '',
  },
  // 支付状态
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'paid', 'refunding', 'refunded'],
    default: 'unpaid',
  },
  // 配送骑手
  rider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  // 预计送达时间
  estimatedDelivery: {
    type: Date,
    default: null,
  },
  // 实际送达时间
  deliveredAt: {
    type: Date,
    default: null,
  },
  // 状态变更历史
  statusHistory: {
    type: [{
      status: String,
      time: { type: Date, default: () => new Date() },
      operator: { type: String, default: 'system' },
      remark: { type: String, default: '' },
    }],
    default: [],
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

// 索引优化
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ orderNo: 1 });
orderSchema.index({ rider: 1, status: 1 });

/**
 * 静态方法：生成唯一订单号
 * 格式: BM + 年月日 + 6位随机数
 */
orderSchema.statics.generateOrderNo = function () {
  const moment = require('moment-timezone');
  const date = moment().tz('Asia/Phnom_Penh').format('YYYYMMDD');
  const random = Math.floor(100000 + Math.random() * 900000);
  return `BM${date}${random}`;
};

module.exports = mongoose.model('Order', orderSchema);

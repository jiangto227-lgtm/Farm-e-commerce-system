/**
 * ==========================================
 * 购物车模型 (Cart Model)
 * ==========================================
 * 定义用户购物车的数据结构，每个用户对应一个购物车文档
 * 购物车中的商品项包含产品ID、数量、价格快照等
 */

'use strict';

const mongoose = require('mongoose');

// 购物车商品项
const cartItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  image: {
    type: String,
    default: '',
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  specs: {
    type: String,
    default: '',
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1,
  },
  // 是否已选中（用于结算）
  checked: {
    type: Boolean,
    default: true,
  },
  addedAt: {
    type: Date,
    default: () => new Date(),
  },
}, { _id: true });

const cartSchema = new mongoose.Schema({
  // 所属用户
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,  // 每个用户只有一个购物车
    index: true,
  },
  // 商品列表
  items: {
    type: [cartItemSchema],
    default: [],
  },
  // 购物车最后更新时间
  updatedAt: {
    type: Date,
    default: () => new Date(),
  },
}, {
  timestamps: true,
});

// 索引
cartSchema.index({ user: 1 });

/**
 * 实例方法：计算购物车中选中商品的总金额
 * @returns {number} 选中商品总金额
 */
cartSchema.methods.calculateTotal = function () {
  return this.items
    .filter(item => item.checked)
    .reduce((sum, item) => sum + item.price * item.quantity, 0);
};

/**
 * 实例方法：计算购物车中选中商品的总数量
 * @returns {number} 选中商品总数量
 */
cartSchema.methods.calculateCount = function () {
  return this.items
    .filter(item => item.checked)
    .reduce((sum, item) => sum + item.quantity, 0);
};

module.exports = mongoose.model('Cart', cartSchema);

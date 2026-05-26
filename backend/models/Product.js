/**
 * ==========================================
 * 产品模型 (Product Model)
 * ==========================================
 * 定义有机果蔬产品的数据结构，包含价格、库存、分类、图片等
 * 支持多规格、标签、上下架状态管理
 */

'use strict';

const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, '产品名称不能为空'],
    trim: true,
    maxlength: [100, '产品名称不能超过100个字符'],
  },
  // 产品副标题/简介
  subtitle: {
    type: String,
    default: '',
    maxlength: [200, '副标题不能超过200个字符'],
  },
  // 产品描述（富文本）
  description: {
    type: String,
    default: '',
  },
  // 产品主图
  image: {
    type: String,
    default: '',
  },
  // 产品相册
  gallery: {
    type: [String],
    default: [],
  },
  // 所属分类ID
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: [true, '产品分类不能为空'],
  },
  // 分类名称（冗余存储，方便查询）
  categoryName: {
    type: String,
    default: '',
  },
  // 单价（单位：KHR）
  price: {
    type: Number,
    required: [true, '产品价格不能为空'],
    min: [0, '价格不能为负数'],
  },
  // 原价（用于展示折扣）
  originalPrice: {
    type: Number,
    default: 0,
    min: [0, '原价不能为负数'],
  },
  // 库存数量
  stock: {
    type: Number,
    required: [true, '库存数量不能为空'],
    min: [0, '库存不能为负数'],
    default: 0,
  },
  // 销量
  sales: {
    type: Number,
    default: 0,
    min: 0,
  },
  // 重量/规格
  specs: {
    type: String,
    default: '',
  },
  // 标签（如：有机、新鲜、当季）
  tags: {
    type: [String],
    default: [],
  },
  // 产地
  origin: {
    type: String,
    default: '白马农场',
  },
  // 上下架状态
  status: {
    type: String,
    enum: ['on', 'off'],
    default: 'on',
  },
  // 是否推荐
  isRecommended: {
    type: Boolean,
    default: false,
  },
  // 评分（1-5）
  rating: {
    type: Number,
    default: 5,
    min: 0,
    max: 5,
  },
  // 评分人数
  ratingCount: {
    type: Number,
    default: 0,
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

// 索引优化查询
productSchema.index({ category: 1, status: 1 });
productSchema.index({ name: 'text', subtitle: 'text', description: 'text' });
productSchema.index({ status: 1, isRecommended: 1 });
productSchema.index({ price: 1 });
productSchema.index({ sales: -1 });

module.exports = mongoose.model('Product', productSchema);

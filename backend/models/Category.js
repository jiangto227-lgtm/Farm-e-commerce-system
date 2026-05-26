/**
 * ==========================================
 * 产品分类模型 (Category Model)
 * ==========================================
 * 定义产品分类的数据结构，支持多级分类
 */

'use strict';

const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, '分类名称不能为空'],
    trim: true,
    maxlength: [50, '分类名称不能超过50个字符'],
  },
  // 分类图标
  icon: {
    type: String,
    default: '',
  },
  // 分类描述
  description: {
    type: String,
    default: '',
    maxlength: [200, '描述不能超过200个字符'],
  },
  // 排序权重（数字越小越靠前）
  sortOrder: {
    type: Number,
    default: 0,
  },
  // 父分类ID（为空表示顶级分类）
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null,
  },
  // 分类状态
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
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
categorySchema.index({ parentId: 1, sortOrder: 1 });
categorySchema.index({ status: 1 });

module.exports = mongoose.model('Category', categorySchema);

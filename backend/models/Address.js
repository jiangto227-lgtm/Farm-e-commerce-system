/**
 * ==========================================
 * 收货地址模型 (Address Model)
 * ==========================================
 * 定义用户的收货地址数据结构，每个用户可保存多个地址
 * 支持设置默认收货地址
 */

'use strict';

const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  // 所属用户
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  // 收货人姓名
  name: {
    type: String,
    required: [true, '收货人姓名不能为空'],
    trim: true,
    maxlength: [50, '姓名不能超过50个字符'],
  },
  // 收货人电话
  phone: {
    type: String,
    required: [true, '收货人电话不能为空'],
    trim: true,
    match: [/^1[3-9]\d{9}$/, '手机号格式不正确'],
  },
  // 省份
  province: {
    type: String,
    default: '',
  },
  // 城市
  city: {
    type: String,
    default: '',
  },
  // 区县
  district: {
    type: String,
    default: '',
  },
  // 详细地址
  detail: {
    type: String,
    required: [true, '详细地址不能为空'],
    trim: true,
    maxlength: [200, '详细地址不能超过200个字符'],
  },
  // 标签（如：家、公司）
  tag: {
    type: String,
    default: '',
  },
  // 是否为默认地址
  isDefault: {
    type: Boolean,
    default: false,
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
addressSchema.index({ user: 1, isDefault: -1 });

/**
 * 保存前确保只有一个默认地址
 * 如果当前地址设为默认，则将用户其他地址设为非默认
 */
addressSchema.pre('save', async function (next) {
  if (this.isDefault) {
    try {
      await this.constructor.updateMany(
        { user: this.user, _id: { $ne: this._id } },
        { isDefault: false }
      );
      next();
    } catch (err) {
      next(err);
    }
  } else {
    next();
  }
});

module.exports = mongoose.model('Address', addressSchema);

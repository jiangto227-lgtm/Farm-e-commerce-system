/**
 * ==========================================
 * 骑手入驻申请模型 (Rider Application Model)
 * ==========================================
 * 定义骑手入驻申请的独立数据结构，包含个人信息、车辆信息、审核状态等
 * 审核通过后关联到 User 模型的 riderInfo 字段
 */

'use strict';

const mongoose = require('mongoose');

const riderApplicationSchema = new mongoose.Schema({
  // 关联用户
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,  // 每个用户只能提交一次申请
  },
  // 真实姓名
  realName: {
    type: String,
    required: [true, '真实姓名不能为空'],
    trim: true,
  },
  // 联系电话
  phone: {
    type: String,
    required: [true, '联系电话不能为空'],
  },
  // 身份证号
  idCard: {
    type: String,
    required: [true, '身份证号不能为空'],
  },
  // 身份证正面照
  idCardFront: {
    type: String,
    default: '',
  },
  // 身份证反面照
  idCardBack: {
    type: String,
    default: '',
  },
  // 车辆类型 (motorcycle/car/truck/bicycle)
  vehicleType: {
    type: String,
    required: [true, '车辆类型不能为空'],
    enum: ['motorcycle', 'car', 'truck', 'bicycle'],
  },
  // 车辆牌照
  vehiclePlate: {
    type: String,
    required: [true, '车辆牌照不能为空'],
  },
  // 驾驶证照片
  licensePhoto: {
    type: String,
    default: '',
  },
  // 配送区域
  deliveryArea: {
    type: String,
    default: '',
  },
  // 紧急联系人姓名
  emergencyContact: {
    type: String,
    default: '',
  },
  // 紧急联系人电话
  emergencyPhone: {
    type: String,
    default: '',
  },
  // 审核状态
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true,
  },
  // 审核备注
  verifyRemark: {
    type: String,
    default: '',
  },
  // 审核人
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  // 审核时间
  verifiedAt: {
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
riderApplicationSchema.index({ status: 1, createdAt: -1 });
riderApplicationSchema.index({ user: 1 });
riderApplicationSchema.index({ phone: 1 });

module.exports = mongoose.model('Rider', riderApplicationSchema);

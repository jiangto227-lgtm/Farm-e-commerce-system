/**
 * ==========================================
 * 用户数据模型 (User Model)
 * ==========================================
 * 定义系统用户信息结构，支持顾客、骑手、管理员三种角色
 * 字段说明：
 *   - phone: 手机号，作为登录账号
 *   - password: 加密后的密码
 *   - name: 用户昵称
 *   - avatar: 头像URL
 *   - role: 角色 (customer/rider/admin)
 *   - status: 账号状态 (active/inactive/banned)
 *   - riderInfo: 骑手额外信息（仅 role=rider 时有效）
 */

'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const riderInfoSchema = new mongoose.Schema({
  // 真实姓名
  realName: { type: String, default: '' },
  // 身份证号
  idCard: { type: String, default: '' },
  // 车辆类型
  vehicleType: { type: String, default: '' },
  // 车辆牌照
  vehiclePlate: { type: String, default: '' },
  // 工作状态 (online/offline/busy)
  workStatus: { type: String, default: 'offline' },
  // 配送区域
  deliveryArea: { type: String, default: '' },
  // 审核状态 (pending/approved/rejected)
  verifyStatus: { type: String, default: 'pending' },
  // 审核备注
  verifyRemark: { type: String, default: '' },
  // 审核时间
  verifiedAt: { type: Date, default: null },
}, { _id: false });

const userSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: [true, '手机号不能为空'],
    unique: true,
    trim: true,
    match: [/^1[3-9]\d{9}$/, '手机号格式不正确'],
  },
  password: {
    type: String,
    required: [true, '密码不能为空'],
    minlength: [6, '密码长度不能少于6位'],
    select: false,  // 默认查询不返回密码字段
  },
  name: {
    type: String,
    required: [true, '昵称不能为空'],
    trim: true,
    maxlength: [50, '昵称长度不能超过50个字符'],
  },
  avatar: {
    type: String,
    default: '',
  },
  role: {
    type: String,
    enum: ['customer', 'rider', 'admin'],
    default: 'customer',
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'banned'],
    default: 'active',
  },
  // 骑手专属信息
  riderInfo: {
    type: riderInfoSchema,
    default: () => ({}),
  },
  // 注册时间
  createdAt: {
    type: Date,
    default: () => new Date(),
  },
  // 更新时间
  updatedAt: {
    type: Date,
    default: () => new Date(),
  },
}, {
  timestamps: true,  // 自动管理 createdAt 和 updatedAt
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// 索引优化查询
userSchema.index({ phone: 1 });
userSchema.index({ role: 1, status: 1 });
userSchema.index({ 'riderInfo.verifyStatus': 1 });

/**
 * 保存前自动加密密码
 * 仅在密码被修改时进行加密，避免重复加密
 */
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

/**
 * 实例方法：验证密码是否正确
 * @param {string} candidatePassword - 待验证的明文密码
 * @returns {boolean} 验证结果
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

/**
 * 实例方法：转换为安全的 JSON（隐藏敏感字段）
 * @returns {Object} 脱敏后的用户对象
 */
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('User', userSchema);

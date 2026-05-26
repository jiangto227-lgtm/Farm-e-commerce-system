/**
 * ==========================================
 * 输入校验工具模块 (Validator Utilities)
 * ==========================================
 * 提供统一的输入校验功能，基于 Joi 校验库
 * 包含常用字段校验规则和请求参数校验函数
 * 防止恶意输入和注入攻击
 */

'use strict';

const Joi = require('joi');
const { BusinessError } = require('../middleware/errorHandler');

// ==================== 基础校验规则 ====================

// MongoDB ObjectId 校验
const objectId = Joi.string().pattern(/^[0-9a-fA-F]{24}$/);

// 手机号校验（柬埔寨 + 中国格式兼容）
const phone = Joi.string().pattern(/^1[3-9]\d{9}$/);

// 密码校验（至少6位，包含字母和数字）
const password = Joi.string().min(6).max(50);

// 正整数
const positiveInt = Joi.number().integer().min(1);

// 非负整数
const nonNegativeInt = Joi.number().integer().min(0);

// 金额（最多2位小数）
const money = Joi.number().precision(2).min(0);

// ==================== 校验模式定义 ====================

/**
 * 认证相关校验模式
 */
const authSchemas = {
  // 注册
  register: Joi.object({
    phone: phone.required().messages({
      'string.pattern.base': '手机号格式不正确',
      'any.required': '手机号不能为空',
    }),
    password: password.required().messages({
      'string.min': '密码长度不能少于6位',
      'any.required': '密码不能为空',
    }),
    name: Joi.string().min(1).max(50).required().messages({
      'any.required': '昵称不能为空',
      'string.max': '昵称不能超过50个字符',
    }),
  }),
  // 登录
  login: Joi.object({
    phone: phone.required().messages({
      'string.pattern.base': '手机号格式不正确',
      'any.required': '手机号不能为空',
    }),
    password: Joi.string().required().messages({
      'any.required': '密码不能为空',
    }),
  }),
  // 刷新 Token
  refresh: Joi.object({
    refreshToken: Joi.string().required().messages({
      'any.required': '刷新令牌不能为空',
    }),
  }),
};

/**
 * 产品相关校验模式
 */
const productSchemas = {
  // 创建产品
  create: Joi.object({
    name: Joi.string().min(1).max(100).required(),
    subtitle: Joi.string().max(200).allow('').default(''),
    description: Joi.string().allow('').default(''),
    image: Joi.string().allow('').default(''),
    gallery: Joi.array().items(Joi.string()).default([]),
    category: objectId.required().messages({
      'string.pattern.base': '无效的分类ID',
      'any.required': '产品分类不能为空',
    }),
    price: money.required().messages({
      'any.required': '产品价格不能为空',
    }),
    originalPrice: money.default(0),
    stock: nonNegativeInt.default(0),
    specs: Joi.string().allow('').default(''),
    tags: Joi.array().items(Joi.string()).default([]),
    origin: Joi.string().allow('').default('白马农场'),
    isRecommended: Joi.boolean().default(false),
  }),
  // 更新产品（字段可选）
  update: Joi.object({
    name: Joi.string().min(1).max(100),
    subtitle: Joi.string().max(200).allow(''),
    description: Joi.string().allow(''),
    image: Joi.string().allow(''),
    gallery: Joi.array().items(Joi.string()),
    category: objectId.messages({ 'string.pattern.base': '无效的分类ID' }),
    price: money,
    originalPrice: money,
    stock: nonNegativeInt,
    specs: Joi.string().allow(''),
    tags: Joi.array().items(Joi.string()),
    origin: Joi.string().allow(''),
    status: Joi.string().valid('on', 'off'),
    isRecommended: Joi.boolean(),
  }).min(1),
  // 产品列表查询参数
  listQuery: Joi.object({
    page: positiveInt.default(1),
    limit: positiveInt.max(100).default(10),
    cat: Joi.string().allow('').default(''),
    q: Joi.string().allow('').default(''),
    sort: Joi.string().valid('price_asc', 'price_desc', 'sales', 'newest').default('newest'),
  }),
};

/**
 * 订单相关校验模式
 */
const orderSchemas = {
  // 创建订单
  create: Joi.object({
    addressId: objectId.required().messages({
      'string.pattern.base': '无效的地址ID',
      'any.required': '收货地址不能为空',
    }),
    items: Joi.array().items(
      Joi.object({
        productId: objectId.required(),
        quantity: positiveInt.required(),
      })
    ).min(1).required().messages({
      'array.min': '订单至少包含一个商品',
      'any.required': '订单商品不能为空',
    }),
    remark: Joi.string().max(500).allow('').default(''),
    paymentMethod: Joi.string().valid('cash', 'card', 'aba', 'wing', 'acleda').default('cash'),
  }),
  // 更新订单状态
  updateStatus: Joi.object({
    status: Joi.string().valid('processing', 'delivering', 'delivered', 'completed', 'cancelled').required(),
    remark: Joi.string().allow('').default(''),
  }),
};

/**
 * 购物车相关校验模式
 */
const cartSchemas = {
  // 添加商品
  addItem: Joi.object({
    productId: objectId.required().messages({
      'any.required': '商品ID不能为空',
    }),
    quantity: positiveInt.default(1),
  }),
  // 更新数量
  updateQty: Joi.object({
    quantity: positiveInt.required().messages({
      'any.required': '数量不能为空',
    }),
  }),
};

/**
 * 支付相关校验模式
 */
const paymentSchemas = {
  // 创建支付
  create: Joi.object({
    orderId: objectId.required().messages({
      'any.required': '订单ID不能为空',
    }),
    method: Joi.string().valid('cash', 'card', 'aba', 'wing', 'acleda').required(),
    amount: money.required().messages({
      'any.required': '支付金额不能为空',
    }),
  }),
  // 退款申请
  refund: Joi.object({
    paymentId: objectId.required().messages({
      'any.required': '支付ID不能为空',
    }),
    amount: money.required(),
    reason: Joi.string().max(500).allow('').default(''),
  }),
  // 回调数据（较为宽松）
  callback: Joi.object().unknown(true),
};

/**
 * 地址相关校验模式
 */
const addressSchemas = {
  create: Joi.object({
    name: Joi.string().min(1).max(50).required(),
    phone: phone.required(),
    province: Joi.string().allow('').default(''),
    city: Joi.string().allow('').default(''),
    district: Joi.string().allow('').default(''),
    detail: Joi.string().min(1).max(200).required(),
    tag: Joi.string().max(20).allow('').default(''),
    isDefault: Joi.boolean().default(false),
  }),
};

/**
 * 骑手申请校验模式
 */
const riderSchemas = {
  apply: Joi.object({
    realName: Joi.string().min(1).max(50).required(),
    phone: phone.required(),
    idCard: Joi.string().min(6).max(30).required(),
    idCardFront: Joi.string().allow('').default(''),
    idCardBack: Joi.string().allow('').default(''),
    vehicleType: Joi.string().valid('motorcycle', 'car', 'truck', 'bicycle').required(),
    vehiclePlate: Joi.string().min(1).max(30).required(),
    licensePhoto: Joi.string().allow('').default(''),
    deliveryArea: Joi.string().allow('').default(''),
    emergencyContact: Joi.string().allow('').default(''),
    emergencyPhone: Joi.string().allow('').default(''),
  }),
};

/**
 * 争议相关校验模式
 */
const disputeSchemas = {
  create: Joi.object({
    orderId: objectId.required().messages({
      'any.required': '订单ID不能为空',
    }),
    type: Joi.string().valid('refund', 'return', 'quality', 'missing', 'other').required(),
    reason: Joi.string().min(1).max(1000).required(),
    evidence: Joi.array().items(Joi.string()).default([]),
    refundAmount: money.default(0),
  }),
  handle: Joi.object({
    result: Joi.string().valid('refunded', 'rejected', 'negotiated').required(),
    remark: Joi.string().allow('').default(''),
  }),
};

// ==================== 通用校验函数 ====================

/**
 * 通用校验函数
 * 使用指定模式校验数据，校验失败时抛出业务错误
 * @param {Joi.ObjectSchema} schema - Joi 校验模式
 * @param {Object} data - 待校验的数据
 * @param {Object} options - Joi 校验选项
 * @returns {Object} 校验后的数据（含默认值）
 * @throws {BusinessError} 校验失败时抛出
 */
function validate(schema, data, options = {}) {
  const defaultOptions = {
    abortEarly: false,      // 返回所有错误
    stripUnknown: true,     // 移除未定义的字段
    convert: true,          // 自动类型转换
    ...options,
  };

  const { error, value } = schema.validate(data, defaultOptions);

  if (error) {
    const messages = error.details.map(d => d.message).join('; ');
    throw new BusinessError(400001, `参数校验失败: ${messages}`, 400);
  }

  return value;
}

/**
 * 快速校验函数（返回布尔值，不抛出异常）
 * @param {Joi.ObjectSchema} schema - Joi 校验模式
 * @param {Object} data - 待校验的数据
 * @returns {boolean} 校验是否通过
 */
function isValid(schema, data) {
  const { error } = schema.validate(data, { abortEarly: true });
  return !error;
}

module.exports = {
  // 基础规则
  objectId,
  phone,
  password,
  positiveInt,
  nonNegativeInt,
  money,
  // 校验模式
  authSchemas,
  productSchemas,
  orderSchemas,
  cartSchemas,
  paymentSchemas,
  addressSchemas,
  riderSchemas,
  disputeSchemas,
  // 校验函数
  validate,
  isValid,
};

/**
 * ==========================================
 * 订单业务逻辑服务 (Order Service)
 * ==========================================
 * 封装订单的核心业务逻辑，包括：
 * - 创建订单（库存校验、金额计算）
 * - 订单列表查询（用户视角/管理员视角）
 * - 订单详情获取
 * - 订单状态流转（待处理→处理中→配送中→已送达→已完成）
 * - 取消订单
 * 订单状态机：pending -> processing -> delivering -> delivered -> completed
 *                         -> cancelled
 */

'use strict';

const Order = require('../models/Order');
const Product = require('../models/Product');
const Address = require('../models/Address');
const Cart = require('../models/Cart');
const { BusinessError } = require('../middleware/errorHandler');

// 有效的状态流转规则
const STATUS_FLOW = {
  pending: ['processing', 'cancelled'],
  processing: ['delivering', 'cancelled'],
  delivering: ['delivered'],
  delivered: ['completed'],
  completed: [],
  cancelled: [],
  refunded: [],
};

/**
 * 创建订单
 * @param {string} userId - 用户ID
 * @param {Object} orderData - 订单数据
 * @returns {Object} 创建的订单
 */
async function createOrder(userId, orderData) {
  const { addressId, items, remark, paymentMethod } = orderData;

  // 1. 获取收货地址
  const address = await Address.findOne({ _id: addressId, user: userId });
  if (!address) {
    throw new BusinessError(404002, '收货地址不存在', 404);
  }

  // 2. 校验商品并计算金额
  const orderItems = [];
  let subtotal = 0;

  for (const item of items) {
    const product = await Product.findById(item.productId);
    if (!product) {
      throw new BusinessError(404001, `商品不存在: ${item.productId}`, 404);
    }
    if (product.status !== 'on') {
      throw new BusinessError(400005, `商品「${product.name}」已下架`, 400);
    }
    if (product.stock < item.quantity) {
      throw new BusinessError(400006, `商品「${product.name}」库存不足，当前库存: ${product.stock}`, 400);
    }

    const subItemTotal = product.price * item.quantity;
    subtotal += subItemTotal;

    orderItems.push({
      productId: product._id,
      name: product.name,
      image: product.image,
      price: product.price,
      quantity: item.quantity,
      specs: product.specs,
      subtotal: subItemTotal,
    });
  }

  // 3. 计算订单总金额（含配送费）
  const deliveryFee = subtotal >= 50000 ? 0 : 3000; // 满50000免配送费
  const totalAmount = subtotal + deliveryFee;

  // 4. 生成订单号并创建订单
  const orderNo = Order.generateOrderNo();
  const order = await Order.create({
    orderNo,
    user: userId,
    items: orderItems,
    subtotal,
    deliveryFee,
    discount: 0,
    totalAmount,
    address: {
      name: address.name,
      phone: address.phone,
      province: address.province,
      city: address.city,
      district: address.district,
      detail: address.detail,
    },
    remark: remark || '',
    paymentMethod: paymentMethod || 'cash',
    status: 'pending',
    statusHistory: [{ status: 'pending', remark: '订单创建成功' }],
  });

  // 5. 扣减库存
  for (const item of items) {
    await Product.findByIdAndUpdate(item.productId, {
      $inc: { stock: -item.quantity, sales: item.quantity },
    });
  }

  // 6. 清空购物车中已下单的商品（可选）
  await Cart.updateOne(
    { user: userId },
    { $pull: { items: { productId: { $in: items.map(i => i.productId) } } } }
  );

  return order;
}

/**
 * 获取订单列表
 * @param {Object} options - 查询选项
 * @param {string} options.userId - 用户ID（普通用户只能看自己的）
 * @param {string} options.role - 用户角色
 * @param {string} options.status - 订单状态筛选
 * @param {number} options.page - 页码
 * @param {number} options.limit - 每页数量
 * @returns {Object} 分页订单列表
 */
async function getOrderList({ userId, role, status, page = 1, limit = 10 }) {
  const query = {};

  // 非管理员只能看自己的订单
  if (role !== 'admin') {
    query.user = userId;
  }

  // 状态筛选
  if (status && STATUS_FLOW[status] !== undefined) {
    query.status = status;
  }

  const skip = (page - 1) * limit;

  const [orders, total] = await Promise.all([
    Order.find(query)
      .populate('user', 'name phone')
      .populate('rider', 'name phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(query),
  ]);

  return { list: orders, total, page, limit };
}

/**
 * 获取订单详情
 * @param {string} orderId - 订单ID
 * @param {string} userId - 当前用户ID（用于权限校验）
 * @param {string} role - 当前用户角色
 * @returns {Object} 订单详情
 */
async function getOrderDetail(orderId, userId, role) {
  const order = await Order.findById(orderId)
    .populate('user', 'name phone')
    .populate('rider', 'name phone riderInfo');

  if (!order) {
    throw new BusinessError(404003, '订单不存在', 404);
  }

  // 权限校验：非管理员只能看自己的订单
  if (role !== 'admin' && order.user._id.toString() !== userId) {
    throw new BusinessError(403001, '无权查看该订单', 403);
  }

  return order;
}

/**
 * 更新订单状态
 * @param {string} orderId - 订单ID
 * @param {string} newStatus - 新状态
 * @param {string} operator - 操作人
 * @param {string} remark - 备注
 * @returns {Object} 更新后的订单
 */
async function updateOrderStatus(orderId, newStatus, operator = 'system', remark = '') {
  const order = await Order.findById(orderId);
  if (!order) {
    throw new BusinessError(404003, '订单不存在', 404);
  }

  const currentStatus = order.status;

  // 校验状态流转是否合法
  if (!STATUS_FLOW[currentStatus]?.includes(newStatus)) {
    throw new BusinessError(
      400007,
      `非法的状态流转: ${currentStatus} -> ${newStatus}`,
      400
    );
  }

  // 更新状态和状态历史
  order.status = newStatus;
  order.statusHistory.push({
    status: newStatus,
    operator,
    remark: remark || `订单状态变更为 ${newStatus}`,
  });

  // 特殊状态处理
  if (newStatus === 'delivered') {
    order.deliveredAt = new Date();
  }

  await order.save();
  return order;
}

/**
 * 分配骑手
 * @param {string} orderId - 订单ID
 * @param {string} riderId - 骑手用户ID
 */
async function assignRider(orderId, riderId) {
  const order = await Order.findById(orderId);
  if (!order) {
    throw new BusinessError(404003, '订单不存在', 404);
  }
  if (order.status !== 'processing') {
    throw new BusinessError(400008, '只有在处理中状态的订单才能分配骑手', 400);
  }

  order.rider = riderId;
  order.status = 'delivering';
  order.statusHistory.push({
    status: 'delivering',
    operator: 'admin',
    remark: `已分配骑手`,
  });
  await order.save();
  return order;
}

/**
 * 获取各状态订单数量统计
 * @param {string} userId - 用户ID
 * @param {string} role - 用户角色
 * @returns {Object} 各状态数量
 */
async function getOrderStatusCount(userId, role) {
  const match = role === 'admin' ? {} : { user: userId };

  const result = await Order.aggregate([
    { $match: match },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const counts = {
    pending: 0,
    processing: 0,
    delivering: 0,
    delivered: 0,
    completed: 0,
    cancelled: 0,
  };

  result.forEach(item => {
    counts[item._id] = item.count;
  });

  return counts;
}

module.exports = {
  createOrder,
  getOrderList,
  getOrderDetail,
  updateOrderStatus,
  assignRider,
  getOrderStatusCount,
  STATUS_FLOW,
};

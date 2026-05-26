/**
 * ==========================================
 * 产品业务逻辑服务 (Product Service)
 * ==========================================
 * 封装产品的核心业务逻辑，包括：
 * - 产品列表查询（支持分类筛选、关键词搜索、排序、分页）
 * - 产品详情获取
 * - 产品创建、更新、删除
 * - 热销产品排行
 * 控制器层通过调用此服务处理业务，保持路由层简洁
 */

'use strict';

const Product = require('../models/Product');
const Category = require('../models/Category');
const { BusinessError } = require('../middleware/errorHandler');

/**
 * 获取产品列表
 * @param {Object} options - 查询选项
 * @param {string} options.cat - 分类ID
 * @param {string} options.q - 搜索关键词
 * @param {string} options.sort - 排序方式
 * @param {number} options.page - 页码
 * @param {number} options.limit - 每页数量
 * @returns {Object} 包含分页信息的产品列表
 */
async function getProductList({ cat = '', q = '', sort = 'newest', page = 1, limit = 10 }) {
  const query = { status: 'on' };

  // 分类筛选
  if (cat && cat.length === 24) {
    query.category = cat;
  }

  // 关键词搜索（使用文本索引）
  if (q && q.trim()) {
    query.$or = [
      { name: { $regex: q.trim(), $options: 'i' } },
      { subtitle: { $regex: q.trim(), $options: 'i' } },
      { tags: { $in: [new RegExp(q.trim(), 'i')] } },
    ];
  }

  // 排序配置
  let sortOption = {};
  switch (sort) {
    case 'price_asc':
      sortOption = { price: 1 };
      break;
    case 'price_desc':
      sortOption = { price: -1 };
      break;
    case 'sales':
      sortOption = { sales: -1 };
      break;
    case 'newest':
    default:
      sortOption = { createdAt: -1 };
      break;
  }

  const skip = (page - 1) * limit;

  // 并行执行查询和计数
  const [products, total] = await Promise.all([
    Product.find(query)
      .populate('category', 'name icon')
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .lean(),
    Product.countDocuments(query),
  ]);

  return { list: products, total, page, limit };
}

/**
 * 获取产品详情
 * @param {string} productId - 产品ID
 * @returns {Object} 产品详情对象
 */
async function getProductDetail(productId) {
  const product = await Product.findById(productId)
    .populate('category', 'name icon description');

  if (!product) {
    throw new BusinessError(404001, '产品不存在', 404);
  }

  return product;
}

/**
 * 创建产品
 * @param {Object} data - 产品数据
 * @returns {Object} 新创建的产品
 */
async function createProduct(data) {
  // 验证分类是否存在
  const category = await Category.findById(data.category);
  if (!category) {
    throw new BusinessError(400004, '所选分类不存在', 400);
  }

  // 填充分类名称
  data.categoryName = category.name;

  const product = await Product.create(data);
  return product;
}

/**
 * 更新产品
 * @param {string} productId - 产品ID
 * @param {Object} data - 更新的数据
 * @returns {Object} 更新后的产品
 */
async function updateProduct(productId, data) {
  // 如果更新了分类，同步更新分类名称
  if (data.category) {
    const category = await Category.findById(data.category);
    if (!category) {
      throw new BusinessError(400004, '所选分类不存在', 400);
    }
    data.categoryName = category.name;
  }

  const product = await Product.findByIdAndUpdate(
    productId,
    data,
    { new: true, runValidators: true }
  );

  if (!product) {
    throw new BusinessError(404001, '产品不存在', 404);
  }

  return product;
}

/**
 * 删除产品
 * @param {string} productId - 产品ID
 */
async function deleteProduct(productId) {
  const product = await Product.findByIdAndDelete(productId);
  if (!product) {
    throw new BusinessError(404001, '产品不存在', 404);
  }
}

/**
 * 获取热销产品排行
 * @param {number} limit - 返回数量
 * @returns {Array} 热销产品列表
 */
async function getTopSellingProducts(limit = 10) {
  return Product.find({ status: 'on', sales: { $gt: 0 } })
    .sort({ sales: -1 })
    .limit(limit)
    .select('name image price sales rating')
    .lean();
}

/**
 * 获取推荐产品
 * @param {number} limit - 返回数量
 * @returns {Array} 推荐产品列表
 */
async function getRecommendedProducts(limit = 6) {
  return Product.find({ status: 'on', isRecommended: true })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

/**
 * 获取分类列表（嵌套结构）
 * @returns {Array} 分类树
 */
async function getCategoryList() {
  const categories = await Category.find({ status: 'active' })
    .sort({ sortOrder: 1, createdAt: -1 })
    .lean();

  // 构建嵌套分类树
  const categoryMap = {};
  const tree = [];

  categories.forEach(cat => {
    cat.children = [];
    categoryMap[cat._id.toString()] = cat;
  });

  categories.forEach(cat => {
    if (cat.parentId) {
      const parent = categoryMap[cat.parentId.toString()];
      if (parent) {
        parent.children.push(cat);
      }
    } else {
      tree.push(cat);
    }
  });

  return tree;
}

module.exports = {
  getProductList,
  getProductDetail,
  createProduct,
  updateProduct,
  deleteProduct,
  getTopSellingProducts,
  getRecommendedProducts,
  getCategoryList,
};

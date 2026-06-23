const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const { authenticate } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// GET /api/products
router.get('/', authenticate, async (req, res) => {
  try {
    const { status } = req.query;
    const query = status ? { status } : {};
    const products = await Product.find(query).sort({ product_name: 1 });
    res.json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});

// GET /api/products/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const product = await Product.findOne({ product_id: req.params.id });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, product });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch product' });
  }
});

// POST /api/products
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      product_name,
      shortcode,
      price,
      description,
      usage_example,
      assigned_admins,
      routing_mode,
      status,
    } = req.body;

    if (!product_name || !shortcode || price === undefined) {
      return res.status(400).json({
        success: false,
        message: 'product_name, shortcode, and price are required',
      });
    }

    // Check shortcode uniqueness
    const existing = await Product.findOne({ shortcode: shortcode.toLowerCase() });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Shortcode already exists' });
    }

    const product = await Product.create({
      product_id: uuidv4(),
      product_name,
      shortcode: shortcode.toLowerCase(),
      price: Number(price),
      description,
      usage_example,
      assigned_admins: assigned_admins || [],
      routing_mode: routing_mode || 'specific',
      status: status || 'active',
    });

    logger.info(`Product ${product.product_name} created by ${req.admin.username}`);
    res.status(201).json({ success: true, product });
  } catch (error) {
    logger.error('Create product error:', error);
    res.status(500).json({ success: false, message: 'Failed to create product' });
  }
});

// PUT /api/products/:id
router.put('/:id', authenticate, async (req, res) => {
  try {
    const {
      product_name,
      shortcode,
      price,
      description,
      usage_example,
      assigned_admins,
      routing_mode,
      status,
    } = req.body;

    // Check shortcode uniqueness (if changing)
    if (shortcode) {
      const existing = await Product.findOne({
        shortcode: shortcode.toLowerCase(),
        product_id: { $ne: req.params.id },
      });
      if (existing) {
        return res.status(409).json({ success: false, message: 'Shortcode already in use' });
      }
    }

    const update = {};
    if (product_name) update.product_name = product_name;
    if (shortcode) update.shortcode = shortcode.toLowerCase();
    if (price !== undefined) update.price = Number(price);
    if (description !== undefined) update.description = description;
    if (usage_example !== undefined) update.usage_example = usage_example;
    if (assigned_admins !== undefined) update.assigned_admins = assigned_admins;
    if (routing_mode) update.routing_mode = routing_mode;
    if (status) update.status = status;

    const product = await Product.findOneAndUpdate(
      { product_id: req.params.id },
      update,
      { new: true }
    );

    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    logger.info(`Product ${product.product_name} updated by ${req.admin.username}`);
    res.json({ success: true, product });
  } catch (error) {
    logger.error('Update product error:', error);
    res.status(500).json({ success: false, message: 'Failed to update product' });
  }
});

// DELETE /api/products/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const product = await Product.findOneAndDelete({ product_id: req.params.id });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    logger.info(`Product ${product.product_name} deleted by ${req.admin.username}`);
    res.json({ success: true, message: 'Product deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete product' });
  }
});

// PATCH /api/products/:id/toggle
router.patch('/:id/toggle', authenticate, async (req, res) => {
  try {
    const product = await Product.findOne({ product_id: req.params.id });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    product.status = product.status === 'active' ? 'inactive' : 'active';
    await product.save();

    res.json({ success: true, product, message: `Product ${product.status}` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to toggle product' });
  }
});

module.exports = router;

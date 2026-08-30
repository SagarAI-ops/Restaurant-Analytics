// server/src/index.js

/**
 * StockHouse Express Server Entry Point
 */

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// Import database (runs migrations on first import)
const db = require('./db');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');
const { authenticate, optionalAuth } = require('./middleware/auth');

// Import routes
const authRoutes = require('./routes/auth');
const unitsRoutes = require('./routes/units');
const ingredientsRoutes = require('./routes/ingredients');
const suppliersRoutes = require('./routes/suppliers');
const menuItemsRoutes = require('./routes/menuItems');
const channelsRoutes = require('./routes/channels');
const purchasesRoutes = require('./routes/purchases');
const salesRoutes = require('./routes/sales');
const wastageRoutes = require('./routes/wastage');
const transfersRoutes = require('./routes/transfers');
const countsRoutes = require('./routes/counts');

// Create Express app
const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/units', unitsRoutes);
app.use('/api/ingredients', ingredientsRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/menu-items', menuItemsRoutes);
app.use('/api/channels', channelsRoutes);
app.use('/api/purchases', purchasesRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/wastage', wastageRoutes);
app.use('/api/transfers', transfersRoutes);
app.use('/api/counts', countsRoutes);

// 404 handler for unknown routes
app.use((req, res, next) => {
  const err = new Error(`Route ${req.method} ${req.path} not found`);
  err.statusCode = 404;
  err.code = 'NOT_FOUND';
  next(err);
});

// Global error handler
app.use(errorHandler);

// Start server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀 StockHouse server running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`💾 Database: ${db.name}`);
  });
}

module.exports = app;

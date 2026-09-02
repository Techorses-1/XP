const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const xpInventorySchema = new mongoose.Schema({
    xpId: {
        type: String,
        unique: true,
        default: () => `xp-${uuidv4().substring(0, 8)}`,
    },
    productName: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true,
        unique: true,
    },
    quantity: {
        type: Number,
        required: true,
        default: 0,
        min: [0, 'Quantity cannot be negative']
    },
    totalQuantityAdded: {
        type: Number,
        default: 0,
        min: [0, 'Total quantity added cannot be negative']
    },
    totalCost: {
        type: Number,
        default: 0,
        min: [0, 'Total cost cannot be negative']
    },
    avgPurchasePrice: {
        type: Number,
        default: 0,
        min: [0, 'Average purchase price cannot be negative']
    },
    // ========== NEW SELLING PRICES ==========
    sellingPrice3ml: {
        type: Number,
        default: 0,
        min: [0, 'Selling price cannot be negative']
    },
    sellingPrice6ml: {
        type: Number,
        default: 0,
        min: [0, 'Selling price cannot be negative']
    },
    // ========================================
    minStock: {
        type: Number,
        default: 5,
        min: [0, 'Min stock cannot be negative']
    },
    // ========== DENSITY FIELD ==========
    density: {
        type: Number,
        default: 1000,
        min: [1, 'Density must be at least 1'],
        max: [1000, 'Density cannot exceed 1000']
    },
    // =======================================
    createdBy: {
        userId: { type: String },
        userName: { type: String },
        userEmail: { type: String }
    },
    updatedBy: {
        userId: { type: String },
        userName: { type: String },
        userEmail: { type: String }
    }
}, {
    timestamps: true
});

// ✅ UNIQUE INDEX - One product per productName
xpInventorySchema.index({ productName: 1 }, { unique: true });

// ✅ Indexes for faster queries
xpInventorySchema.index({ quantity: 1 });
xpInventorySchema.index({ density: 1 });

// ✅ Static method to get low stock items
xpInventorySchema.statics.getLowStockItems = async function () {
    return await this.find({
        $expr: { $lt: ["$quantity", "$minStock"] }
    }).lean();
};

// ✅ Static method to check if product exists
xpInventorySchema.statics.productExists = async function (productName) {
    const exists = await this.findOne({ productName: productName.trim() });
    return !!exists;
};

// ✅ Static method to get product by name
xpInventorySchema.statics.getProduct = async function (productName) {
    return await this.findOne({ productName: productName.trim() });
};

const XPInventory = mongoose.models.XPInventory || mongoose.model('XPInventory', xpInventorySchema);

module.exports = XPInventory;
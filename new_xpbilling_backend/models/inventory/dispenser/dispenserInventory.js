const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const dispenserInventorySchema = new mongoose.Schema({
    dispenserId: {
        type: String,
        unique: true,
        default: () => `dis-${uuidv4().substring(0, 8)}`,
    },
    productName: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true,
        unique: true,
        index: true
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
    totalPurchaseCost: {
        type: Number,
        default: 0,
        min: [0, 'Total purchase cost cannot be negative']
    },
    avgPurchasePrice: {
        type: Number,
        default: 0,
        min: [0, 'Average purchase price cannot be negative']
    },
    sellingPrice3ml: {
        type: Number,
        required: [true, '3ml selling price is required'],
        default: 0,
        min: [0, 'Selling price cannot be negative']
    },
    sellingPrice6ml: {
        type: Number,
        required: [true, '6ml selling price is required'],
        default: 0,
        min: [0, 'Selling price cannot be negative']
    },
    discount: {
        type: Number,
        default: 0,
        min: [0, 'Discount cannot be negative'],
        max: [100, 'Discount cannot exceed 100%']
    },
    minStock: {
        type: Number,
        default: 5,
        min: [0, 'Min stock cannot be negative']
    },
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
dispenserInventorySchema.index({ productName: 1 }, { unique: true });

// ✅ Indexes for faster queries
dispenserInventorySchema.index({ quantity: 1 });

// ✅ Static method to get low stock items
dispenserInventorySchema.statics.getLowStockItems = async function () {
    return await this.find({
        $expr: { $lt: ["$quantity", "$minStock"] }
    }).lean();
};

// ✅ Static method to check if product exists
dispenserInventorySchema.statics.productExists = async function (productName) {
    const exists = await this.findOne({ productName: productName.trim() });
    return !!exists;
};

// ✅ Static method to get product by name
dispenserInventorySchema.statics.getProduct = async function (productName) {
    return await this.findOne({ productName: productName.trim() });
};

const DispenserInventory = mongoose.models.DispenserInventory || mongoose.model('DispenserInventory', dispenserInventorySchema);

module.exports = DispenserInventory;
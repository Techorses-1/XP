const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const bottlesInventorySchema = new mongoose.Schema({
    bottleItemId: {
        type: String,
        unique: true,
        default: () => `btl-${uuidv4().substring(0, 8)}`,
    },
    mlSize: {
        type: String,
        required: [true, 'ML size is required'],
        trim: true,
    },
    itemType: {
        type: String,
        required: [true, 'Item type is required'],
        trim: true,
    },
    quantity: {
        type: Number,
        required: [true, 'Quantity is required'],
        default: 0,
        min: [0, 'Quantity cannot be negative']
    },
    // ✅ NEW: Total cost of all inventory (for avg price calculation)
    totalCost: {
        type: Number,
        default: 0,
        min: [0, 'Total cost cannot be negative']
    },
    // ✅ NEW: Average purchase price
    avgPurchasePrice: {
        type: Number,
        default: 0,
        min: [0, 'Average purchase price cannot be negative']
    },
    minStock: {
        type: Number,
        default: 5,
        min: [0, 'Min stock cannot be negative']
    },
    createdBy: {
        userId: {
            type: String,
            required: false
        },
        userName: {
            type: String,
            required: false
        },
        userEmail: {
            type: String,
            required: false
        }
    },
    updatedBy: {
        userId: {
            type: String,
            required: false
        },
        userName: {
            type: String,
            required: false
        },
        userEmail: {
            type: String,
            required: false
        }
    }
}, {
    timestamps: true
});

// ✅ COMPOUND UNIQUE INDEX - one document per (mlSize + itemType)
bottlesInventorySchema.index({ mlSize: 1, itemType: 1 }, { unique: true });

// ✅ Index for faster quantity queries
bottlesInventorySchema.index({ quantity: 1 });

// ✅ Static method to get stock by mlSize
bottlesInventorySchema.statics.getStockByML = async function (mlSize) {
    return await this.find({ mlSize }).lean();
};

// ✅ Static method to get stock by itemType
bottlesInventorySchema.statics.getStockByItemType = async function (itemType) {
    return await this.find({ itemType }).lean();
};

// ✅ Static method to get low stock items
bottlesInventorySchema.statics.getLowStockItems = async function () {
    return await this.find({
        $expr: { $lt: ["$quantity", "$minStock"] }
    }).lean();
};

// ✅ Static method to check if combination exists
bottlesInventorySchema.statics.combinationExists = async function (mlSize, itemType) {
    const exists = await this.findOne({ mlSize, itemType }).lean();
    return !!exists;
};

// ✅ Static method to get product by combination
bottlesInventorySchema.statics.getProduct = async function (mlSize, itemType) {
    return await this.findOne({ mlSize, itemType });
};

const BottlesInventory = mongoose.models.BottlesInventory || mongoose.model('BottlesInventory', bottlesInventorySchema);

module.exports = BottlesInventory;
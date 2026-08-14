const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const logsSchema = new mongoose.Schema({
    logId: {
        type: String,
        unique: true,
        default: () => uuidv4(),
    },
    module: {
        type: String,
        required: [true, 'Module is required'],
        enum: [
            // Existing modules
            'Workshop',
            'Packages',
            'Customers',
            'Products',
            'Invoice',
            'Inventory',
            'Discount',
            'Disposal',
            'Report',
            'Admin',
            'WhatsApp',
            'Bottles Inventory',
            'XP Inventory',
            'Dispenser Inventory',
            'Exclusive Oils',
            'Bottles ML',
            'Bottles Item Types',
            'Product Disposal',
            'Loyalty Reset',
            // ✅ NEW MODULES ADDED
            'Authentication',   // For login/register/logout
        ],
    },
    userId: {
        type: String,
        required: [true, 'User ID is required'],
    },
    userName: {
        type: String,
        required: [true, 'User name is required']
    },
    userEmail: {
        type: String,
        required: [true, 'User email is required']
    },
    action: {
        type: String,
        required: [true, 'Action is required'],
        enum: [
            // Existing actions
            'Create',
            'Update',
            'Delete',
            'Add',
            'Remove',
            'Toggle',
            'Patch',
            'SoftDelete',
            'Restore',
            'Add Stock',
            'Add ML',
            'Add Item',
            'Bulk Upload',
            'Create Product',
            'Update Product',
            'Delete Product',
            'Add Quantity',
            'Remove Stock',
            'Bulk Upload Products',
            'Dispose',
            'Invoice',
            'Reset Coins',
            // ✅ NEW ACTIONS ADDED
            'Get Users',
            'Register',
            'Update User',
            'Delete User',
            'Login',
            'Logout',
            'Get Profile',
            'Update Profile',
            'Export',
            'Bulk Create',
            'Toggle Status',
            'Update Package',
            'Delete Package',
            'Update Promo',
            'Delete Promo',
            'Create Promo',
            'Update Loyalty',
            'Add Customer',
            'Remove Customer',
            'Update Attendance',
            'Update Package In Workshop',
            'Toggle Workshop',
            'Delete Workshop',
            'Update Workshop',
            'Create Workshop',
            'Add Quantity',
            'Remove Quantity',
            'Add ML Size',
            'Update ML Size',
            'Delete ML Size',
            'Add Item Type',
            'Update Item Type',
            'Delete Item Type',
            'Bulk Upload Inventory',
            'Bulk Upload Products',
            'Create XP Product',
            'Update XP Product',
            'Delete XP Product',
            'Create Dispenser Product',
            'Update Dispenser Product',
            'Delete Dispenser Product',
            'Create Bottles Product',
            'Update Bottles Product',
            'Delete Bottles Product',
        ],
    },
    heading: {
        type: String,
        required: [true, 'Heading is required'],
        trim: true
    },
    status: {
        type: String,
        required: [true, 'Status is required'],
        enum: ['success', 'failed'],
    },
    description: {
        type: String,
        default: '',
        trim: true
    },
    timestamp: {
        type: Date,
        default: function () {
            // Store in IST (Indian Standard Time)
            const now = new Date();
            // IST is UTC + 5:30
            const istOffset = 5.5 * 60 * 60 * 1000;
            const istDate = new Date(now.getTime() + istOffset);
            return istDate;
        },
    }
}, {
    timestamps: false
});

// ✅ Indexes for better query performance
logsSchema.index({ module: 1, timestamp: -1 });
logsSchema.index({ userId: 1, timestamp: -1 });
logsSchema.index({ status: 1, timestamp: -1 });
logsSchema.index({ createdAt: -1 });

const Log = mongoose.models.Log || mongoose.model('Log', logsSchema);

module.exports = Log;
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// Customer sub-schema (copy from workshop)
const deletedWorkshopCustomerSchema = new mongoose.Schema({
    customerId: {
        type: String,
        required: false
    },
    customerName: {
        type: String,
        required: false
    },
    email: {
        type: String,
        default: ''
    },
    contactNumber: {
        type: String,
        required: false
    },
    packageId: {
        type: String,
        required: false
    },
    packageName: {
        type: String,
        required: false
    },
    packagePricing: {
        type: Number,
        default: 0
    },
    packageOilCount: {
        type: Number,
        default: 0
    },
    packageDiscount: {
        type: Number,
        default: 0
    },
    attended: {
        type: Boolean,
        default: true
    }
}, {
    _id: true
});

const deletedWorkshopSchema = new mongoose.Schema({
    // ✅ Keep the SAME workshopId (not auto-generated)
    workshopId: {
        type: String,
        required: true,
        unique: true
    },
    date: {
        type: Date,
        required: false
    },
    startTime: {
        type: String,
        required: false
    },
    endTime: {
        type: String,
        required: false
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'inactive'
    },
    customers: [deletedWorkshopCustomerSchema],
    
    // ✅ Track who deleted it
    deletedBy: {
        userId: {
            type: String,
            required: true
        },
        userName: {
            type: String,
            required: true
        },
        userEmail: {
            type: String,
            required: true
        }
    },
    
    // ✅ Track when it was deleted (IST)
    deletedAt: {
        type: Date,
        default: function() {
            const now = new Date();
            const istOffset = 5.5 * 60 * 60 * 1000;
            return new Date(now.getTime() + istOffset);
        }
    },
    
    // ✅ Keep original creation timestamps
    originalCreatedAt: {
        type: Date,
        required: false
    },
    originalUpdatedAt: {
        type: Date,
        required: false
    }
}, {
    timestamps: false
});

// ✅ Indexes - keep only necessary ones
deletedWorkshopSchema.index({ workshopId: 1 }); // Already unique, but keep for queries
deletedWorkshopSchema.index({ deletedAt: -1 });
deletedWorkshopSchema.index({ 'deletedBy.userId': 1 });

const DeletedWorkshop = mongoose.models.DeletedWorkshop || mongoose.model('DeletedWorkshop', deletedWorkshopSchema);

module.exports = DeletedWorkshop;
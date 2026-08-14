const Log = require("../models/logs");

/**
 * Create a log entry
 * @param {Object} data - Log data
 * @param {string} data.module - Module name (Workshop, Packages, etc.)
 * @param {string} data.userId - User ID who performed action
 * @param {string} data.userName - User's name
 * @param {string} data.userEmail - User's email
 * @param {string} data.action - Action type (Create, Update, Delete, Add, Remove, Toggle, Patch)
 * @param {string} data.heading - Short title of the action
 * @param {string} data.status - 'success' or 'failed'
 * @param {string} [data.description] - Detailed description (optional)
 * @returns {Promise<Object>} - Saved log object
 */
const createLog = async (data) => {
    try {
        const { module, userId, userName, userEmail, action, heading, status, description } = data;

        // Validate required fields
        if (!module || !userId || !userName || !userEmail || !action || !heading || !status) {
            throw new Error('Missing required fields for log entry');
        }

        // Validate status
        if (!['success', 'failed'].includes(status)) {
            throw new Error('Status must be "success" or "failed"');
        }

        // Create log entry
        const log = new Log({
            module,
            userId,
            userName,
            userEmail,
            action,
            heading,
            status,
            description: description || '',
        });

        const savedLog = await log.save();
        return savedLog.toObject();
    } catch (error) {
        console.error('Error creating log:', error.message);
        // Don't throw error - just log to console so main operation doesn't fail
        return null;
    }
};

/**
 * Log success entry
 * @param {Object} data - Same as createLog but status is auto-set to 'success'
 */
const logSuccess = async (data) => {
    return createLog({ ...data, status: 'success' });
};

/**
 * Log failed entry
 * @param {Object} data - Same as createLog but status is auto-set to 'failed'
 */
const logFailed = async (data) => {
    return createLog({ ...data, status: 'failed' });
};

/**
 * Get logs with pagination and filters
 * @param {Object} filters - Filter options
 * @param {string} filters.module - Filter by module
 * @param {string} filters.status - Filter by status
 * @param {string} filters.userId - Filter by user
 * @param {Date} filters.startDate - Filter by start date
 * @param {Date} filters.endDate - Filter by end date
 * @param {number} page - Page number (default: 1)
 * @param {number} limit - Items per page (default: 50)
 */
const getLogs = async (filters = {}, page = 1, limit = 50) => {
    try {
        const query = {};

        if (filters.module) query.module = filters.module;
        if (filters.status) query.status = filters.status;
        if (filters.userId) query.userId = filters.userId;
        if (filters.startDate || filters.endDate) {
            query.timestamp = {};
            if (filters.startDate) query.timestamp.$gte = new Date(filters.startDate);
            if (filters.endDate) query.timestamp.$lte = new Date(filters.endDate);
        }

        const skip = (page - 1) * limit;

        const [logs, total] = await Promise.all([
            Log.find(query)
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Log.countDocuments(query)
        ]);

        return {
            logs,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        };
    } catch (error) {
        console.error('Error fetching logs:', error);
        return { logs: [], pagination: { page: 1, limit, total: 0, totalPages: 0 } };
    }
};

module.exports = {
    createLog,
    logSuccess,
    logFailed,
    getLogs
};
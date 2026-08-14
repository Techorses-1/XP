const express = require("express");
const router = express.Router();
const Log = require("../models/logs");
const User = require("../models/user");
const jwt = require("jsonwebtoken");
const { logSuccess, logFailed } = require("../utils/logHelper");

// ============================================
// AUTH MIDDLEWARE
// ============================================
const auth = async (req, res, next) => {
    try {
        const token = req.cookies.token;
        if (!token) {
            return res.status(401).json({ message: 'No token provided' });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findOne({ userId: decoded.userId });
        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }
        req.user = user;
        next();
    } catch (error) {
        console.error("Auth middleware error:", error);
        res.status(401).json({ message: 'Invalid token' });
    }
};

// ============================================
// CHECK LOGS PERMISSION
// ============================================
const checkLogsPermission = (req, res, next) => {
    const permissions = req.user.permissions || [];
    if (permissions.includes('admin') || permissions.includes('logs')) {
        next();
    } else {
        return res.status(403).json({
            message: 'Access denied. Logs permission required.'
        });
    }
};

// ============================================
// GET LOGS WITH FILTERS & PAGINATION
// ============================================
router.get("/get-logs", auth, checkLogsPermission, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            email = '',
            status = '',
            timeFilter = 'all',
            date = ''
        } = req.query;

        console.log("\n📋 LOGS FILTERS:");
        console.log("  📧 Email:", email || "All");
        console.log("  📊 Status:", status || "All");
        console.log("  ⏰ Time Filter:", timeFilter);
        console.log("  📅 Date:", date || "None");

        // Build query
        let query = {};

        // 1. Filter by email
        if (email && email.trim() !== '') {
            const emailRegex = new RegExp(email.trim(), 'i');
            query.userEmail = { $regex: emailRegex };
        }

        // 2. Filter by status
        if (status && status.trim() !== '') {
            query.status = status;
        }

        // 3. Filter by date
        if (timeFilter === 'custom' && date) {
            const selectedDate = new Date(date);
            // Set to start of day (00:00:00)
            const startOfDay = new Date(selectedDate);
            startOfDay.setHours(0, 0, 0, 0);
            // Set to end of day (23:59:59)
            const endOfDay = new Date(selectedDate);
            endOfDay.setHours(23, 59, 59, 999);
            
            query.timestamp = {
                $gte: startOfDay,
                $lte: endOfDay
            };
        }

        console.log("📝 Final Query:", JSON.stringify(query, null, 2));

        // Get total count
        const total = await Log.countDocuments(query);

        // Get paginated results
        const logs = await Log.find(query)
            .sort({ timestamp: -1 })
            .skip((parseInt(page) - 1) * parseInt(limit))
            .limit(parseInt(limit))
            .lean();

        const totalPages = Math.ceil(total / parseInt(limit));

        // Get unique emails for filter dropdown
        const uniqueEmails = await Log.distinct('userEmail');

        res.status(200).json({
            success: true,
            data: logs,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages,
                hasNextPage: parseInt(page) < totalPages,
                hasPrevPage: parseInt(page) > 1
            },
            filters: {
                email: email || null,
                status: status || null,
                timeFilter: timeFilter || 'all',
                date: date || null
            },
            uniqueEmails: uniqueEmails || []
        });

    } catch (error) {
        console.error("Error fetching logs:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch logs",
            error: error.message
        });
    }
});

// ============================================
// EXPORT LOGS TO EXCEL
// ============================================
router.get("/export", auth, checkLogsPermission, async (req, res) => {
    try {
        const {
            email = '',
            status = '',
            timeFilter = 'all',
            date = ''
        } = req.query;

        console.log("\n📊 LOGS EXPORT STARTED:");
        console.log("  📧 Email:", email || "All");
        console.log("  📊 Status:", status || "All");
        console.log("  ⏰ Time Filter:", timeFilter);
        console.log("  📅 Date:", date || "None");

        // Build query (same as get-logs)
        let query = {};

        if (email && email.trim() !== '') {
            const emailRegex = new RegExp(email.trim(), 'i');
            query.userEmail = { $regex: emailRegex };
        }

        if (status && status.trim() !== '') {
            query.status = status;
        }

        if (timeFilter === 'custom' && date) {
            const selectedDate = new Date(date);
            const startOfDay = new Date(selectedDate);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(selectedDate);
            endOfDay.setHours(23, 59, 59, 999);
            
            query.timestamp = {
                $gte: startOfDay,
                $lte: endOfDay
            };
        }

        const logs = await Log.find(query)
            .sort({ timestamp: -1 })
            .lean();

        console.log(`✅ Found ${logs.length} logs to export`);

        if (logs.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No logs found to export"
            });
        }

        // Prepare data for Excel
        const XLSX = require('xlsx');

        const formatDate = (dateString) => {
            if (!dateString) return '-';
            const date = new Date(dateString);
            return date.toLocaleString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        };

        const exportData = logs.map(log => ({
            'Log ID': log.logId || 'N/A',
            'Module': log.module || 'N/A',
            'User Name': log.userName || 'N/A',
            'User Email': log.userEmail || 'N/A',
            'Action': log.action || 'N/A',
            'Heading': log.heading || 'N/A',
            'Status': log.status || 'N/A',
            'Description': log.description || 'N/A',
            'Timestamp': formatDate(log.timestamp)
        }));

        // Create workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(exportData);

        // Set column widths
        ws['!cols'] = [
            { wch: 15 },  // Log ID
            { wch: 20 },  // Module
            { wch: 25 },  // User Name
            { wch: 30 },  // User Email
            { wch: 15 },  // Action
            { wch: 40 },  // Heading
            { wch: 12 },  // Status
            { wch: 60 },  // Description
            { wch: 25 }   // Timestamp
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Logs');

        const filename = `logs_export_${new Date().toISOString().split('T')[0]}.xlsx`;
        const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

        console.log(`✅ Export file created: ${filename}`);
        console.log(`📊 Rows exported: ${exportData.length}`);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        res.send(buffer);

    } catch (error) {
        console.error("❌ Export failed:", error);
        res.status(500).json({
            success: false,
            message: "Failed to export logs",
            error: error.message
        });
    }
});

// ============================================
// GET LOGS SUMMARY STATS
// ============================================
router.get("/get-summary", auth, checkLogsPermission, async (req, res) => {
    try {
        const { days = 7 } = req.query;

        // Get summary for last N days
        const now = new Date();
        const startDate = new Date(now);
        startDate.setDate(startDate.getDate() - parseInt(days));

        const summary = await Log.aggregate([
            {
                $match: {
                    timestamp: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: null,
                    totalLogs: { $sum: 1 },
                    successCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
                    },
                    failedCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
                    },
                    uniqueUsers: { $addToSet: '$userEmail' }
                }
            },
            {
                $project: {
                    _id: 0,
                    totalLogs: 1,
                    successCount: 1,
                    failedCount: 1,
                    uniqueUsersCount: { $size: '$uniqueUsers' }
                }
            }
        ]);

        // Get module-wise breakdown
        const moduleBreakdown = await Log.aggregate([
            {
                $match: {
                    timestamp: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: '$module',
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { count: -1 }
            }
        ]);

        res.status(200).json({
            success: true,
            data: {
                summary: summary[0] || {
                    totalLogs: 0,
                    successCount: 0,
                    failedCount: 0,
                    uniqueUsersCount: 0
                },
                moduleBreakdown: moduleBreakdown || []
            }
        });

    } catch (error) {
        console.error("Error fetching logs summary:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch logs summary",
            error: error.message
        });
    }
});

module.exports = router;
const express = require("express");
const router = express.Router();
const Workshop = require("../models/workshop");
const Customer = require("../models/customer");
const Package = require("../models/package");
const User = require("../models/user");
const jwt = require("jsonwebtoken");
const DeletedWorkshop = require("../models/deletedWorkshop");
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
// CHECK WORKSHOP PERMISSION
// ============================================
const checkWorkshopPermission = (req, res, next) => {
    const permissions = req.user.permissions || [];

    if (permissions.includes('admin') || permissions.includes('workshop')) {
        next();
    } else {
        return res.status(403).json({
            message: 'Access denied. Workshop permission required.'
        });
    }
};

// ============================================
// HELPER FUNCTIONS
// ============================================
const isFutureDate = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const inputDate = new Date(date);
    inputDate.setHours(0, 0, 0, 0);
    return inputDate >= today;
};

const isWithinOneMonth = (date) => {
    const today = new Date();
    const oneMonthLater = new Date(today);
    oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
    const inputDate = new Date(date);
    return inputDate <= oneMonthLater;
};

const getEndTime = (startTime, durationMinutes) => {
    const [hours, minutes] = startTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + durationMinutes;
    const endHours = Math.floor(totalMinutes / 60);
    const endMinutes = totalMinutes % 60;
    return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
};

const buildDateFilter = (filter, from, to) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    const startOfYear = new Date(today.getFullYear(), 0, 1);
    const endOfYear = new Date(today.getFullYear(), 11, 31);
    endOfYear.setHours(23, 59, 59, 999);

    let dateFilter = {};

    switch (filter) {
        case 'all':
            // No date restriction - return all workshops regardless of date
            dateFilter = {};
            break;
        case 'today':
            dateFilter = { $gte: today, $lte: new Date(today.getTime() + 86400000 - 1) };
            break;
        case 'yesterday':
            dateFilter = { $gte: yesterday, $lte: new Date(yesterday.getTime() + 86400000 - 1) };
            break;
        case 'this-week':
            dateFilter = { $gte: startOfWeek, $lte: endOfWeek };
            break;
        case 'this-month':
            dateFilter = { $gte: startOfMonth, $lte: endOfMonth };
            break;
        case 'this-year':
            dateFilter = { $gte: startOfYear, $lte: endOfYear };
            break;
        case 'custom':
            if (from && to) {
                const fromDate = new Date(from);
                fromDate.setHours(0, 0, 0, 0);
                const toDate = new Date(to);
                toDate.setHours(23, 59, 59, 999);
                dateFilter = { $gte: fromDate, $lte: toDate };
            }
            break;
        default:
            // Default to today if no filter
            dateFilter = { $gte: today, $lte: new Date(today.getTime() + 86400000 - 1) };
            break;
    }

    return dateFilter;
};

// ============================================
// HELPER: BUILD SEARCH QUERY
// ============================================
const buildSearchQuery = (searchTerm) => {
    if (!searchTerm || searchTerm.trim() === '') {
        return {};
    }

    const search = searchTerm.trim();
    const isDate = /^\d{2}[-/]\d{2}[-/]\d{4}$/.test(search) || /^\d{4}[-/]\d{2}[-/]\d{2}$/.test(search);

    // If it looks like a date, search by date
    if (isDate) {
        const dateObj = new Date(search);
        if (!isNaN(dateObj)) {
            const start = new Date(dateObj);
            start.setHours(0, 0, 0, 0);
            const end = new Date(dateObj);
            end.setHours(23, 59, 59, 999);
            return { date: { $gte: start, $lte: end } };
        }
    }

    // Otherwise search in customers array
    return {
        $or: [
            { 'customers.customerName': { $regex: search, $options: 'i' } },
            { 'customers.contactNumber': { $regex: search, $options: 'i' } }
        ]
    };
};

// ============================================
// GET ALL WORKSHOPS WITH FILTERS, SEARCH & PAGINATION
// ============================================
router.get("/get-all", auth, async (req, res) => {
    try {
        const {
            filter = 'today',
            from,
            to,
            search = '',
            page = 1,
            limit = 20,
            sortBy = 'date',
            sortOrder = 'asc'
        } = req.query;

        // Build query
        let query = { isDeleted: false };

        // 1. Apply date filter
        const dateFilter = buildDateFilter(filter, from, to);
        if (Object.keys(dateFilter).length > 0) {
            query.date = dateFilter;
        }

        // 2. Apply search filter
        const searchQuery = buildSearchQuery(search);
        if (Object.keys(searchQuery).length > 0) {
            // If search is by date, merge with date filter
            if (searchQuery.date) {
                query.date = searchQuery.date;
            } else {
                // Search by customer name or number - use $elemMatch for better performance
                query.$or = searchQuery.$or;
            }
        }

        // Count total documents matching the query
        const total = await Workshop.countDocuments(query);

        // Build sort object
        const sortObj = {};
        sortObj[sortBy] = sortOrder === 'asc' ? 1 : -1;

        // Get paginated results with optimized projection
        const workshops = await Workshop.find(query)
            .sort(sortObj)
            .skip((parseInt(page) - 1) * parseInt(limit))
            .limit(parseInt(limit))
            .select('-__v') // Exclude version field
            .lean();

        // Calculate pagination metadata
        const totalPages = Math.ceil(total / parseInt(limit));

        res.status(200).json({
            workshops,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages,
                hasNextPage: parseInt(page) < totalPages,
                hasPrevPage: parseInt(page) > 1
            },
            filters: {
                filter,
                from: from || null,
                to: to || null,
                search: search || null
            }
        });

    } catch (error) {
        console.error("Error fetching workshops:", error);
        res.status(500).json({
            message: "Failed to fetch workshops",
            error: error.message
        });
    }
});

// ============================================
// GET ACTIVE WORKSHOPS WITH FILTERS, SEARCH & PAGINATION
// ============================================
router.get("/get-active", auth, async (req, res) => {
    try {
        const {
            filter = 'today',
            from,
            to,
            search = '',
            page = 1,
            limit = 20,
            sortBy = 'date',
            sortOrder = 'asc'
        } = req.query;

        // Build query
        let query = {
            isDeleted: false,
            status: 'active'
        };

        // 1. Apply date filter
        const dateFilter = buildDateFilter(filter, from, to);
        if (Object.keys(dateFilter).length > 0) {
            query.date = dateFilter;
        }

        // 2. Apply search filter
        const searchQuery = buildSearchQuery(search);
        if (Object.keys(searchQuery).length > 0) {
            if (searchQuery.date) {
                query.date = searchQuery.date;
            } else {
                query.$or = searchQuery.$or;
            }
        }

        // Count total
        const total = await Workshop.countDocuments(query);

        // Build sort
        const sortObj = {};
        sortObj[sortBy] = sortOrder === 'asc' ? 1 : -1;

        // Get paginated results
        const workshops = await Workshop.find(query)
            .sort(sortObj)
            .skip((parseInt(page) - 1) * parseInt(limit))
            .limit(parseInt(limit))
            .select('-__v')
            .lean();

        const totalPages = Math.ceil(total / parseInt(limit));

        res.status(200).json({
            workshops,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages,
                hasNextPage: parseInt(page) < totalPages,
                hasPrevPage: parseInt(page) > 1
            },
            filters: {
                filter,
                from: from || null,
                to: to || null,
                search: search || null
            }
        });

    } catch (error) {
        console.error("Error fetching active workshops:", error);
        res.status(500).json({
            message: "Failed to fetch active workshops",
            error: error.message
        });
    }
});


// ============================================
// EXPORT WORKSHOPS TO EXCEL
// ============================================
router.get("/export", auth, async (req, res) => {
    try {
        console.log("\n========== 📊 WORKSHOP EXPORT STARTED ==========");

        const {
            filter = 'today',
            from,
            to,
            search = '',
            viewMode = 'active'
        } = req.query;

        console.log("📋 Export Filters:");
        console.log("  📅 Filter:", filter);
        console.log("  📅 From:", from || "None");
        console.log("  📅 To:", to || "None");
        console.log("  🔍 Search:", search || "None");
        console.log("  👁️ View Mode:", viewMode);

        // ============================================
        // 1. BUILD QUERY
        // ============================================
        let query = { isDeleted: false };

        // Status filter (active/all)
        if (viewMode === 'active') {
            query.status = 'active';
        }

        // Date filter
        const dateFilter = buildDateFilter(filter, from, to);
        if (Object.keys(dateFilter).length > 0) {
            query.date = dateFilter;
        }

        // Search filter
        const searchQuery = buildSearchQuery(search);
        if (Object.keys(searchQuery).length > 0) {
            if (searchQuery.date) {
                query.date = searchQuery.date;
            } else {
                query.$or = searchQuery.$or;
            }
        }

        console.log("📝 Final Query:", JSON.stringify(query, null, 2));

        // ============================================
        // 2. FETCH WORKSHOPS
        // ============================================
        const workshops = await Workshop.find(query)
            .sort({ date: 1, startTime: 1 })
            .lean();

        console.log(`✅ Found ${workshops.length} workshops`);

        if (workshops.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No workshops found to export"
            });
        }

        // ============================================
        // 3. PREPARE DATA FOR EXCEL
        // ============================================
        const XLSX = require('xlsx');

        const formatDate = (dateString) => {
            if (!dateString) return '-';
            const date = new Date(dateString);
            return date.toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            });
        };

        // ============================================
        // SHEET 1: WORKSHOP SUMMARY
        // ============================================
        console.log("\n📊 Creating Sheet 1: Workshop Summary...");

        const summaryData = workshops.map(w => ({
            'Workshop ID': w.workshopId || 'N/A',
            'Date': formatDate(w.date),
            'Start Time': w.startTime || 'N/A',
            'End Time': w.endTime || 'N/A',
            'Status': w.status || 'N/A',
            'Total Customers': w.customers?.length || 0,
            'Attended': w.customers?.filter(c => c.attended === true).length || 0,
            'Absent': w.customers?.filter(c => c.attended === false).length || 0,
            'Invoiced': w.customers?.filter(c => c.invoiceCreated === true).length || 0,
            'Not Invoiced': w.customers?.filter(c => c.invoiceCreated === false || c.invoiceCreated === undefined).length || 0,
            'Created At': w.createdAt ? new Date(w.createdAt).toLocaleString('en-IN') : 'N/A'
        }));

        // ============================================
        // SHEET 2: WORKSHOP DETAILS (Header + Customers)
        // ============================================
        console.log("\n📊 Creating Sheet 2: Workshop Details...");

        const detailsData = [];

        for (const workshop of workshops) {
            const customerCount = workshop.customers?.length || 0;

            // Get customer counts for summary
            const attendedCount = workshop.customers?.filter(c => c.attended === true).length || 0;
            const invoicedCount = workshop.customers?.filter(c => c.invoiceCreated === true).length || 0;

            // ✅ 1st Row: WORKSHOP HEADER
            detailsData.push({
                'Workshop ID': workshop.workshopId || 'N/A',
                'Date': formatDate(workshop.date),
                'Start Time': workshop.startTime || 'N/A',
                'End Time': workshop.endTime || 'N/A',
                'Status': workshop.status || 'N/A',
                'Total Customers': customerCount,
                'Attended': attendedCount,
                'Invoiced': invoicedCount,
                'Customer Name': `📋 WORKSHOP HEADER - ${customerCount} customers`,
                'Contact': '',
                'Package': '',
                'Package Price': '',
                'Attended Status': '',
                'Invoice Created': ''
            });

            // ✅ 2nd Row: Column Headers for Customers
            detailsData.push({
                'Workshop ID': '',
                'Date': '',
                'Start Time': '',
                'End Time': '',
                'Status': '',
                'Total Customers': '',
                'Attended': '',
                'Invoiced': '',
                'Customer Name': '━━━━━━━━━━━━━━━━━━━━━',
                'Contact': '━━━━━━━━━━━━━━━━━━━━━',
                'Package': '━━━━━━━━━━━━━━━━━━━━━',
                'Package Price': '━━━━━━━━━━━━━━━━━━━━━',
                'Attended Status': '━━━━━━━━━━━━━━━━━━━━━',
                'Invoice Created': '━━━━━━━━━━━━━━━━━━━━━'
            });

            // ✅ 3rd Row onwards: CUSTOMER DETAILS (multiple rows)
            if (customerCount === 0) {
                detailsData.push({
                    'Workshop ID': '',
                    'Date': '',
                    'Start Time': '',
                    'End Time': '',
                    'Status': '',
                    'Total Customers': '',
                    'Attended': '',
                    'Invoiced': '',
                    'Customer Name': '⚠️ No customers in this workshop',
                    'Contact': '',
                    'Package': '',
                    'Package Price': '',
                    'Attended Status': '',
                    'Invoice Created': ''
                });
            } else {
                for (const customer of workshop.customers) {
                    detailsData.push({
                        'Workshop ID': '',
                        'Date': '',
                        'Start Time': '',
                        'End Time': '',
                        'Status': '',
                        'Total Customers': '',
                        'Attended': '',
                        'Invoiced': '',
                        'Customer Name': customer.customerName || 'N/A',
                        'Contact': customer.contactNumber || 'N/A',
                        'Package': customer.packageName || 'N/A',
                        'Package Price': customer.packagePricing ? `₹${customer.packagePricing}` : 'N/A',
                        'Attended Status': customer.attended ? '✅ Present' : '❌ Absent',
                        'Invoice Created': customer.invoiceCreated ? '✅ Yes' : '❌ No'
                    });
                }
            }

            // Add empty row separator between workshops
            detailsData.push({
                'Workshop ID': '',
                'Date': '',
                'Start Time': '',
                'End Time': '',
                'Status': '',
                'Total Customers': '',
                'Attended': '',
                'Invoiced': '',
                'Customer Name': '',
                'Contact': '',
                'Package': '',
                'Package Price': '',
                'Attended Status': '',
                'Invoice Created': ''
            });
        }

        console.log(`✅ Details data: ${detailsData.length} rows created`);

        // ============================================
        // 4. CREATE EXCEL WORKBOOK
        // ============================================
        console.log("\n📁 Creating Excel Workbook...");

        const wb = XLSX.utils.book_new();

        // Sheet 1: Summary
        const ws1 = XLSX.utils.json_to_sheet(summaryData);
        ws1['!cols'] = [
            { wch: 15 }, // Workshop ID
            { wch: 15 }, // Date
            { wch: 12 }, // Start Time
            { wch: 12 }, // End Time
            { wch: 10 }, // Status
            { wch: 16 }, // Total Customers
            { wch: 12 }, // Attended
            { wch: 10 }, // Absent
            { wch: 12 }, // Invoiced
            { wch: 14 }, // Not Invoiced
            { wch: 20 }  // Created At
        ];
        XLSX.utils.book_append_sheet(wb, ws1, 'Workshop Summary');

        // Sheet 2: Details
        const ws2 = XLSX.utils.json_to_sheet(detailsData);
        ws2['!cols'] = [
            { wch: 15 }, // Workshop ID
            { wch: 15 }, // Date
            { wch: 12 }, // Start Time
            { wch: 12 }, // End Time
            { wch: 10 }, // Status
            { wch: 16 }, // Total Customers
            { wch: 12 }, // Attended
            { wch: 12 }, // Invoiced
            { wch: 30 }, // Customer Name
            { wch: 18 }, // Contact
            { wch: 25 }, // Package
            { wch: 16 }, // Package Price
            { wch: 18 }, // Attended Status
            { wch: 18 }  // Invoice Created
        ];
        XLSX.utils.book_append_sheet(wb, ws2, 'Workshop Details');

        // ============================================
        // 5. GENERATE AND SEND FILE
        // ============================================
        const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
        const filename = `workshops_export_${new Date().toISOString().split('T')[0]}.xlsx`;

        console.log(`✅ Excel file created: ${filename}`);
        console.log(`📊 Summary rows: ${summaryData.length}`);
        console.log(`📊 Details rows: ${detailsData.length}`);
        console.log("========== 📊 WORKSHOP EXPORT COMPLETED ==========\n");

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        res.send(buffer);

    } catch (error) {
        console.error("\n❌ WORKSHOP EXPORT FAILED:");
        console.error("Error:", error);
        console.error("Stack:", error.stack);
        console.log("==========================================\n");

        await logFailed({
            module: 'Workshop',
            userId: req.user?.userId || 'Unknown',
            userName: req.user?.name || 'Unknown',
            userEmail: req.user?.email || 'Unknown',
            action: 'Export',
            heading: 'Workshop Export Failed',
            description: error.message || 'Unknown error occurred'
        });

        res.status(500).json({
            success: false,
            message: "Failed to export workshops",
            error: error.message
        });
    }
});

// ============================================
// GET SINGLE WORKSHOP (NO CHANGE NEEDED)
// ============================================
router.get("/:workshopId", auth, async (req, res) => {
    try {
        const { workshopId } = req.params;

        const workshop = await Workshop.findOne({
            workshopId: workshopId,
            isDeleted: false
        }).select('-__v');

        if (!workshop) {
            return res.status(404).json({
                message: "Workshop not found"
            });
        }

        res.status(200).json(workshop);
    } catch (error) {
        console.error("Error fetching workshop:", error);
        res.status(500).json({
            message: "Failed to fetch workshop",
            error: error.message
        });
    }
});

// ============================================
// GET AVAILABLE TIME SLOTS (NO CHANGE NEEDED)
// ============================================
router.get("/available-slots/:date", auth, async (req, res) => {
    try {
        const { date } = req.params;
        const inputDate = new Date(date);
        inputDate.setHours(0, 0, 0, 0);

        // if (!isFutureDate(date)) {
        //     return res.status(400).json({
        //         message: "Date must be a future date"
        //     });
        // }

        const workshops = await Workshop.find({
            date: inputDate,
            isDeleted: false,
            status: 'active'
        }).select('startTime endTime');

        const bookedSlots = workshops.map(w => ({
            startTime: w.startTime,
            endTime: w.endTime
        }));

        // All available time slots from 9 AM to 7 PM with 30 min increments
        const allSlots = [];
        for (let hour = 9; hour <= 18; hour++) {
            for (let minute = 0; minute < 60; minute += 30) {
                const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                allSlots.push(time);
            }
        }

        // Filter available slots
        const availableSlots = allSlots.filter(slot => {
            const slotEnd = getEndTime(slot, 30);
            return !bookedSlots.some(booked => {
                return slot < booked.endTime && slotEnd > booked.startTime;
            });
        });

        res.status(200).json({
            date: date,
            availableSlots: availableSlots,
            bookedSlots: bookedSlots
        });

    } catch (error) {
        console.error("Error fetching available slots:", error);
        res.status(500).json({
            message: "Failed to fetch available slots",
            error: error.message
        });
    }
});

// ============================================
// GET WORKSHOPS BY DATE (DEPRECATED - use /get-all with filter instead)
// ============================================
router.get("/date/:date", auth, async (req, res) => {
    try {
        const { date } = req.params;
        const inputDate = new Date(date);
        inputDate.setHours(0, 0, 0, 0);

        const workshops = await Workshop.find({
            date: inputDate,
            isDeleted: false
        }).sort({ startTime: 1 }).select('-__v');

        res.status(200).json(workshops);
    } catch (error) {
        console.error("Error fetching workshops by date:", error);
        res.status(500).json({
            message: "Failed to fetch workshops",
            error: error.message
        });
    }
});

// ============================================
// CREATE WORKSHOP - NO DATE RESTRICTIONS
// ============================================
router.post("/create", auth, checkWorkshopPermission, async (req, res) => {
    try {
        const { date, startTime, endTime } = req.body;

        // Validate required fields
        if (!date || !startTime || !endTime) {
            await logFailed({
                module: 'Workshop',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Create',
                heading: 'Workshop Creation Failed',
                description: 'Date, start time and end time are required'
            });
            return res.status(400).json({
                message: "Date, start time and end time are required"
            });
        }

        // ✅ REMOVED: isFutureDate() check
        // ✅ REMOVED: isWithinOneMonth() check

        // Validate start time < end time
        if (startTime >= endTime) {
            await logFailed({
                module: 'Workshop',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Create',
                heading: 'Workshop Creation Failed',
                description: 'Start time must be before end time'
            });
            return res.status(400).json({
                message: "Start time must be before end time"
            });
        }

        // Check if slot is already taken
        const isAvailable = await Workshop.isSlotAvailable(date, startTime, endTime);
        if (!isAvailable) {
            await logFailed({
                module: 'Workshop',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Create',
                heading: 'Workshop Creation Failed',
                description: 'Time slot overlaps with existing workshop'
            });
            return res.status(400).json({
                message: "This time slot overlaps with an existing workshop. Please choose another time."
            });
        }

        // Create workshop
        const workshop = new Workshop({
            date: new Date(date),
            startTime: startTime,
            endTime: endTime,
            status: 'active',
            customers: []
        });

        const savedWorkshop = await workshop.save();

        await logSuccess({
            module: 'Workshop',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Create',
            heading: 'Workshop Created Successfully',
            description: `Workshop created for ${new Date(date).toLocaleDateString()} at ${startTime} to ${endTime}`
        });

        res.status(201).json({
            message: "Workshop created successfully",
            workshop: savedWorkshop.toObject()
        });

    } catch (error) {
        console.error("Error creating workshop:", error);

        await logFailed({
            module: 'Workshop',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Create',
            heading: 'Workshop Creation Failed',
            description: error.message || 'Unknown error occurred'
        });

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                message: "Validation error",
                error: error.message
            });
        }

        res.status(500).json({
            message: "Failed to create workshop",
            error: error.message
        });
    }
});

// ============================================
// UPDATE WORKSHOP - NO DATE RESTRICTIONS
// ============================================
router.put("/update/:workshopId", auth, checkWorkshopPermission, async (req, res) => {
    try {
        const { workshopId } = req.params;
        const { date, startTime, endTime } = req.body;

        const workshop = await Workshop.findOne({
            workshopId: workshopId,
            isDeleted: false
        });

        if (!workshop) {
            await logFailed({
                module: 'Workshop',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Update',
                heading: 'Workshop Update Failed',
                description: 'Workshop not found'
            });
            return res.status(404).json({
                message: "Workshop not found"
            });
        }

        const updateData = {};
        let updateDescription = '';

        // Update date if provided
        if (date) {
            // ✅ REMOVED: isFutureDate() check
            // ✅ REMOVED: isWithinOneMonth() check
            updateData.date = new Date(date);
            updateDescription += `Date changed to ${new Date(date).toLocaleDateString()}, `;
        }

        // Update time if provided
        if (startTime && endTime) {
            if (startTime >= endTime) {
                await logFailed({
                    module: 'Workshop',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Update',
                    heading: 'Workshop Update Failed',
                    description: 'Start time must be before end time'
                });
                return res.status(400).json({
                    message: "Start time must be before end time"
                });
            }

            // Check if slot is already taken (excluding current workshop)
            const isAvailable = await Workshop.isSlotAvailable(
                updateData.date || workshop.date,
                startTime,
                endTime,
                workshopId
            );

            if (!isAvailable) {
                await logFailed({
                    module: 'Workshop',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Update',
                    heading: 'Workshop Update Failed',
                    description: 'Time slot overlaps with existing workshop'
                });
                return res.status(400).json({
                    message: "This time slot overlaps with an existing workshop. Please choose another time."
                });
            }

            updateData.startTime = startTime;
            updateData.endTime = endTime;
            updateDescription += `Time changed to ${startTime} - ${endTime}`;
        }

        const updatedWorkshop = await Workshop.findOneAndUpdate(
            { workshopId: workshopId },
            updateData,
            { new: true, runValidators: true }
        );

        await logSuccess({
            module: 'Workshop',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Update',
            heading: 'Workshop Updated Successfully',
            description: updateDescription || 'Workshop details updated'
        });

        res.status(200).json({
            message: "Workshop updated successfully",
            workshop: updatedWorkshop.toObject()
        });

    } catch (error) {
        console.error("Error updating workshop:", error);

        await logFailed({
            module: 'Workshop',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Update',
            heading: 'Workshop Update Failed',
            description: error.message || 'Unknown error occurred'
        });

        res.status(500).json({
            message: "Failed to update workshop",
            error: error.message
        });
    }
});

// ============================================
// ADD CUSTOMER TO WORKSHOP (NO CHANGE NEEDED)
// ============================================
router.post("/:workshopId/add-customer", auth, checkWorkshopPermission, async (req, res) => {
    try {
        const { workshopId } = req.params;
        const { customerId, packageId } = req.body;

        if (!customerId || !packageId) {
            await logFailed({
                module: 'Workshop',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Add',
                heading: 'Add Customer Failed',
                description: 'Customer ID and Package ID are required'
            });
            return res.status(400).json({
                message: "Customer ID and Package ID are required"
            });
        }

        const workshop = await Workshop.findOne({
            workshopId: workshopId,
            isDeleted: false
        });

        if (!workshop) {
            await logFailed({
                module: 'Workshop',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Add',
                heading: 'Add Customer Failed',
                description: 'Workshop not found'
            });
            return res.status(404).json({
                message: "Workshop not found"
            });
        }

        if (workshop.status !== 'active') {
            await logFailed({
                module: 'Workshop',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Add',
                heading: 'Add Customer Failed',
                description: 'Cannot add customers to inactive workshop'
            });
            return res.status(400).json({
                message: "Cannot add customers to inactive workshop"
            });
        }

        // Check if customer already exists
        const customerExists = workshop.customers.some(
            c => c.customerId === customerId
        );

        if (customerExists) {
            await logFailed({
                module: 'Workshop',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Add',
                heading: 'Add Customer Failed',
                description: 'Customer already exists in this workshop'
            });
            return res.status(400).json({
                message: "Customer already exists in this workshop"
            });
        }

        // Get customer details
        const customer = await Customer.findOne({ customerId: customerId });
        if (!customer) {
            await logFailed({
                module: 'Workshop',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Add',
                heading: 'Add Customer Failed',
                description: 'Customer not found'
            });
            return res.status(404).json({
                message: "Customer not found"
            });
        }

        // Get package details
        const packageData = await Package.findOne({ packageId: packageId });
        if (!packageData) {
            await logFailed({
                module: 'Workshop',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Add',
                heading: 'Add Customer Failed',
                description: 'Package not found'
            });
            return res.status(404).json({
                message: "Package not found"
            });
        }

        workshop.customers.push({
            customerId: customer.customerId,
            customerName: customer.customerName,
            email: customer.email || '',
            contactNumber: customer.contactNumber,
            packageId: packageData.packageId,
            packageName: packageData.packageName,
            packagePricing: packageData.pricing,
            packageOilCount: packageData.oilCount,
            packageDiscount: packageData.discount || 0,
            attended: true
        });

        await workshop.save();

        await logSuccess({
            module: 'Workshop',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Add',
            heading: 'Customer Added Successfully',
            description: `Customer ${customer.customerName} added to workshop on ${new Date(workshop.date).toLocaleDateString()} at ${workshop.startTime} with package ${packageData.packageName}`
        });

        res.status(200).json({
            message: "Customer added to workshop successfully",
            workshop: workshop.toObject()
        });

    } catch (error) {
        console.error("Error adding customer to workshop:", error);

        await logFailed({
            module: 'Workshop',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Add',
            heading: 'Add Customer Failed',
            description: error.message || 'Unknown error occurred'
        });

        res.status(500).json({
            message: "Failed to add customer to workshop",
            error: error.message
        });
    }
});

// ============================================
// REMOVE CUSTOMER FROM WORKSHOP (NO CHANGE NEEDED)
// ============================================
router.delete("/:workshopId/remove-customer/:customerId", auth, checkWorkshopPermission, async (req, res) => {
    try {
        const { workshopId, customerId } = req.params;

        const workshop = await Workshop.findOne({
            workshopId: workshopId,
            isDeleted: false
        });

        if (!workshop) {
            await logFailed({
                module: 'Workshop',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Remove',
                heading: 'Remove Customer Failed',
                description: 'Workshop not found'
            });
            return res.status(404).json({
                message: "Workshop not found"
            });
        }

        if (workshop.status !== 'active') {
            await logFailed({
                module: 'Workshop',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Remove',
                heading: 'Remove Customer Failed',
                description: 'Cannot remove customers from inactive workshop'
            });
            return res.status(400).json({
                message: "Cannot remove customers from inactive workshop"
            });
        }

        // Find customer to get name for log
        const customerToRemove = workshop.customers.find(
            c => c.customerId === customerId
        );

        const initialLength = workshop.customers.length;
        workshop.customers = workshop.customers.filter(
            c => c.customerId !== customerId
        );

        if (workshop.customers.length === initialLength) {
            await logFailed({
                module: 'Workshop',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Remove',
                heading: 'Remove Customer Failed',
                description: 'Customer not found in this workshop'
            });
            return res.status(404).json({
                message: "Customer not found in this workshop"
            });
        }

        await workshop.save();

        await logSuccess({
            module: 'Workshop',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Remove',
            heading: 'Customer Removed Successfully',
            description: `Customer ${customerToRemove?.customerName || 'Unknown'} removed from workshop on ${new Date(workshop.date).toLocaleDateString()} at ${workshop.startTime}`
        });

        res.status(200).json({
            message: "Customer removed from workshop successfully",
            workshop: workshop.toObject()
        });

    } catch (error) {
        console.error("Error removing customer from workshop:", error);

        await logFailed({
            module: 'Workshop',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Remove',
            heading: 'Remove Customer Failed',
            description: error.message || 'Unknown error occurred'
        });

        res.status(500).json({
            message: "Failed to remove customer from workshop",
            error: error.message
        });
    }
});

// ============================================
// DELETE WORKSHOP (NO CHANGE NEEDED)
// ============================================
router.delete("/delete/:workshopId", auth, checkWorkshopPermission, async (req, res) => {
    try {
        const { workshopId } = req.params;

        const workshop = await Workshop.findOne({
            workshopId: workshopId,
            isDeleted: false
        });

        if (!workshop) {
            await logFailed({
                module: 'Workshop',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Delete',
                heading: 'Workshop Deletion Failed',
                description: 'Workshop not found'
            });
            return res.status(404).json({
                message: "Workshop not found"
            });
        }

        const customerCount = workshop.customers?.length || 0;

        // Create deleted workshop entry
        const deletedWorkshop = new DeletedWorkshop({
            workshopId: workshop.workshopId,
            date: workshop.date,
            startTime: workshop.startTime,
            endTime: workshop.endTime,
            status: 'inactive',
            customers: workshop.customers || [],
            deletedBy: {
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email
            },
            originalCreatedAt: workshop.createdAt,
            originalUpdatedAt: workshop.updatedAt
        });

        await deletedWorkshop.save();

        // Delete the workshop from original collection
        await Workshop.findOneAndDelete({ workshopId: workshopId });

        await logSuccess({
            module: 'Workshop',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Delete',
            heading: 'Workshop Deleted Successfully',
            description: `Workshop on ${new Date(workshop.date).toLocaleDateString()} at ${workshop.startTime} permanently deleted. Had ${customerCount} customer(s).`
        });

        res.status(200).json({
            message: "Workshop deleted successfully",
            deletedWorkshop: deletedWorkshop.toObject()
        });

    } catch (error) {
        console.error("Error deleting workshop:", error);

        await logFailed({
            module: 'Workshop',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Delete',
            heading: 'Workshop Deletion Failed',
            description: error.message || 'Unknown error occurred'
        });

        res.status(500).json({
            message: "Failed to delete workshop",
            error: error.message
        });
    }
});

// ============================================
// UPDATE CUSTOMER ATTENDANCE (NO CHANGE NEEDED)
// ============================================
router.patch("/:workshopId/customer/:customerId/attendance", auth, checkWorkshopPermission, async (req, res) => {
    try {
        const { workshopId, customerId } = req.params;
        const { attended } = req.body;

        if (attended === undefined) {
            await logFailed({
                module: 'Workshop',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Patch',
                heading: 'Attendance Update Failed',
                description: 'Attended status is required'
            });
            return res.status(400).json({
                message: "Attended status is required"
            });
        }

        const workshop = await Workshop.findOne({
            workshopId: workshopId,
            isDeleted: false
        });

        if (!workshop) {
            await logFailed({
                module: 'Workshop',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Patch',
                heading: 'Attendance Update Failed',
                description: 'Workshop not found'
            });
            return res.status(404).json({
                message: "Workshop not found"
            });
        }

        const customerIndex = workshop.customers.findIndex(
            c => c.customerId === customerId
        );

        if (customerIndex === -1) {
            await logFailed({
                module: 'Workshop',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Patch',
                heading: 'Attendance Update Failed',
                description: 'Customer not found in this workshop'
            });
            return res.status(404).json({
                message: "Customer not found in this workshop"
            });
        }

        const customerName = workshop.customers[customerIndex].customerName;
        workshop.customers[customerIndex].attended = attended;
        await workshop.save();

        await logSuccess({
            module: 'Workshop',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Patch',
            heading: 'Attendance Updated Successfully',
            description: `Customer ${customerName} marked as ${attended ? 'Present' : 'Absent'} for workshop on ${new Date(workshop.date).toLocaleDateString()} at ${workshop.startTime}`
        });

        res.status(200).json({
            message: `Customer attendance updated to ${attended ? 'present' : 'absent'}`,
            workshop: workshop.toObject()
        });

    } catch (error) {
        console.error("Error updating attendance:", error);

        await logFailed({
            module: 'Workshop',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Patch',
            heading: 'Attendance Update Failed',
            description: error.message || 'Unknown error occurred'
        });

        res.status(500).json({
            message: "Failed to update attendance",
            error: error.message
        });
    }
});

// ============================================
// UPDATE CUSTOMER PACKAGE (NO CHANGE NEEDED)
// ============================================
router.patch("/:workshopId/customer/:customerId/package", auth, checkWorkshopPermission, async (req, res) => {
    try {
        const { workshopId, customerId } = req.params;
        const { packageId } = req.body;

        if (!packageId) {
            await logFailed({
                module: 'Workshop',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Patch',
                heading: 'Package Update Failed',
                description: 'Package ID is required'
            });
            return res.status(400).json({
                message: "Package ID is required"
            });
        }

        const workshop = await Workshop.findOne({
            workshopId: workshopId,
            isDeleted: false
        });

        if (!workshop) {
            await logFailed({
                module: 'Workshop',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Patch',
                heading: 'Package Update Failed',
                description: 'Workshop not found'
            });
            return res.status(404).json({
                message: "Workshop not found"
            });
        }

        const customerIndex = workshop.customers.findIndex(
            c => c.customerId === customerId
        );

        if (customerIndex === -1) {
            await logFailed({
                module: 'Workshop',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Patch',
                heading: 'Package Update Failed',
                description: 'Customer not found in this workshop'
            });
            return res.status(404).json({
                message: "Customer not found in this workshop"
            });
        }

        const customerName = workshop.customers[customerIndex].customerName;
        const oldPackageName = workshop.customers[customerIndex].packageName;

        const packageData = await Package.findOne({ packageId: packageId });
        if (!packageData) {
            await logFailed({
                module: 'Workshop',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Patch',
                heading: 'Package Update Failed',
                description: 'Package not found'
            });
            return res.status(404).json({
                message: "Package not found"
            });
        }

        workshop.customers[customerIndex].packageId = packageData.packageId;
        workshop.customers[customerIndex].packageName = packageData.packageName;
        workshop.customers[customerIndex].packagePricing = packageData.pricing;
        workshop.customers[customerIndex].packageOilCount = packageData.oilCount;
        workshop.customers[customerIndex].packageDiscount = packageData.discount || 0;

        await workshop.save();

        await logSuccess({
            module: 'Workshop',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Patch',
            heading: 'Package Updated Successfully',
            description: `Customer ${customerName}'s package changed from ${oldPackageName} to ${packageData.packageName} for workshop on ${new Date(workshop.date).toLocaleDateString()} at ${workshop.startTime}`
        });

        res.status(200).json({
            message: "Customer package updated successfully",
            workshop: workshop.toObject()
        });

    } catch (error) {
        console.error("Error updating customer package:", error);

        await logFailed({
            module: 'Workshop',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Patch',
            heading: 'Package Update Failed',
            description: error.message || 'Unknown error occurred'
        });

        res.status(500).json({
            message: "Failed to update customer package",
            error: error.message
        });
    }
});

module.exports = router;
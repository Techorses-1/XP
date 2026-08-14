const express = require("express");
const router = express.Router();
const Customer = require("../models/customer");
const Invoice = require("../models/invoice");
const User = require("../models/user"); // ✅ ADD THIS
const jwt = require("jsonwebtoken"); // ✅ ADD THIS
const { logSuccess, logFailed } = require("../utils/logHelper");

// ============================================
// AUTH MIDDLEWARE (COPY FROM WORKSHOP ROUTES)
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
// CHECK CUSTOMER PERMISSION
// ============================================
const checkCustomerPermission = (req, res, next) => {
  const permissions = req.user.permissions || [];

  if (permissions.includes('admin') || permissions.includes('customer')) {
    next();
  } else {
    return res.status(403).json({
      message: 'Access denied. Customer permission required.'
    });
  }
};

// ============================================
// POST create-customer - Create new customer
// ============================================
router.post("/create-customer", auth, checkCustomerPermission, async (req, res) => {
  try {
    const { email, contactNumber } = req.body;

    // Check for existing customer by email if provided
    if (email) {
      const existingCustomer = await Customer.findOne({ email });
      if (existingCustomer) {
        await logFailed({
          module: 'Customers',
          userId: req.user.userId, // ✅ USE ACTUAL USER
          userName: req.user.name, // ✅ USE ACTUAL USER
          userEmail: req.user.email, // ✅ USE ACTUAL USER
          action: 'Create',
          heading: 'Customer Creation Failed',
          description: `Customer with email ${email} already exists`
        });
        return res.status(400).json({
          success: false,
          message: "Customer with this email already exists",
          field: "email"
        });
      }
    }

    // Check for existing customer by phone number
    if (contactNumber) {
      const existingCustomerByPhone = await Customer.findOne({ contactNumber });
      if (existingCustomerByPhone) {
        await logFailed({
          module: 'Customers',
          userId: req.user.userId,
          userName: req.user.name,
          userEmail: req.user.email,
          action: 'Create',
          heading: 'Customer Creation Failed',
          description: `Customer with phone ${contactNumber} already exists`
        });
        return res.status(400).json({
          success: false,
          message: "Customer with this phone number already exists",
          field: "contactNumber"
        });
      }
    }

    // Create new customer
    const customer = new Customer(req.body);
    const savedCustomer = await customer.save();

    // Convert to plain object
    const response = savedCustomer.toObject();

    await logSuccess({
      module: 'Customers',
      userId: req.user.userId,
      userName: req.user.name,
      userEmail: req.user.email,
      action: 'Create',
      heading: 'Customer Created Successfully',
      description: `Customer "${response.customerName}" (${response.contactNumber}) created successfully`
    });

    res.status(201).json({
      success: true,
      message: "Customer created successfully.",
      data: response
    });

  } catch (error) {
    console.error("Error creating customer:", error);

    await logFailed({
      module: 'Customers',
      userId: req.user?.userId || 'Unknown',
      userName: req.user?.name || 'Unknown',
      userEmail: req.user?.email || 'Unknown',
      action: 'Create',
      heading: 'Customer Creation Failed',
      description: error.message || 'Unknown error occurred'
    });

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create customer",
      error: error.message
    });
  }
});

// ============================================
// GET ALL CUSTOMERS - READ ONLY (NO PERMISSION NEEDED FOR VIEW)
// ============================================
router.get("/get-customers", auth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build search query
    let query = {};
    if (search && search.trim() !== '') {
      const searchTerm = search.trim();
      query = {
        $or: [
          { customerName: { $regex: searchTerm, $options: 'i' } },
          { email: { $regex: searchTerm, $options: 'i' } },
          { contactNumber: { $regex: searchTerm, $options: 'i' } }
        ]
      };
    }

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Get total count for pagination
    const total = await Customer.countDocuments(query);

    // Get paginated results with lean()
    const customers = await Customer.find(query)
      .sort(sortObj)
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .select('-__v')
      .lean();

    const totalPages = Math.ceil(total / parseInt(limit));

    res.status(200).json({
      success: true,
      data: customers,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      },
      filters: {
        search: search || null,
        sortBy,
        sortOrder
      }
    });

  } catch (error) {
    console.error("Error fetching customers:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch customers",
      error: error.message
    });
  }
});

// ============================================
// PUT update-customer/:id - Update customer
// ============================================
router.put("/update-customer/:id", auth, checkCustomerPermission, async (req, res) => {
  try {
    const { customerId, _id, createdAt, updatedAt, ...updateData } = req.body;

    // Get the existing customer to check old phone number
    const existingCustomer = await Customer.findOne({ customerId: req.params.id });

    if (!existingCustomer) {
      await logFailed({
        module: 'Customers',
        userId: req.user.userId,
        userName: req.user.name,
        userEmail: req.user.email,
        action: 'Update',
        heading: 'Customer Update Failed',
        description: `Customer with ID ${req.params.id} not found`
      });
      return res.status(404).json({
        success: false,
        message: "Customer not found"
      });
    }

    // Store old data for logging
    const oldName = existingCustomer.customerName;
    const oldPhone = existingCustomer.contactNumber;
    const oldEmail = existingCustomer.email || 'N/A';

    // If phone number is being updated
    if (updateData.contactNumber && updateData.contactNumber !== existingCustomer.contactNumber) {
      const newPhoneNumber = updateData.contactNumber;

      // Validate phone number format (exactly 10 digits)
      if (!/^[0-9]{10}$/.test(newPhoneNumber)) {
        await logFailed({
          module: 'Customers',
          userId: req.user.userId,
          userName: req.user.name,
          userEmail: req.user.email,
          action: 'Update',
          heading: 'Customer Update Failed',
          description: `Invalid phone number format: ${newPhoneNumber}`
        });
        return res.status(400).json({
          success: false,
          message: "Phone number must be exactly 10 digits"
        });
      }

      // Check if new phone number already exists in Customer collection (other than this customer)
      const existingCustomerWithNewPhone = await Customer.findOne({
        contactNumber: newPhoneNumber,
        customerId: { $ne: req.params.id }
      });

      if (existingCustomerWithNewPhone) {
        await logFailed({
          module: 'Customers',
          userId: req.user.userId,
          userName: req.user.name,
          userEmail: req.user.email,
          action: 'Update',
          heading: 'Customer Update Failed',
          description: `Phone number ${newPhoneNumber} already exists for another customer`
        });
        return res.status(400).json({
          success: false,
          message: "Customer with this phone number already exists"
        });
      }
    }

    // Update the customer
    const updatedCustomer = await Customer.findOneAndUpdate(
      { customerId: req.params.id },
      updateData,
      {
        new: true,
        runValidators: true
      }
    );

    const response = updatedCustomer.toObject();

    // Build description
    let descriptionParts = [];
    if (updateData.customerName && updateData.customerName !== oldName) {
      descriptionParts.push(`Name: ${oldName} → ${updateData.customerName}`);
    }
    if (updateData.contactNumber && updateData.contactNumber !== oldPhone) {
      descriptionParts.push(`Phone: ${oldPhone} → ${updateData.contactNumber}`);
    }
    if (updateData.email && updateData.email !== oldEmail) {
      descriptionParts.push(`Email: ${oldEmail} → ${updateData.email}`);
    }

    const description = descriptionParts.length > 0
      ? `Customer updated: ${descriptionParts.join(', ')}`
      : `Customer "${response.customerName}" updated`;

    await logSuccess({
      module: 'Customers',
      userId: req.user.userId,
      userName: req.user.name,
      userEmail: req.user.email,
      action: 'Update',
      heading: 'Customer Updated Successfully',
      description: description
    });

    res.status(200).json({
      success: true,
      message: "Customer updated successfully.",
      data: response
    });

  } catch (error) {
    console.error("Error updating customer:", error);

    await logFailed({
      module: 'Customers',
      userId: req.user?.userId || 'Unknown',
      userName: req.user?.name || 'Unknown',
      userEmail: req.user?.email || 'Unknown',
      action: 'Update',
      heading: 'Customer Update Failed',
      description: error.message || 'Unknown error occurred'
    });

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to update customer",
      error: error.message
    });
  }
});

// ============================================
// DELETE delete-customer/:id - Delete customer
// ============================================
router.delete("/delete-customer/:id", auth, checkCustomerPermission, async (req, res) => {
  try {
    // Find customer first for logging
    const customerToDelete = await Customer.findOne({
      customerId: req.params.id
    });

    if (!customerToDelete) {
      await logFailed({
        module: 'Customers',
        userId: req.user.userId,
        userName: req.user.name,
        userEmail: req.user.email,
        action: 'Delete',
        heading: 'Customer Deletion Failed',
        description: `Customer with ID ${req.params.id} not found`
      });
      return res.status(404).json({
        success: false,
        message: "Customer not found"
      });
    }

    const deletedCustomer = await Customer.findOneAndDelete({
      customerId: req.params.id
    });

    await logSuccess({
      module: 'Customers',
      userId: req.user.userId,
      userName: req.user.name,
      userEmail: req.user.email,
      action: 'Delete',
      heading: 'Customer Deleted Successfully',
      description: `Customer "${customerToDelete.customerName}" (${customerToDelete.contactNumber}) deleted`
    });

    res.status(200).json({
      success: true,
      message: "Customer deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting customer:", error);

    await logFailed({
      module: 'Customers',
      userId: req.user?.userId || 'Unknown',
      userName: req.user?.name || 'Unknown',
      userEmail: req.user?.email || 'Unknown',
      action: 'Delete',
      heading: 'Customer Deletion Failed',
      description: error.message || 'Unknown error occurred'
    });

    res.status(500).json({
      success: false,
      message: "Failed to delete customer",
      error: error.message
    });
  }
});

// ============================================
// GET customer by ID - READ ONLY
// ============================================
router.get("/get-customer/:id", auth, async (req, res) => {
  try {
    const customer = await Customer.findOne({ customerId: req.params.id });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found"
      });
    }

    res.status(200).json(customer.toObject());
  } catch (error) {
    console.error("Error fetching customer:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch customer",
      error: error.message
    });
  }
});

// ============================================
// POST bulk-create-customers - Create multiple customers
// ============================================
router.post("/bulk-create-customers", auth, checkCustomerPermission, async (req, res) => {
  try {
    const { customers } = req.body;

    if (!customers || !Array.isArray(customers) || customers.length === 0) {
      await logFailed({
        module: 'Customers',
        userId: req.user.userId,
        userName: req.user.name,
        userEmail: req.user.email,
        action: 'Bulk Upload',
        heading: 'Bulk Customer Upload Failed',
        description: 'No customer data provided'
      });
      return res.status(400).json({
        success: false,
        message: "No customer data provided"
      });
    }

    const results = {
      successful: [],
      failed: []
    };

    // Process each customer
    for (const customerData of customers) {
      try {
        const { email, contactNumber, customerName } = customerData;

        // Validate required fields
        if (!customerName || !contactNumber) {
          results.failed.push({
            customer: customerData,
            error: "Customer name and mobile number are required"
          });
          continue;
        }

        // Validate mobile number format (exactly 10 digits)
        if (!/^[0-9]{10}$/.test(contactNumber)) {
          results.failed.push({
            customer: customerData,
            error: "Mobile number must be exactly 10 digits"
          });
          continue;
        }

        // Validate email format if provided
        if (email && !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email)) {
          results.failed.push({
            customer: customerData,
            error: "Invalid email format"
          });
          continue;
        }

        // Check for existing customer by email (if email provided)
        if (email) {
          const existingCustomer = await Customer.findOne({ email });
          if (existingCustomer) {
            results.failed.push({
              customer: customerData,
              error: "Customer with this email already exists"
            });
            continue;
          }
        }

        // Check for existing customer by mobile number
        const existingByMobile = await Customer.findOne({ contactNumber });
        if (existingByMobile) {
          results.failed.push({
            customer: customerData,
            error: "Customer with this mobile number already exists"
          });
          continue;
        }

        // Create new customer
        const customer = new Customer(customerData);
        const savedCustomer = await customer.save();

        results.successful.push(savedCustomer.toObject());

      } catch (error) {
        results.failed.push({
          customer: customerData,
          error: error.message
        });
      }
    }

    await logSuccess({
      module: 'Customers',
      userId: req.user.userId,
      userName: req.user.name,
      userEmail: req.user.email,
      action: 'Bulk Upload',
      heading: 'Bulk Customer Upload Completed',
      description: `${results.successful.length} customers created successfully, ${results.failed.length} failed`
    });

    if (results.failed.length > 0) {
      await logFailed({
        module: 'Customers',
        userId: req.user.userId,
        userName: req.user.name,
        userEmail: req.user.email,
        action: 'Bulk Upload',
        heading: 'Bulk Customer Upload Partial Failure',
        description: `${results.failed.length} customers failed out of ${customers.length}`
      });
    }

    res.status(200).json({
      success: true,
      message: `Bulk import completed: ${results.successful.length} successful, ${results.failed.length} failed`,
      results
    });

  } catch (error) {
    console.error("Error in bulk customer creation:", error);

    await logFailed({
      module: 'Customers',
      userId: req.user?.userId || 'Unknown',
      userName: req.user?.name || 'Unknown',
      userEmail: req.user?.email || 'Unknown',
      action: 'Bulk Upload',
      heading: 'Bulk Customer Upload Failed',
      description: error.message || 'Unknown error occurred'
    });

    res.status(500).json({
      success: false,
      message: "Failed to process bulk customer import",
      error: error.message
    });
  }
});

// ============================================
// Update customer loyalty coins
// ============================================
router.put("/update-loyalty-coins/:customerId", auth, checkCustomerPermission, async (req, res) => {
  try {
    const { customerId } = req.params;
    const { coinsEarned, coinsUsed } = req.body;

    const customer = await Customer.findOne({ customerId });

    if (!customer) {
      await logFailed({
        module: 'Customers',
        userId: req.user.userId,
        userName: req.user.name,
        userEmail: req.user.email,
        action: 'Update',
        heading: 'Loyalty Coins Update Failed',
        description: `Customer with ID ${customerId} not found`
      });
      return res.status(404).json({
        success: false,
        message: "Customer not found"
      });
    }

    let currentCoins = customer.loyaltyCoins || 0;
    const previousBalance = currentCoins;

    // Step 1: First DEDUCT used coins (if any)
    if (coinsUsed && coinsUsed > 0) {
      currentCoins = Math.max(0, currentCoins - coinsUsed);
    }

    // Step 2: Then ADD earned coins (if any)
    if (coinsEarned && coinsEarned > 0) {
      currentCoins = currentCoins + coinsEarned;
    }

    customer.loyaltyCoins = currentCoins;
    await customer.save();

    await logSuccess({
      module: 'Customers',
      userId: req.user.userId,
      userName: req.user.name,
      userEmail: req.user.email,
      action: 'Update',
      heading: 'Loyalty Coins Updated Successfully',
      description: `Customer "${customer.customerName}": ${previousBalance} → ${currentCoins} coins (Earned: ${coinsEarned || 0}, Used: ${coinsUsed || 0})`
    });

    res.status(200).json({
      success: true,
      message: "Loyalty coins updated successfully",
      data: {
        customerId: customer.customerId,
        loyaltyCoins: customer.loyaltyCoins,
        coinsEarned: coinsEarned || 0,
        coinsUsed: coinsUsed || 0,
        previousBalance: previousBalance
      }
    });

  } catch (error) {
    console.error("Error updating loyalty coins:", error);

    await logFailed({
      module: 'Customers',
      userId: req.user?.userId || 'Unknown',
      userName: req.user?.name || 'Unknown',
      userEmail: req.user?.email || 'Unknown',
      action: 'Update',
      heading: 'Loyalty Coins Update Failed',
      description: error.message || 'Unknown error occurred'
    });

    res.status(500).json({
      success: false,
      message: "Failed to update loyalty coins",
      error: error.message
    });
  }
});

// ============================================
// GET all invoices for a customer - READ ONLY
// ============================================
router.get("/:customerId/invoices", auth, async (req, res) => {
  try {
    const { customerId } = req.params;
    const {
      page = 1,
      limit = 20,
      status = 'Active'
    } = req.query;

    // Validate customer exists
    const customer = await Customer.findOne({ customerId });
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found"
      });
    }

    // Calculate skip for pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build query
    const query = {
      'customer.customerId': customerId,
      status: status
    };

    // Get invoices with pagination - OPTIMIZED
    const [invoices, total] = await Promise.all([
      Invoice.find(query)
        .select('invoiceId invoiceNumber invoiceDate grandTotal paymentStatus status createdAt')
        .sort({ invoiceDate: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Invoice.countDocuments(query)
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));

    // Get summary stats
    const summary = await Invoice.aggregate([
      {
        $match: {
          'customer.customerId': customerId,
          status: 'Active'
        }
      },
      {
        $group: {
          _id: null,
          totalInvoices: { $sum: 1 },
          totalSpent: { $sum: '$grandTotal' },
          averageSpent: { $avg: '$grandTotal' }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        customer: {
          customerId: customer.customerId,
          customerName: customer.customerName,
          email: customer.email,
          contactNumber: customer.contactNumber,
          loyaltyCoins: customer.loyaltyCoins || 0
        },
        invoices: invoices,
        summary: summary[0] || {
          totalInvoices: 0,
          totalSpent: 0,
          averageSpent: 0
        },
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error("Error fetching customer invoices:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch customer invoices",
      error: error.message
    });
  }
});

module.exports = router;
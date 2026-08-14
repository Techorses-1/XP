const express = require("express");
const router = express.Router();
const PromoCode = require("../models/promoCode");
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
// ✅ ADD THIS: CHECK PROMO PERMISSION
// ============================================
const checkPromoPermission = (req, res, next) => {
  const permissions = req.user.permissions || [];

  if (permissions.includes('admin') || permissions.includes('promo')) {
    next();
  } else {
    return res.status(403).json({
      message: 'Access denied. Promo permission required.'
    });
  }
};

// ============================================
// CREATE PROMO CODE
// ============================================
router.post("/create-promo", auth, checkPromoPermission, async (req, res) => {
  try {
    const { code, discount, startDate, endDate } = req.body;

    // Validate required fields
    if (!code || !discount || !startDate || !endDate) {
      await logFailed({
        module: 'Discount',
        userId: req.user.userId,
        userName: req.user.name,
        userEmail: req.user.email,
        action: 'Create',
        heading: 'Promo Code Creation Failed',
        description: 'Missing required fields: code, discount, startDate, endDate'
      });
      return res.status(400).json({
        message: "Code, discount, start date and end date are required"
      });
    }

    // Validate discount range
    const discountValue = Number(discount);
    if (isNaN(discountValue) || discountValue < 1 || discountValue > 100) {
      await logFailed({
        module: 'Discount',
        userId: req.user.userId,
        userName: req.user.name,
        userEmail: req.user.email,
        action: 'Create',
        heading: 'Promo Code Creation Failed',
        description: `Invalid discount value: ${discount}. Must be between 1 and 100`
      });
      return res.status(400).json({
        message: "Discount must be a number between 1 and 100"
      });
    }

    let start = new Date(startDate);
    let end = new Date(endDate);
    const now = new Date();

    // Allow same day promos (start date can be equal to end date)
    if (start > end) {
      await logFailed({
        module: 'Discount',
        userId: req.user.userId,
        userName: req.user.name,
        userEmail: req.user.email,
        action: 'Create',
        heading: 'Promo Code Creation Failed',
        description: `End date ${endDate} cannot be before start date ${startDate}`
      });
      return res.status(400).json({
        message: "End date cannot be before start date"
      });
    }

    // FOR ALL END DATES: Set to 23:59:59 of the selected end date
    end.setHours(23, 59, 59, 999);

    // Compare dates without time for validation
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endDateOnly = new Date(end);
    endDateOnly.setHours(0, 0, 0, 0);

    // Allow today's date and future dates
    if (endDateOnly < today) {
      await logFailed({
        module: 'Discount',
        userId: req.user.userId,
        userName: req.user.name,
        userEmail: req.user.email,
        action: 'Create',
        heading: 'Promo Code Creation Failed',
        description: `End date ${endDate} is in the past`
      });
      return res.status(400).json({
        message: "End date cannot be in the past"
      });
    }

    // Check if code already exists
    const existingCode = await PromoCode.findOne({ code: code.toUpperCase() });
    if (existingCode) {
      await logFailed({
        module: 'Discount',
        userId: req.user.userId,
        userName: req.user.name,
        userEmail: req.user.email,
        action: 'Create',
        heading: 'Promo Code Creation Failed',
        description: `Promo code "${code.toUpperCase()}" already exists`
      });
      return res.status(400).json({
        message: "Promo code already exists"
      });
    }

    // Create promo code
    const promoCode = new PromoCode({
      code: code.toUpperCase(),
      discount: discountValue,
      startDate: start,
      endDate: end
    });

    const savedPromo = await promoCode.save();

    await logSuccess({
      module: 'Discount',
      userId: req.user.userId,
      userName: req.user.name,
      userEmail: req.user.email,
      action: 'Create',
      heading: 'Promo Code Created Successfully',
      description: `Promo code "${savedPromo.code}" created with ${savedPromo.discount}% discount, valid from ${new Date(savedPromo.startDate).toLocaleDateString()} to ${new Date(savedPromo.endDate).toLocaleDateString()}`
    });

    res.status(201).json({
      message: "Promo code created successfully",
      promoCode: savedPromo.toObject()
    });
  } catch (error) {
    console.error("Error creating promo code:", error);

    await logFailed({
      module: 'Discount',
      userId: req.user?.userId || 'Unknown',
      userName: req.user?.name || 'Unknown',
      userEmail: req.user?.email || 'Unknown',
      action: 'Create',
      heading: 'Promo Code Creation Failed',
      description: error.message || 'Unknown error occurred'
    });

    res.status(500).json({
      message: "Failed to create promo code",
      error: error.message
    });
  }
});

// ============================================
// GET ALL PROMO CODES (ADMIN ONLY - PROTECTED)
// ============================================
router.get("/get-promos", auth, checkPromoPermission, async (req, res) => {
  try {
    // Update expired promos before fetching
    await PromoCode.updateExpiredPromos();

    const promoCodes = await PromoCode.find({}).sort({ createdAt: -1 });
    const plainPromos = promoCodes.map(promo => promo.toObject());
    res.status(200).json(plainPromos);
  } catch (error) {
    console.error("Error fetching promo codes:", error);
    res.status(500).json({
      message: "Failed to fetch promo codes",
      error: error.message
    });
  }
});

// ============================================
// GET ACTIVE PROMO CODES (PUBLIC - For checkout/validation)
// ============================================
router.get("/get-active-promos", async (req, res) => {
  try {
    // Update expired promos before fetching
    await PromoCode.updateExpiredPromos();

    const activePromos = await PromoCode.find({
      isActive: true,
      isExpired: false,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    }).sort({ discount: -1 });

    const plainPromos = activePromos.map(promo => promo.toObject());
    res.status(200).json(plainPromos);
  } catch (error) {
    console.error("Error fetching active promo codes:", error);
    res.status(500).json({
      message: "Failed to fetch active promo codes",
      error: error.message
    });
  }
});

// ============================================
// VALIDATE PROMO CODE (PUBLIC - For checkout)
// ============================================
router.get("/validate-promo/:code", async (req, res) => {
  try {
    const { code } = req.params;

    if (!code) {
      return res.status(400).json({
        isValid: false,
        message: "Promo code is required"
      });
    }

    // Update expired promos before validation
    await PromoCode.updateExpiredPromos();

    // First check if code exists at all
    const promoCode = await PromoCode.findOne({
      code: code.toUpperCase()
    });

    if (!promoCode) {
      return res.status(200).json({
        isValid: false,
        message: "Invalid promo code. Please check the spelling."
      });
    }

    // Check if code is active
    if (!promoCode.isActive) {
      return res.status(200).json({
        isValid: false,
        message: "This promo code is currently inactive."
      });
    }

    // Check if code is expired
    if (promoCode.isExpired) {
      return res.status(200).json({
        isValid: false,
        message: "This promo code has expired."
      });
    }

    // Check date validity
    const now = new Date();
    if (promoCode.startDate > now) {
      return res.status(200).json({
        isValid: false,
        message: "This promo code is not yet active."
      });
    }

    if (promoCode.endDate < now) {
      return res.status(200).json({
        isValid: false,
        message: "This promo code has expired."
      });
    }

    // If all checks pass
    res.status(200).json({
      isValid: true,
      promoCode: {
        code: promoCode.code,
        discount: promoCode.discount,
        promoId: promoCode.promoId,
        startDate: promoCode.startDate,
        endDate: promoCode.endDate
      }
    });
  } catch (error) {
    console.error("Error validating promo code:", error);
    res.status(500).json({
      isValid: false,
      message: "Failed to validate promo code"
    });
  }
});

// ============================================
// UPDATE PROMO CODE
// ============================================
router.put("/update-promo/:promoId", auth, checkPromoPermission, async (req, res) => {
  try {
    const { promoId } = req.params;
    const { code, discount, startDate, endDate, isActive } = req.body;

    // Check if promo exists
    const existingPromo = await PromoCode.findOne({ promoId: promoId });
    if (!existingPromo) {
      await logFailed({
        module: 'Discount',
        userId: req.user.userId,
        userName: req.user.name,
        userEmail: req.user.email,
        action: 'Update',
        heading: 'Promo Code Update Failed',
        description: `Promo code with ID ${promoId} not found`
      });
      return res.status(404).json({
        message: "Promo code not found"
      });
    }

    // Store old values for logging
    const oldCode = existingPromo.code;
    const oldDiscount = existingPromo.discount;
    const oldStartDate = existingPromo.startDate;
    const oldEndDate = existingPromo.endDate;
    const oldStatus = existingPromo.isActive;

    // Validate discount if provided
    if (discount !== undefined) {
      const discountValue = Number(discount);
      if (isNaN(discountValue) || discountValue < 1 || discountValue > 100) {
        await logFailed({
          module: 'Discount',
          userId: req.user.userId,
          userName: req.user.name,
          userEmail: req.user.email,
          action: 'Update',
          heading: 'Promo Code Update Failed',
          description: `Invalid discount value: ${discount}. Must be between 1 and 100`
        });
        return res.status(400).json({
          message: "Discount must be a number between 1 and 100"
        });
      }
    }

    // Validate dates if provided
    if (startDate && endDate) {
      let start = new Date(startDate);
      let end = new Date(endDate);
      const now = new Date();

      // Allow same day promos (start date can be equal to end date)
      if (start > end) {
        await logFailed({
          module: 'Discount',
          userId: req.user.userId,
          userName: req.user.name,
          userEmail: req.user.email,
          action: 'Update',
          heading: 'Promo Code Update Failed',
          description: `End date ${endDate} cannot be before start date ${startDate}`
        });
        return res.status(400).json({
          message: "End date cannot be before start date"
        });
      }

      // FOR ALL END DATES: Set to 23:59:59 of the selected end date
      end.setHours(23, 59, 59, 999);

      // Compare dates without time for validation
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const endDateOnly = new Date(end);
      endDateOnly.setHours(0, 0, 0, 0);

      // Allow today's date and future dates
      if (endDateOnly < today) {
        await logFailed({
          module: 'Discount',
          userId: req.user.userId,
          userName: req.user.name,
          userEmail: req.user.email,
          action: 'Update',
          heading: 'Promo Code Update Failed',
          description: `End date ${endDate} is in the past`
        });
        return res.status(400).json({
          message: "End date cannot be in the past"
        });
      }
    }

    const updateData = {};
    if (code) updateData.code = code.toUpperCase();
    if (discount !== undefined) updateData.discount = Number(discount);
    if (startDate) {
      let start = new Date(startDate);
      updateData.startDate = start;
    }
    if (endDate) {
      let end = new Date(endDate);
      // FOR ALL END DATES: Set to 23:59:59
      end.setHours(23, 59, 59, 999);
      updateData.endDate = end;
    }
    if (isActive !== undefined) updateData.isActive = isActive;

    // Check for duplicate code (excluding current promo)
    if (code) {
      const existingCode = await PromoCode.findOne({
        code: code.toUpperCase(),
        promoId: { $ne: promoId }
      });
      if (existingCode) {
        await logFailed({
          module: 'Discount',
          userId: req.user.userId,
          userName: req.user.name,
          userEmail: req.user.email,
          action: 'Update',
          heading: 'Promo Code Update Failed',
          description: `Promo code "${code.toUpperCase()}" already exists`
        });
        return res.status(400).json({
          message: "Promo code already exists"
        });
      }
    }

    const updatedPromo = await PromoCode.findOneAndUpdate(
      { promoId: promoId },
      updateData,
      { new: true, runValidators: true }
    );

    // Build description
    let descriptionParts = [];
    if (code && code.toUpperCase() !== oldCode) descriptionParts.push(`Code: ${oldCode} → ${code.toUpperCase()}`);
    if (discount !== undefined && discount !== oldDiscount) descriptionParts.push(`Discount: ${oldDiscount}% → ${discount}%`);
    if (startDate) {
      const newStart = new Date(startDate);
      descriptionParts.push(`Start Date: ${new Date(oldStartDate).toLocaleDateString()} → ${newStart.toLocaleDateString()}`);
    }
    if (endDate) {
      const newEnd = new Date(endDate);
      descriptionParts.push(`End Date: ${new Date(oldEndDate).toLocaleDateString()} → ${newEnd.toLocaleDateString()}`);
    }
    if (isActive !== undefined && isActive !== oldStatus) {
      descriptionParts.push(`Status: ${oldStatus ? 'Active' : 'Inactive'} → ${isActive ? 'Active' : 'Inactive'}`);
    }

    const description = descriptionParts.length > 0
      ? `Promo code "${updatedPromo.code}" updated: ${descriptionParts.join(', ')}`
      : `Promo code "${updatedPromo.code}" updated`;

    await logSuccess({
      module: 'Discount',
      userId: req.user.userId,
      userName: req.user.name,
      userEmail: req.user.email,
      action: 'Update',
      heading: 'Promo Code Updated Successfully',
      description: description
    });

    res.status(200).json({
      message: "Promo code updated successfully",
      promoCode: updatedPromo.toObject()
    });
  } catch (error) {
    console.error("Error updating promo code:", error);

    await logFailed({
      module: 'Discount',
      userId: req.user?.userId || 'Unknown',
      userName: req.user?.name || 'Unknown',
      userEmail: req.user?.email || 'Unknown',
      action: 'Update',
      heading: 'Promo Code Update Failed',
      description: error.message || 'Unknown error occurred'
    });

    res.status(500).json({
      message: "Failed to update promo code",
      error: error.message
    });
  }
});

// ============================================
// DELETE PROMO CODE
// ============================================
router.delete("/delete-promo/:promoId", auth, checkPromoPermission, async (req, res) => {
  try {
    const { promoId } = req.params;

    // Find promo first for logging
    const promoToDelete = await PromoCode.findOne({ promoId: promoId });

    if (!promoToDelete) {
      await logFailed({
        module: 'Discount',
        userId: req.user.userId,
        userName: req.user.name,
        userEmail: req.user.email,
        action: 'Delete',
        heading: 'Promo Code Deletion Failed',
        description: `Promo code with ID ${promoId} not found`
      });
      return res.status(404).json({
        message: "Promo code not found"
      });
    }

    const deletedPromo = await PromoCode.findOneAndDelete({ promoId: promoId });

    await logSuccess({
      module: 'Discount',
      userId: req.user.userId,
      userName: req.user.name,
      userEmail: req.user.email,
      action: 'Delete',
      heading: 'Promo Code Deleted Successfully',
      description: `Promo code "${promoToDelete.code}" (${promoToDelete.discount}% discount) deleted`
    });

    res.status(200).json({
      message: "Promo code deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting promo code:", error);

    await logFailed({
      module: 'Discount',
      userId: req.user?.userId || 'Unknown',
      userName: req.user?.name || 'Unknown',
      userEmail: req.user?.email || 'Unknown',
      action: 'Delete',
      heading: 'Promo Code Deletion Failed',
      description: error.message || 'Unknown error occurred'
    });

    res.status(500).json({
      message: "Failed to delete promo code",
      error: error.message
    });
  }
});

module.exports = router;
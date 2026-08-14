const express = require("express");
const router = express.Router();
const Package = require("../models/package");
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
// CHECK PACKAGES PERMISSION
// ============================================
const checkPackagePermission = (req, res, next) => {
    const permissions = req.user.permissions || [];

    if (permissions.includes('admin') || permissions.includes('packages')) {
        next();
    } else {
        return res.status(403).json({
            message: 'Access denied. Packages permission required.'
        });
    }
};

// ============================================
// HELPER: Calculate fragrance and alcohol
// ============================================
const calculateRatios = (fillingLevel, fragranceQty, alcoholQty) => {
    let fragrance = fragranceQty;
    let alcohol = alcoholQty;

    // If fragrance and alcohol are provided (user edited), use them
    if (fragranceQty !== undefined && alcoholQty !== undefined) {
        return { fragrance: fragranceQty, alcohol: alcoholQty };
    }

    // Otherwise auto-calculate
    if (fillingLevel > 0) {
        fragrance = parseFloat((fillingLevel * 0.30).toFixed(2));
        alcohol = parseFloat((fillingLevel * 0.70).toFixed(2));
    }

    return { fragrance, alcohol };
};

// ============================================
// CREATE PACKAGE
// ============================================
router.post("/create", auth, checkPackagePermission, async (req, res) => {
    try {
        const {
            packageName,
            pricing,
            oilCount,
            discount,
            bottleML,
            fillingLevel,
            fragranceQty,
            alcoholQty
        } = req.body;

        // ✅ Validate required fields (oilCount is now OPTIONAL)
        if (!packageName || !pricing || !bottleML || !fillingLevel) {
            await logFailed({
                module: 'Packages',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Create',
                heading: 'Package Creation Failed',
                description: 'Missing required fields: packageName, pricing, bottleML, fillingLevel'
            });
            return res.status(400).json({
                message: "Package name, pricing, bottle ML, and filling level are required"
            });
        }

        // Validate pricing
        if (pricing < 1) {
            await logFailed({
                module: 'Packages',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Create',
                heading: 'Package Creation Failed',
                description: `Pricing must be at least 1, received: ${pricing}`
            });
            return res.status(400).json({
                message: "Pricing must be at least 1"
            });
        }

        // ✅ Set default oilCount to 1 if not provided
        const oilCountValue = oilCount !== undefined ? Number(oilCount) : 1;

        // ✅ Validate oil count if provided
        if (oilCount !== undefined) {
            if (oilCount < 1 || oilCount > 25) {
                await logFailed({
                    module: 'Packages',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Create',
                    heading: 'Package Creation Failed',
                    description: `Oil count must be between 1 and 25, received: ${oilCount}`
                });
                return res.status(400).json({
                    message: "Oil count must be between 1 and 25"
                });
            }
        }

        // Validate discount
        if (discount !== undefined) {
            if (discount < 0 || discount > 100) {
                await logFailed({
                    module: 'Packages',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Create',
                    heading: 'Package Creation Failed',
                    description: `Discount must be between 0 and 100, received: ${discount}`
                });
                return res.status(400).json({
                    message: "Discount must be between 0 and 100"
                });
            }
        }

        // Validate bottle ML
        if (![30, 60, 125].includes(Number(bottleML))) {
            await logFailed({
                module: 'Packages',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Create',
                heading: 'Package Creation Failed',
                description: `Bottle ML must be 30, 60, or 125, received: ${bottleML}`
            });
            return res.status(400).json({
                message: "Bottle ML must be 30, 60, or 125"
            });
        }

        // Validate filling level
        if (fillingLevel < 1 || fillingLevel > Number(bottleML)) {
            await logFailed({
                module: 'Packages',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Create',
                heading: 'Package Creation Failed',
                description: `Filling level must be between 1 and ${bottleML}, received: ${fillingLevel}`
            });
            return res.status(400).json({
                message: `Filling level must be between 1 and ${bottleML}`
            });
        }

        // Check if package name already exists
        const existingPackage = await Package.findOne({
            packageName: packageName.trim()
        });

        if (existingPackage) {
            await logFailed({
                module: 'Packages',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Create',
                heading: 'Package Creation Failed',
                description: `Package name "${packageName.trim()}" already exists`
            });
            return res.status(400).json({
                message: "Package name already exists",
                field: "packageName"
            });
        }

        // Calculate fragrance and alcohol
        const { fragrance, alcohol } = calculateRatios(
            Number(fillingLevel),
            fragranceQty !== undefined ? Number(fragranceQty) : undefined,
            alcoholQty !== undefined ? Number(alcoholQty) : undefined
        );

        // Create package
        const newPackage = new Package({
            packageName: packageName.trim(),
            pricing: Number(pricing),
            oilCount: oilCountValue,  // ✅ Uses default 1 if not provided
            discount: discount ? Number(discount) : 0,
            bottleML: Number(bottleML),
            fillingLevel: Number(fillingLevel),
            fragranceQty: fragrance,
            alcoholQty: alcohol,
            isActive: true
        });

        const savedPackage = await newPackage.save();

        await logSuccess({
            module: 'Packages',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Create',
            heading: 'Package Created Successfully',
            description: `Package "${savedPackage.packageName}" created with pricing ₹${savedPackage.pricing}, ${savedPackage.oilCount} oils, ${savedPackage.bottleML}ml, ${savedPackage.fillingLevel}ml fill`
        });

        res.status(201).json({
            message: "Package created successfully",
            package: savedPackage.toObject()
        });

    } catch (error) {
        console.error("Error creating package:", error);

        await logFailed({
            module: 'Packages',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Create',
            heading: 'Package Creation Failed',
            description: error.message || 'Unknown error occurred'
        });

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                message: "Validation error",
                error: error.message
            });
        }

        res.status(500).json({
            message: "Failed to create package",
            error: error.message
        });
    }
});
// ============================================
// GET ALL PACKAGES (PUBLIC - NO LOGS)
// ============================================
router.get("/get-all", async (req, res) => {
    try {
        const packages = await Package.find({})
            .sort({ createdAt: -1 });

        res.status(200).json(packages);
    } catch (error) {
        console.error("Error fetching packages:", error);
        res.status(500).json({
            message: "Failed to fetch packages",
            error: error.message
        });
    }
});

// ============================================
// GET ACTIVE PACKAGES (PUBLIC - NO LOGS)
// ============================================
router.get("/get-active", async (req, res) => {
    try {
        const packages = await Package.find({
            isActive: true
        }).sort({ pricing: 1 });

        res.status(200).json(packages);
    } catch (error) {
        console.error("Error fetching active packages:", error);
        res.status(500).json({
            message: "Failed to fetch active packages",
            error: error.message
        });
    }
});

// ============================================
// GET SINGLE PACKAGE (PUBLIC - NO LOGS)
// ============================================
router.get("/:packageId", async (req, res) => {
    try {
        const { packageId } = req.params;

        const packageData = await Package.findOne({ packageId });

        if (!packageData) {
            return res.status(404).json({
                message: "Package not found"
            });
        }

        res.status(200).json(packageData);
    } catch (error) {
        console.error("Error fetching package:", error);
        res.status(500).json({
            message: "Failed to fetch package",
            error: error.message
        });
    }
});

// ============================================
// UPDATE PACKAGE - FIXED
// ============================================
router.put("/update/:packageId", auth, checkPackagePermission, async (req, res) => {
    try {
        const { packageId } = req.params;
        const {
            packageName,
            pricing,
            oilCount,
            discount,
            isActive,
            bottleML,
            fillingLevel,
            fragranceQty,
            alcoholQty
        } = req.body;

        // Check if package exists
        const existingPackage = await Package.findOne({ packageId });

        if (!existingPackage) {
            await logFailed({
                module: 'Packages',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Update',
                heading: 'Package Update Failed',
                description: `Package with ID ${packageId} not found`
            });
            return res.status(404).json({
                message: "Package not found"
            });
        }

        // Store old values for logging
        const oldName = existingPackage.packageName;
        const oldPricing = existingPackage.pricing;
        const oldOilCount = existingPackage.oilCount;
        const oldDiscount = existingPackage.discount;
        const oldBottleML = existingPackage.bottleML;
        const oldFillingLevel = existingPackage.fillingLevel;
        const oldStatus = existingPackage.isActive;

        // Build update object
        const updateData = {};

        // Validate and add packageName
        if (packageName !== undefined) {
            if (!packageName.trim()) {
                await logFailed({
                    module: 'Packages',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Update',
                    heading: 'Package Update Failed',
                    description: 'Package name cannot be empty'
                });
                return res.status(400).json({
                    message: "Package name cannot be empty"
                });
            }

            // Check duplicate name (excluding current package)
            const duplicateCheck = await Package.findOne({
                packageName: packageName.trim(),
                packageId: { $ne: packageId }
            });

            if (duplicateCheck) {
                await logFailed({
                    module: 'Packages',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Update',
                    heading: 'Package Update Failed',
                    description: `Package name "${packageName.trim()}" already exists`
                });
                return res.status(400).json({
                    message: "Package name already exists",
                    field: "packageName"
                });
            }

            updateData.packageName = packageName.trim();
        }

        // Validate and add pricing
        if (pricing !== undefined) {
            if (pricing < 1) {
                await logFailed({
                    module: 'Packages',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Update',
                    heading: 'Package Update Failed',
                    description: `Pricing must be at least 1, received: ${pricing}`
                });
                return res.status(400).json({
                    message: "Pricing must be at least 1"
                });
            }
            updateData.pricing = Number(pricing);
        }

        // ✅ Validate and add oilCount (optional in update)
        if (oilCount !== undefined) {
            if (oilCount < 1 || oilCount > 25) {
                await logFailed({
                    module: 'Packages',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Update',
                    heading: 'Package Update Failed',
                    description: `Oil count must be between 1 and 25, received: ${oilCount}`
                });
                return res.status(400).json({
                    message: "Oil count must be between 1 and 25"
                });
            }
            updateData.oilCount = Number(oilCount);
        }

        // Validate and add discount
        if (discount !== undefined) {
            if (discount < 0 || discount > 100) {
                await logFailed({
                    module: 'Packages',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Update',
                    heading: 'Package Update Failed',
                    description: `Discount must be between 0 and 100, received: ${discount}`
                });
                return res.status(400).json({
                    message: "Discount must be between 0 and 100"
                });
            }
            updateData.discount = Number(discount);
        }

        // Add isActive if provided
        if (isActive !== undefined) {
            updateData.isActive = isActive;
        }

        // ========== NEW FIELDS VALIDATION ==========
        // Validate and add bottleML
        if (bottleML !== undefined) {
            if (![30, 60, 125].includes(Number(bottleML))) {
                await logFailed({
                    module: 'Packages',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Update',
                    heading: 'Package Update Failed',
                    description: `Bottle ML must be 30, 60, or 125, received: ${bottleML}`
                });
                return res.status(400).json({
                    message: "Bottle ML must be 30, 60, or 125"
                });
            }
            updateData.bottleML = Number(bottleML);
        }

        // Validate and add fillingLevel
        if (fillingLevel !== undefined) {
            const currentBottleML = bottleML || existingPackage.bottleML;
            if (fillingLevel < 1 || fillingLevel > Number(currentBottleML)) {
                await logFailed({
                    module: 'Packages',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Update',
                    heading: 'Package Update Failed',
                    description: `Filling level must be between 1 and ${currentBottleML}, received: ${fillingLevel}`
                });
                return res.status(400).json({
                    message: `Filling level must be between 1 and ${currentBottleML}`
                });
            }
            updateData.fillingLevel = Number(fillingLevel);
        }

        // Calculate fragrance and alcohol if filling level changed or manual provided
        if (fillingLevel !== undefined || fragranceQty !== undefined || alcoholQty !== undefined) {
            const currentFillingLevel = fillingLevel || existingPackage.fillingLevel;
            const { fragrance, alcohol } = calculateRatios(
                Number(currentFillingLevel),
                fragranceQty !== undefined ? Number(fragranceQty) : undefined,
                alcoholQty !== undefined ? Number(alcoholQty) : undefined
            );
            updateData.fragranceQty = fragrance;
            updateData.alcoholQty = alcohol;
        }

        // ✅ FIX: Always include all fields to prevent validation issues
        if (bottleML === undefined) {
            updateData.bottleML = existingPackage.bottleML;
        }
        if (fillingLevel === undefined) {
            updateData.fillingLevel = existingPackage.fillingLevel;
        }
        if (fragranceQty === undefined) {
            updateData.fragranceQty = existingPackage.fragranceQty;
        }
        if (alcoholQty === undefined) {
            updateData.alcoholQty = existingPackage.alcoholQty;
        }

        // ✅ FIX: Remove duplicate options (new: true AND returnDocument: 'after')
        const updatedPackage = await Package.findOneAndUpdate(
            { packageId },
            updateData,
            {
                returnDocument: 'after',  // ✅ Keep this only
                runValidators: true
            }
        );

        // Build description
        let descriptionParts = [];
        if (packageName && packageName !== oldName) descriptionParts.push(`Name: ${oldName} → ${packageName}`);
        if (pricing && pricing !== oldPricing) descriptionParts.push(`Price: ₹${oldPricing} → ₹${pricing}`);
        if (oilCount !== undefined && oilCount !== oldOilCount) descriptionParts.push(`Oils: ${oldOilCount} → ${oilCount}`);
        if (discount !== undefined && discount !== oldDiscount) descriptionParts.push(`Discount: ${oldDiscount}% → ${discount}%`);
        if (bottleML && bottleML !== oldBottleML) descriptionParts.push(`Bottle ML: ${oldBottleML}ml → ${bottleML}ml`);
        if (fillingLevel && fillingLevel !== oldFillingLevel) descriptionParts.push(`Fill Level: ${oldFillingLevel}ml → ${fillingLevel}ml`);
        if (isActive !== undefined && isActive !== oldStatus) descriptionParts.push(`Status: ${oldStatus ? 'Active' : 'Inactive'} → ${isActive ? 'Active' : 'Inactive'}`);

        const description = descriptionParts.length > 0
            ? `Package "${updatedPackage.packageName}" updated: ${descriptionParts.join(', ')}`
            : `Package "${updatedPackage.packageName}" updated`;

        await logSuccess({
            module: 'Packages',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Update',
            heading: 'Package Updated Successfully',
            description: description
        });

        res.status(200).json({
            message: "Package updated successfully",
            package: updatedPackage.toObject()
        });

    } catch (error) {
        console.error("Error updating package:", error);

        await logFailed({
            module: 'Packages',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Update',
            heading: 'Package Update Failed',
            description: error.message || 'Unknown error occurred'
        });

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                message: "Validation error",
                error: error.message
            });
        }

        res.status(500).json({
            message: "Failed to update package",
            error: error.message
        });
    }
});

// ============================================
// DELETE PACKAGE (HARD DELETE)
// ============================================
router.delete("/delete/:packageId", auth, checkPackagePermission, async (req, res) => {
    try {
        const { packageId } = req.params;

        // Find package first for logging
        const packageToDelete = await Package.findOne({ packageId });

        if (!packageToDelete) {
            await logFailed({
                module: 'Packages',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Delete',
                heading: 'Package Deletion Failed',
                description: `Package with ID ${packageId} not found`
            });
            return res.status(404).json({
                message: "Package not found"
            });
        }

        const deletedPackage = await Package.findOneAndDelete({ packageId });

        await logSuccess({
            module: 'Packages',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Delete',
            heading: 'Package Deleted Successfully',
            description: `Package "${packageToDelete.packageName}" (₹${packageToDelete.pricing}, ${packageToDelete.oilCount} oils) deleted`
        });

        res.status(200).json({
            message: "Package deleted successfully"
        });

    } catch (error) {
        console.error("Error deleting package:", error);

        await logFailed({
            module: 'Packages',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Delete',
            heading: 'Package Deletion Failed',
            description: error.message || 'Unknown error occurred'
        });

        res.status(500).json({
            message: "Failed to delete package",
            error: error.message
        });
    }
});

// ============================================
// TOGGLE PACKAGE STATUS (ACTIVE/INACTIVE)
// ============================================
router.patch("/toggle-status/:packageId", auth, checkPackagePermission, async (req, res) => {
    try {
        const { packageId } = req.params;

        const packageData = await Package.findOne({ packageId });

        if (!packageData) {
            await logFailed({
                module: 'Packages',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Toggle',
                heading: 'Toggle Status Failed',
                description: `Package with ID ${packageId} not found`
            });
            return res.status(404).json({
                message: "Package not found"
            });
        }

        const oldStatus = packageData.isActive;
        const newStatus = !oldStatus;

        const updatedPackage = await Package.findOneAndUpdate(
            { packageId },
            { isActive: newStatus },
            {
                new: true,
                returnDocument: 'after'
            }
        );

        await logSuccess({
            module: 'Packages',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Toggle',
            heading: `Package ${newStatus ? 'Activated' : 'Deactivated'} Successfully`,
            description: `Package "${updatedPackage.packageName}" status changed from ${oldStatus ? 'Active' : 'Inactive'} to ${newStatus ? 'Active' : 'Inactive'}`
        });

        res.status(200).json({
            message: `Package ${updatedPackage.isActive ? 'activated' : 'deactivated'} successfully`,
            package: updatedPackage.toObject()
        });

    } catch (error) {
        console.error("Error toggling package status:", error);

        await logFailed({
            module: 'Packages',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Toggle',
            heading: 'Toggle Status Failed',
            description: error.message || 'Unknown error occurred'
        });

        res.status(500).json({
            message: "Failed to toggle package status",
            error: error.message
        });
    }
});

module.exports = router;
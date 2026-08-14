const xlsx = require('xlsx');

/**
 * Parse Excel file and convert to inventory data
 * @param {Object} file - File object from multer or req.files
 * @returns {Array} - Array of parsed inventory items
 */
const parseExcel = (file) => {
    try {
        // Check if file exists
        if (!file) {
            throw new Error('No file provided');
        }

        // Read the Excel file
        let workbook;
        try {
            // For file from req.files (buffer)
            if (file.data) {
                workbook = xlsx.read(file.data, { type: 'buffer' });
            } else if (file.buffer) {
                // For file from multer (buffer)
                workbook = xlsx.read(file.buffer, { type: 'buffer' });
            } else {
                throw new Error('Invalid file format - unable to read file data');
            }
        } catch (readError) {
            throw new Error(`Failed to read Excel file: ${readError.message}`);
        }

        // Get first sheet
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
            throw new Error('No sheets found in Excel file');
        }

        const worksheet = workbook.Sheets[sheetName];

        // Convert to JSON
        let data;
        try {
            data = xlsx.utils.sheet_to_json(worksheet);
        } catch (parseError) {
            throw new Error(`Failed to parse Excel data: ${parseError.message}`);
        }

        // Check if data is empty
        if (!data || data.length === 0) {
            throw new Error('Excel file is empty or has no valid data');
        }

        // ✅ Store original data for audit
        const originalData = data.map((row) => ({
            'ML Size': row['ML Size'] || row['mlSize'] || row['ML'] || row['ml'] || '',
            'Item Type': row['Item Type'] || row['itemType'] || row['Item'] || row['item'] || row['Type'] || '',
            'Quantity': row['Quantity'] || row['quantity'] || row['Qty'] || row['qty'] || 0,
            'Purchase Price': row['Purchase Price'] || row['purchasePrice'] || row['Price'] || row['price'] || 0
        }));

        // Map to expected format with flexible column names
        const mappedData = data.map((row, index) => {
            // Try multiple possible column names
            const mlSize = row['ML Size'] || row['mlSize'] || row['ML'] || row['ml'] || '';
            const itemType = row['Item Type'] || row['itemType'] || row['Item'] || row['item'] || row['Type'] || '';
            const quantity = row['Quantity'] || row['quantity'] || row['Qty'] || row['qty'] || 0;
            // ✅ NEW: Purchase Price column
            const purchasePrice = row['Purchase Price'] || row['purchasePrice'] || row['Price'] || row['price'] || 0;

            // Skip rows where all values are empty
            if (!mlSize && !itemType && !quantity && !purchasePrice) {
                return null;
            }

            return {
                mlSize: String(mlSize).trim(),
                itemType: String(itemType).trim(),
                quantity: parseInt(quantity) || 0,
                purchasePrice: parseFloat(purchasePrice) || 0,
                // Keep original row index for error reporting
                _rowIndex: index + 2 // +2 for header (1-based + header)
            };
        });

        // Filter out null rows (empty rows)
        const validRows = mappedData.filter(row => row !== null);

        if (validRows.length === 0) {
            throw new Error('No valid data rows found in Excel file');
        }

        // Validate each row
        const errors = [];
        const validatedData = [];

        validRows.forEach((row, index) => {
            const rowNumber = row._rowIndex || index + 2;
            let isValid = true;
            const error = {
                row: rowNumber,
                mlSize: row.mlSize,
                itemType: row.itemType,
                quantity: row.quantity,
                purchasePrice: row.purchasePrice,
                error: ''
            };

            // ✅ ML Size validation - REQUIRED + ONLY NUMBERS
            if (!row.mlSize) {
                error.error = 'ML size is required';
                isValid = false;
            } else if (!/^\d+$/.test(row.mlSize)) {
                // ✅ NEW: Only allow numbers
                error.error = 'ML size must contain only numbers';
                isValid = false;
            }

            // ✅ Item Type validation
            if (!row.itemType) {
                error.error = error.error ? `${error.error}, Item type is required` : 'Item type is required';
                isValid = false;
            }

            // ✅ Quantity validation
            if (!row.quantity || row.quantity <= 0) {
                error.error = error.error ? `${error.error}, Quantity must be a positive number` : 'Quantity must be a positive number';
                isValid = false;
            }

            // ✅ Purchase Price validation
            if (row.purchasePrice === undefined || row.purchasePrice === null || row.purchasePrice < 0) {
                error.error = error.error ? `${error.error}, Purchase price must be >= 0` : 'Purchase price must be >= 0';
                isValid = false;
            }

            if (!isValid) {
                errors.push(error);
            } else {
                validatedData.push({
                    mlSize: row.mlSize,
                    itemType: row.itemType,
                    quantity: row.quantity,
                    purchasePrice: row.purchasePrice,
                    rowNumber: rowNumber
                });
            }
        });

        // ✅ Return with audit data
        return {
            success: validatedData,
            errors: errors,
            total: validatedData.length + errors.length,
            successCount: validatedData.length,
            errorCount: errors.length,
            // ✅ Original data for audit
            originalData: originalData
        };

    } catch (error) {
        console.error('Excel parse error:', error);
        throw error;
    }
};

/**
 * Generate error Excel file for failed rows
 * @param {Array} errors - Array of error objects
 * @returns {Buffer} - Excel file buffer
 */
const generateErrorExcel = (errors) => {
    try {
        // Format errors for Excel
        const errorData = errors.map(err => ({
            'ML Size': err.mlSize || '',
            'Item Type': err.itemType || '',
            'Quantity': err.quantity || '',
            'Purchase Price': err.purchasePrice || '',
            'Error Reason': err.error || 'Unknown error'
        }));

        // Create worksheet
        const worksheet = xlsx.utils.json_to_sheet(errorData);

        // Set column widths
        worksheet['!cols'] = [
            { wch: 15 }, // ML Size
            { wch: 15 }, // Item Type
            { wch: 12 }, // Quantity
            { wch: 18 }, // Purchase Price
            { wch: 40 }  // Error Reason
        ];

        // Create workbook
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Errors');

        // Generate buffer
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        return buffer;

    } catch (error) {
        console.error('Error generating error Excel:', error);
        throw new Error(`Failed to generate error Excel: ${error.message}`);
    }
};

/**
 * Download error Excel file
 * @param {Array} errors - Array of error objects
 * @param {Object} res - Express response object
 */
const downloadErrorExcel = (errors, res) => {
    try {
        const buffer = generateErrorExcel(errors);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=bulk_upload_errors.xlsx');
        res.send(buffer);
    } catch (error) {
        console.error('Error downloading error Excel:', error);
        res.status(500).json({
            message: 'Failed to generate error Excel file',
            error: error.message
        });
    }
};

/**
 * ✅ UPDATED: Get Excel template for bulk upload (with Purchase Price)
 * @returns {Buffer} - Excel file buffer
 */
const getExcelTemplate = () => {
    try {
        // Sample data with Purchase Price column
        const templateData = [
            { 'ML Size': '3', 'Item Type': 'Bottle', 'Quantity': 100, 'Purchase Price': 5 },
            { 'ML Size': '3', 'Item Type': 'Cap', 'Quantity': 100, 'Purchase Price': 2 },
            { 'ML Size': '3', 'Item Type': 'Pump', 'Quantity': 100, 'Purchase Price': 3 },
            { 'ML Size': '3', 'Item Type': 'Box', 'Quantity': 100, 'Purchase Price': 4 },
            { 'ML Size': '6', 'Item Type': 'Bottle', 'Quantity': 100, 'Purchase Price': 7 },
            { 'ML Size': '6', 'Item Type': 'Cap', 'Quantity': 100, 'Purchase Price': 3 },
            { 'ML Size': '6', 'Item Type': 'Pump', 'Quantity': 100, 'Purchase Price': 4 },
            { 'ML Size': '6', 'Item Type': 'Box', 'Quantity': 100, 'Purchase Price': 5 },
            { 'ML Size': '30', 'Item Type': 'Bottle', 'Quantity': 50, 'Purchase Price': 15 },
            { 'ML Size': '30', 'Item Type': 'Cap', 'Quantity': 50, 'Purchase Price': 5 },
            { 'ML Size': '30', 'Item Type': 'Pump', 'Quantity': 50, 'Purchase Price': 8 },
            { 'ML Size': '30', 'Item Type': 'Box', 'Quantity': 50, 'Purchase Price': 10 },
            { 'ML Size': '60', 'Item Type': 'Bottle', 'Quantity': 50, 'Purchase Price': 25 },
            { 'ML Size': '60', 'Item Type': 'Cap', 'Quantity': 50, 'Purchase Price': 8 },
            { 'ML Size': '60', 'Item Type': 'Pump', 'Quantity': 50, 'Purchase Price': 12 },
            { 'ML Size': '60', 'Item Type': 'Box', 'Quantity': 50, 'Purchase Price': 15 },
            { 'ML Size': '125', 'Item Type': 'Bottle', 'Quantity': 30, 'Purchase Price': 40 },
            { 'ML Size': '125', 'Item Type': 'Cap', 'Quantity': 30, 'Purchase Price': 12 },
            { 'ML Size': '125', 'Item Type': 'Pump', 'Quantity': 30, 'Purchase Price': 18 },
            { 'ML Size': '125', 'Item Type': 'Box', 'Quantity': 30, 'Purchase Price': 20 }
        ];

        // Create worksheet
        const worksheet = xlsx.utils.json_to_sheet(templateData);

        // Set column widths
        worksheet['!cols'] = [
            { wch: 15 }, // ML Size
            { wch: 15 }, // Item Type
            { wch: 12 }, // Quantity
            { wch: 18 }  // Purchase Price
        ];

        // Create workbook
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Bottles Inventory');

        // Generate buffer
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        return buffer;

    } catch (error) {
        console.error('Error generating template:', error);
        throw new Error(`Failed to generate template: ${error.message}`);
    }
};

/**
 * Download Excel template
 * @param {Object} res - Express response object
 */
const downloadTemplate = (res) => {
    try {
        const buffer = getExcelTemplate();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=bottles_inventory_template.xlsx');
        res.send(buffer);
    } catch (error) {
        console.error('Error downloading template:', error);
        res.status(500).json({
            message: 'Failed to download template',
            error: error.message
        });
    }
};

module.exports = {
    parseExcel,
    generateErrorExcel,
    downloadErrorExcel,
    getExcelTemplate,
    downloadTemplate
};
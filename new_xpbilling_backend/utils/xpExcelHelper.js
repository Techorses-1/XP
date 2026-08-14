const xlsx = require('xlsx');

/**
 * Parse Excel file for XP Inventory
 * @param {Object} file - File object
 * @param {string} type - 'products' or 'inventory'
 * @returns {Object} - Parsed data with success and errors
 */
const parseExcel = (file, type) => {
    try {
        if (!file) {
            throw new Error('No file provided');
        }

        let workbook;
        try {
            if (file.data) {
                workbook = xlsx.read(file.data, { type: 'buffer' });
            } else if (file.buffer) {
                workbook = xlsx.read(file.buffer, { type: 'buffer' });
            } else {
                throw new Error('Invalid file format');
            }
        } catch (readError) {
            throw new Error(`Failed to read Excel file: ${readError.message}`);
        }

        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
            throw new Error('No sheets found in Excel file');
        }

        const worksheet = workbook.Sheets[sheetName];
        let data = xlsx.utils.sheet_to_json(worksheet);

        if (!data || data.length === 0) {
            throw new Error('Excel file is empty or has no valid data');
        }

        // ✅ Store original data for audit
        const originalData = data.map((row, index) => ({
            'Product Name': row['Product Name'] || row['productName'] || row['Product'] || '',
            'Quantity': row['Quantity'] || row['quantity'] || row['Qty'] || row['qty'] || 0,
            'Purchase Price': row['Purchase Price'] || row['purchasePrice'] || row['Price'] || row['price'] || 0,
            '_rowIndex': index + 2
        }));

        const mappedData = originalData.map((row, index) => {
            const productName = row['Product Name'] || '';
            const quantity = row['Quantity'] || 0;
            const purchasePrice = row['Purchase Price'] || 0;

            if (!productName) {
                return null;
            }

            return {
                productName: String(productName).trim(),
                quantity: parseFloat(quantity) || 0,
                purchasePrice: parseFloat(purchasePrice) || 0,
                _rowIndex: row._rowIndex || index + 2
            };
        });

        const validRows = mappedData.filter(row => row !== null);

        if (validRows.length === 0) {
            throw new Error('No valid data rows found');
        }

        const errors = [];
        const validatedData = [];

        validRows.forEach((row, index) => {
            const rowNumber = row._rowIndex || index + 2;
            let isValid = true;
            const error = {
                row: rowNumber,
                productName: row.productName,
                quantity: row.quantity,
                purchasePrice: row.purchasePrice,
                error: ''
            };

            if (!row.productName) {
                error.error = 'Product name is required';
                isValid = false;
            }

            if (type === 'inventory') {
                if (!row.quantity || row.quantity <= 0) {
                    error.error = error.error ? `${error.error}, Quantity must be greater than 0` : 'Quantity must be greater than 0';
                    isValid = false;
                }

                if (!row.purchasePrice || row.purchasePrice <= 0) {
                    error.error = error.error ? `${error.error}, Purchase price must be greater than 0` : 'Purchase price must be greater than 0';
                    isValid = false;
                }
            }

            if (!isValid) {
                errors.push(error);
            } else {
                const validatedRow = {
                    productName: row.productName,
                    rowNumber: rowNumber
                };

                if (type === 'inventory') {
                    validatedRow.quantity = row.quantity;
                    validatedRow.purchasePrice = row.purchasePrice;
                }

                validatedData.push(validatedRow);
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
            originalData: originalData.map(row => ({
                'Product Name': row['Product Name'] || row.productName || '',
                'Quantity': row['Quantity'] || row.quantity || 0,
                'Purchase Price': row['Purchase Price'] || row.purchasePrice || 0
            }))
        };

    } catch (error) {
        console.error('Excel parse error:', error);
        throw error;
    }
};

const downloadTemplate = (res, type) => {
    try {
        let templateData;

        if (type === 'products') {
            templateData = [
                { 'Product Name': 'Fresh Dark Knight' },
                { 'Product Name': 'Another Product' },
                { 'Product Name': 'Third Product' }
            ];
        } else {
            templateData = [
                { 'Product Name': 'Fresh Dark Knight', 'Quantity': 10, 'Purchase Price': 500 },
                { 'Product Name': 'Another Product', 'Quantity': 5, 'Purchase Price': 550 },
                { 'Product Name': 'Third Product', 'Quantity': 20, 'Purchase Price': 480 }
            ];
        }

        const worksheet = xlsx.utils.json_to_sheet(templateData);
        const cols = Object.keys(templateData[0] || {});
        worksheet['!cols'] = cols.map(() => ({ wch: 25 }));

        const workbook = xlsx.utils.book_new();
        const sheetName = type === 'products' ? 'Products' : 'Inventory';
        xlsx.utils.book_append_sheet(workbook, worksheet, sheetName);

        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        const filename = type === 'products'
            ? 'xp_products_template.xlsx'
            : 'xp_inventory_template.xlsx';

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        res.send(buffer);
    } catch (error) {
        throw new Error(`Failed to generate template: ${error.message}`);
    }
};

const downloadErrorExcel = (errors, res) => {
    try {
        const errorData = errors.map(err => ({
            'Product Name': err.productName || '',
            'Quantity': err.quantity || '',
            'Purchase Price': err.purchasePrice || '',
            'Error Reason': err.error || err.notes || 'Unknown error'
        }));

        const worksheet = xlsx.utils.json_to_sheet(errorData);
        worksheet['!cols'] = [
            { wch: 30 },
            { wch: 15 },
            { wch: 20 },
            { wch: 45 }
        ];

        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Errors');

        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=xp_bulk_upload_errors.xlsx');
        res.send(buffer);
    } catch (error) {
        throw new Error(`Failed to generate error Excel: ${error.message}`);
    }
};

module.exports = {
    parseExcel,
    downloadTemplate,
    downloadErrorExcel
};
const xlsx = require('xlsx');

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
        const originalData = data.map((row) => {
            const item = {
                'Product Name': row['Product Name'] || row['productName'] || row['Product'] || ''
            };
            if (type === 'products') {
                item['Selling Price 3ml'] = row['Selling Price 3ml'] || row['sellingPrice3ml'] || row['Selling Price 3'] || 0;
                item['Selling Price 6ml'] = row['Selling Price 6ml'] || row['sellingPrice6ml'] || row['Selling Price 6'] || 0;
                item['Discount (%)'] = row['Discount (%)'] || row['discount'] || row['Discount'] || 0;
            } else {
                item['Quantity'] = row['Quantity'] || row['quantity'] || row['Qty'] || row['qty'] || 0;
                item['Purchase Price'] = row['Purchase Price'] || row['purchasePrice'] || row['Price'] || row['price'] || 0;
            }
            return item;
        });

        const mappedData = data.map((row, index) => {
            const productName = row['Product Name'] || row['productName'] || row['Product'] || '';
            const quantity = row['Quantity'] || row['quantity'] || row['Qty'] || row['qty'] || 0;
            const purchasePrice = row['Purchase Price'] || row['purchasePrice'] || row['Price'] || row['price'] || 0;
            const sellingPrice3ml = row['Selling Price 3ml'] || row['sellingPrice3ml'] || row['Selling Price 3'] || 0;
            const sellingPrice6ml = row['Selling Price 6ml'] || row['sellingPrice6ml'] || row['Selling Price 6'] || 0;
            const discount = row['Discount (%)'] || row['discount'] || row['Discount'] || 0;

            if (!productName) {
                return null;
            }

            return {
                productName: String(productName).trim(),
                quantity: parseFloat(quantity) || 0,
                purchasePrice: parseFloat(purchasePrice) || 0,
                sellingPrice3ml: parseFloat(sellingPrice3ml) || 0,
                sellingPrice6ml: parseFloat(sellingPrice6ml) || 0,
                discount: parseFloat(discount) || 0,
                _rowIndex: index + 2
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
                sellingPrice3ml: row.sellingPrice3ml,
                sellingPrice6ml: row.sellingPrice6ml,
                discount: row.discount,
                error: ''
            };

            if (!row.productName) {
                error.error = 'Product name is required';
                isValid = false;
            }

            if (type === 'products') {
                if (!row.sellingPrice3ml || row.sellingPrice3ml <= 0) {
                    error.error = error.error ? `${error.error}, 3ml selling price must be greater than 0` : '3ml selling price must be greater than 0';
                    isValid = false;
                }
                if (!row.sellingPrice6ml || row.sellingPrice6ml <= 0) {
                    error.error = error.error ? `${error.error}, 6ml selling price must be greater than 0` : '6ml selling price must be greater than 0';
                    isValid = false;
                }
                if (row.discount < 0 || row.discount > 100) {
                    error.error = error.error ? `${error.error}, Discount must be between 0 and 100` : 'Discount must be between 0 and 100';
                    isValid = false;
                }
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

                if (type === 'products') {
                    validatedRow.sellingPrice3ml = row.sellingPrice3ml;
                    validatedRow.sellingPrice6ml = row.sellingPrice6ml;
                    validatedRow.discount = row.discount || 0;
                }

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
            originalData: originalData
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
                { 'Product Name': 'Dispenser A', 'Selling Price 3ml': 800, 'Selling Price 6ml': 1200, 'Discount (%)': 10 },
                { 'Product Name': 'Dispenser B', 'Selling Price 3ml': 900, 'Selling Price 6ml': 1400, 'Discount (%)': 0 },
                { 'Product Name': 'Dispenser C', 'Selling Price 3ml': 750, 'Selling Price 6ml': 1100, 'Discount (%)': 5 }
            ];
        } else {
            templateData = [
                { 'Product Name': 'Dispenser A', 'Quantity': 10, 'Purchase Price': 500 },
                { 'Product Name': 'Dispenser B', 'Quantity': 5, 'Purchase Price': 550 }
            ];
        }

        const worksheet = xlsx.utils.json_to_sheet(templateData);
        const cols = Object.keys(templateData[0] || {});
        worksheet['!cols'] = cols.map(() => ({ wch: 22 }));

        const workbook = xlsx.utils.book_new();
        const sheetName = type === 'products' ? 'Products' : 'Inventory';
        xlsx.utils.book_append_sheet(workbook, worksheet, sheetName);

        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        const filename = type === 'products'
            ? 'dispenser_products_template.xlsx'
            : 'dispenser_inventory_template.xlsx';

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
            'Selling Price 3ml': err.sellingPrice3ml || '',
            'Selling Price 6ml': err.sellingPrice6ml || '',
            'Discount (%)': err.discount || '',
            'Error Reason': err.error || err.notes || 'Unknown error'
        }));

        const worksheet = xlsx.utils.json_to_sheet(errorData);
        worksheet['!cols'] = [
            { wch: 25 },
            { wch: 12 },
            { wch: 18 },
            { wch: 18 },
            { wch: 18 },
            { wch: 12 },
            { wch: 40 }
        ];

        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Errors');

        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=dispenser_bulk_upload_errors.xlsx');
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
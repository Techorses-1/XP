const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

// Create audit directory if not exists
const ensureAuditDir = (category) => {
    const dir = path.join(__dirname, "../uploads/audit", category);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
};

// Create audit file
const createAuditFile = (category, data) => {
    try {
        const { 
            originalData, 
            successData, 
            failedData, 
            summary,
            fileName,
            uploadedBy 
        } = data;

        const auditDir = ensureAuditDir(category);
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const auditFileName = `audit_${timestamp}.xlsx`;
        const auditPath = path.join(auditDir, auditFileName);

        // Create workbook
        const wb = XLSX.utils.book_new();

        // Sheet 1: Original Data
        if (originalData && originalData.length > 0) {
            const ws1 = XLSX.utils.json_to_sheet(originalData);
            XLSX.utils.book_append_sheet(wb, ws1, "Original Data");
        }

        // Sheet 2: Success
        if (successData && successData.length > 0) {
            const ws2 = XLSX.utils.json_to_sheet(successData);
            XLSX.utils.book_append_sheet(wb, ws2, "Success");
        } else {
            const ws2 = XLSX.utils.json_to_sheet([{ 'Message': 'No successful records' }]);
            XLSX.utils.book_append_sheet(wb, ws2, "Success");
        }

        // Sheet 3: Failed
        if (failedData && failedData.length > 0) {
            const ws3 = XLSX.utils.json_to_sheet(failedData);
            XLSX.utils.book_append_sheet(wb, ws3, "Failed");
        } else {
            const ws3 = XLSX.utils.json_to_sheet([{ 'Message': 'No failed records' }]);
            XLSX.utils.book_append_sheet(wb, ws3, "Failed");
        }

        // Sheet 4: Summary
        const summaryData = summary ? [
            { 'Field': 'Upload Date', 'Value': summary.uploadDate || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) },
            { 'Field': 'Category', 'Value': summary.category || 'Unknown' },
            { 'Field': 'Uploaded By', 'Value': summary.uploadedBy || 'Unknown' },
            { 'Field': 'Original File Name', 'Value': summary.fileName || 'Unknown' },
            { 'Field': 'Audit File Name', 'Value': auditFileName },
            { 'Field': 'Total Rows', 'Value': summary.totalRows || 0 },
            { 'Field': 'Success Count', 'Value': summary.successCount || 0 },
            { 'Field': 'Failed Count', 'Value': summary.failedCount || 0 }
        ] : [
            { 'Field': 'Upload Date', 'Value': new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) },
            { 'Field': 'Audit File Name', 'Value': auditFileName }
        ];
        
        const ws4 = XLSX.utils.json_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, ws4, "Summary");

        // Auto column widths
        const sheets = ['Original Data', 'Success', 'Failed', 'Summary'];
        sheets.forEach(sheetName => {
            const ws = wb.Sheets[sheetName];
            if (ws) {
                const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
                const cols = [];
                for (let c = range.s.c; c <= range.e.c; c++) {
                    let maxLen = 10;
                    for (let r = range.s.r; r <= range.e.r; r++) {
                        const cell = ws[XLSX.utils.encode_cell({ r, c })];
                        if (cell && cell.v) {
                            const len = String(cell.v).length;
                            if (len > maxLen) maxLen = len;
                        }
                    }
                    cols.push({ wch: Math.min(Math.max(maxLen + 2, 12), 50) });
                }
                ws['!cols'] = cols;
            }
        });

        // Write file
        XLSX.writeFile(wb, auditPath);
        
        return {
            success: true,
            auditFilePath: auditPath,
            auditFileName: auditFileName
        };

    } catch (error) {
        console.error('Error creating audit file:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

module.exports = { createAuditFile };
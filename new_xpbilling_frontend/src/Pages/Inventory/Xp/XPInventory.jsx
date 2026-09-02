import React, { useState, useEffect, useRef } from "react";
import { toast, ToastContainer } from "react-toastify";
import {
  FaBox, FaPlus, FaSearch, FaFileExcel,
  FaUpload, FaDownload, FaEdit, FaTrash,
  FaTimes, FaBell, FaCheckCircle, FaTimesCircle,
  FaChevronRight, FaHistory, FaArrowUp, FaArrowDown,
  FaChevronLeft, FaChevronRight as FaChevronRightIcon,
  FaUser, FaCalendarAlt, FaClock, FaMoneyBillWave,
  FaTag, FaInfoCircle, FaTrashAlt, FaToggleOn, FaToggleOff,
  FaWeightHanging, FaFlask, FaList, FaEye, FaFilter,
  FaMoneyBillWave as FaPriceTag
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import Navbar from "../../../Components/Navbar/Navbar";
import "./XPInventory.scss";
import "react-toastify/dist/ReactToastify.css";
import * as XLSX from 'xlsx';
import Select from 'react-select';

// ============================================
// ADD PRODUCT MODAL - UPDATED WITH SELLING PRICES
// ============================================
const AddProductModal = ({
  show, onClose, newProduct, setNewProduct,
  isSubmitting, onSubmit
}) => {
  if (!show) return null;

  return (
    <div className="xp-modal-overlay" onClick={onClose}>
      <div className="xp-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="xp-modal-header">
          <div className="xp-modal-title">
            <FaPlus /> Add Product
          </div>
          <button className="xp-modal-close" onClick={onClose}>
            <FaTimes />
          </button>
        </div>
        <div className="xp-modal-body">
          <div className="xp-form-row">
            <div className="xp-form-field">
              <label>Product Name *</label>
              <input
                type="text"
                value={newProduct.productName}
                onChange={(e) => setNewProduct({ ...newProduct, productName: e.target.value })}
                placeholder="Enter product name"
                autoComplete="off"
              />
            </div>
          </div>
          <div className="xp-form-row">
            <div className="xp-form-field">
              <label><FaPriceTag /> Selling Price (3ml) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={newProduct.sellingPrice3ml || ''}
                onChange={(e) => setNewProduct({ ...newProduct, sellingPrice3ml: e.target.value })}
                placeholder="Enter selling price for 3ml"
                autoComplete="off"
              />
              <small className="xp-field-hint">Price for 3ml dispenser (optional)</small>
            </div>
            <div className="xp-form-field">
              <label><FaPriceTag /> Selling Price (6ml) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={newProduct.sellingPrice6ml || ''}
                onChange={(e) => setNewProduct({ ...newProduct, sellingPrice6ml: e.target.value })}
                placeholder="Enter selling price for 6ml"
                autoComplete="off"
              />
              <small className="xp-field-hint">Price for 6ml dispenser (optional)</small>
            </div>
          </div>
        </div>
        <div className="xp-modal-footer">
          <button className="xp-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="xp-btn-primary"
            onClick={onSubmit}
            disabled={isSubmitting || !newProduct.productName.trim()}
          >
            {isSubmitting ? "Adding..." : "Add Product"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// ADD STOCK MODAL - UPDATED TO USE allProducts
// ============================================
const AddStockModal = ({
  show, onClose, products, addStockData, setAddStockData,
  isSubmitting, onSubmit, isLoadingProducts
}) => {
  if (!show) return null;

  const selectedProduct = products.find(p => p.xpId === addStockData.xpId);

  const productOptions = products.map(p => ({
    value: p.xpId,
    label: `${p.productName}`,
    product: p
  }));

  const handleProductSelect = (selectedOption) => {
    if (selectedOption) {
      const product = selectedOption.product;
      setAddStockData({
        ...addStockData,
        xpId: product.xpId,
        productName: product.productName
      });
    } else {
      setAddStockData({
        ...addStockData,
        xpId: "",
        productName: ""
      });
    }
  };

  const currentSelectedOption = productOptions.find(
    opt => opt.value === addStockData.xpId
  );

  const customSelectStyles = {
    control: (provided, state) => ({
      ...provided,
      border: '1.5px solid #e3e8f0',
      borderRadius: '8px',
      padding: '2px 2px',
      fontFamily: "'Open Sans', sans-serif",
      fontSize: '14px',
      minHeight: '42px',
      boxShadow: state.isFocused ? '0 0 0 3px rgba(106, 106, 197, 0.12)' : 'none',
      borderColor: state.isFocused ? '#6a6ac5' : '#e3e8f0',
      '&:hover': {
        borderColor: '#6a6ac5'
      },
      backgroundColor: '#fafbfc',
      cursor: 'text'
    }),
    placeholder: (provided) => ({
      ...provided,
      color: '#bfc5ce',
      fontSize: '14px'
    }),
    option: (provided, state) => ({
      ...provided,
      backgroundColor: state.isSelected ? '#3f3f91' : state.isFocused ? '#f0f0fb' : 'white',
      color: state.isSelected ? 'white' : '#333',
      fontFamily: "'Open Sans', sans-serif",
      fontSize: '13.5px',
      padding: '10px 14px',
      cursor: 'pointer',
      '&:hover': {
        backgroundColor: state.isSelected ? '#3f3f91' : '#f0f0fb'
      }
    }),
    menu: (provided) => ({
      ...provided,
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.12)',
      zIndex: 100,
      marginTop: '4px'
    }),
    menuList: (provided) => ({
      ...provided,
      maxHeight: '200px',
      padding: '4px 0'
    }),
    dropdownIndicator: (provided) => ({
      ...provided,
      color: '#aab0bc',
      '&:hover': {
        color: '#3f3f91'
      }
    }),
    clearIndicator: (provided) => ({
      ...provided,
      color: '#aab0bc',
      '&:hover': {
        color: '#dc3545'
      }
    }),
    input: (provided) => ({
      ...provided,
      fontFamily: "'Open Sans', sans-serif",
      fontSize: '14px',
      color: '#333',
      margin: '0'
    }),
    singleValue: (provided) => ({
      ...provided,
      color: '#333',
      fontFamily: "'Open Sans', sans-serif",
      fontSize: '14px'
    }),
    noOptionsMessage: (provided) => ({
      ...provided,
      fontFamily: "'Open Sans', sans-serif",
      fontSize: "13px",
      color: '#aab0bc',
      padding: '12px 14px'
    })
  };

  if (isLoadingProducts) {
    return (
      <div className="xp-modal-overlay" onClick={onClose}>
        <div className="xp-modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="xp-modal-header">
            <div className="xp-modal-title">
              <FaPlus /> Add Stock
            </div>
            <button className="xp-modal-close" onClick={onClose}>
              <FaTimes />
            </button>
          </div>
          <div className="xp-modal-body">
            <div className="xp-loading-products">
              <div className="xp-loading-spinner small"></div>
              <p>Loading products...</p>
            </div>
          </div>
          <div className="xp-modal-footer">
            <button className="xp-btn-cancel" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="xp-modal-overlay" onClick={onClose}>
      <div className="xp-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="xp-modal-header">
          <div className="xp-modal-title">
            <FaPlus /> Add Stock
          </div>
          <button className="xp-modal-close" onClick={onClose}>
            <FaTimes />
          </button>
        </div>
        <div className="xp-modal-body">
          <div className="xp-form-row">
            <div className="xp-form-field">
              <label>Search & Select Product *</label>
              <Select
                options={productOptions}
                value={currentSelectedOption}
                onChange={handleProductSelect}
                placeholder="🔍 Type to search products..."
                isClearable
                styles={customSelectStyles}
                noOptionsMessage={() => "No products found"}
                isDisabled={isSubmitting}
              />
            </div>
          </div>

          {selectedProduct && (
            <div className="xp-current-stock-info">
              <span>Current Stock: <strong>{selectedProduct.quantity?.toFixed(2)} KG</strong></span>
              <span>Avg Price: <strong>₹{selectedProduct.avgPurchasePrice?.toFixed(2) || '0.00'}/KG</strong></span>
              {selectedProduct.sellingPrice3ml > 0 && (
                <span>Sell Price 3ml: <strong>₹{selectedProduct.sellingPrice3ml}</strong></span>
              )}
              {selectedProduct.sellingPrice6ml > 0 && (
                <span>Sell Price 6ml: <strong>₹{selectedProduct.sellingPrice6ml}</strong></span>
              )}
            </div>
          )}

          <div className="xp-form-row">
            <div className="xp-form-field">
              <label>Quantity (KG) *</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={addStockData.quantity}
                onChange={(e) => setAddStockData({ ...addStockData, quantity: e.target.value })}
                placeholder="Enter quantity in KG"
                autoComplete="off"
                disabled={isSubmitting}
              />
            </div>
            <div className="xp-form-field">
              <label>Purchase Price (₹/KG) *</label>
              <input
                type="number"
                min="1"
                step="0.01"
                value={addStockData.purchasePrice}
                onChange={(e) => setAddStockData({ ...addStockData, purchasePrice: e.target.value })}
                placeholder="Enter price per KG"
                autoComplete="off"
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="xp-form-row">
            <div className="xp-form-field">
              <label>Notes (Optional)</label>
              <input
                type="text"
                value={addStockData.notes}
                onChange={(e) => setAddStockData({ ...addStockData, notes: e.target.value })}
                placeholder="Add notes..."
                autoComplete="off"
                disabled={isSubmitting}
              />
            </div>
          </div>
        </div>
        <div className="xp-modal-footer">
          <button className="xp-btn-cancel" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button
            className="xp-btn-primary"
            onClick={onSubmit}
            disabled={isSubmitting || !addStockData.xpId || !addStockData.quantity || !addStockData.purchasePrice}
          >
            {isSubmitting ? "Adding..." : "Add Stock"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// EDIT PRODUCT MODAL - UPDATED WITH SELLING PRICES
// ============================================
const EditProductModal = ({
  show, onClose, editData, setEditData,
  isSubmitting, onSubmit
}) => {
  if (!show) return null;

  return (
    <div className="xp-modal-overlay" onClick={onClose}>
      <div className="xp-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="xp-modal-header">
          <div className="xp-modal-title">
            <FaEdit /> Edit Product
          </div>
          <button className="xp-modal-close" onClick={onClose}>
            <FaTimes />
          </button>
        </div>
        <div className="xp-modal-body">
          <div className="xp-form-row">
            <div className="xp-form-field">
              <label>Product Name *</label>
              <input
                type="text"
                value={editData.productName}
                onChange={(e) => setEditData({ ...editData, productName: e.target.value })}
                placeholder="Enter product name"
                autoComplete="off"
              />
            </div>
          </div>
          <div className="xp-form-row">
            <div className="xp-form-field">
              <label><FaPriceTag /> Selling Price (3ml)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={editData.sellingPrice3ml || ''}
                onChange={(e) => setEditData({ ...editData, sellingPrice3ml: e.target.value })}
                placeholder="Enter selling price for 3ml"
                autoComplete="off"
              />
            </div>
            <div className="xp-form-field">
              <label><FaPriceTag /> Selling Price (6ml)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={editData.sellingPrice6ml || ''}
                onChange={(e) => setEditData({ ...editData, sellingPrice6ml: e.target.value })}
                placeholder="Enter selling price for 6ml"
                autoComplete="off"
              />
            </div>
          </div>
        </div>
        <div className="xp-modal-footer">
          <button className="xp-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="xp-btn-primary"
            onClick={onSubmit}
            disabled={isSubmitting || !editData.productName.trim()}
          >
            {isSubmitting ? "Updating..." : "Update Product"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// BULK UPLOAD MODAL - UPDATED WITH SELLING PRICES
// ============================================
const BulkUploadModal = ({
  show, onClose, fileInputRef, selectedFile, onFileChange,
  onDownloadTemplate, isSubmitting, onSubmit, uploadType,
  setUploadType
}) => {
  if (!show) return null;

  return (
    <div className="xp-modal-overlay" onClick={onClose}>
      <div className="xp-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="xp-modal-header">
          <div className="xp-modal-title">
            <FaUpload /> Bulk Upload
          </div>
          <button className="xp-modal-close" onClick={onClose}>
            <FaTimes />
          </button>
        </div>
        <div className="xp-modal-body">
          <div className="xp-upload-area">
            <div className="xp-upload-type-tabs">
              <button
                className={uploadType === 'products' ? 'xp-upload-type-active' : ''}
                onClick={() => setUploadType('products')}
                type="button"
              >
                <FaBox /> Products Only
              </button>
              <button
                className={uploadType === 'inventory' ? 'xp-upload-type-active' : ''}
                onClick={() => setUploadType('inventory')}
                type="button"
              >
                <FaUpload /> Inventory (Stock)
              </button>
            </div>

            <p className="xp-upload-hint">
              {uploadType === 'products'
                ? 'File should have columns: Product Name, Selling Price 3ml, Selling Price 6ml'
                : 'File should have columns: Product Name, Quantity, Purchase Price'}
            </p>

            <div className="xp-file-drop">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={onFileChange}
              />
              {selectedFile && (
                <div className="xp-file-info">
                  <FaFileExcel /> {selectedFile.name}
                </div>
              )}
            </div>

            <button className="xp-btn-download" onClick={onDownloadTemplate} type="button">
              <FaDownload /> Download Template
            </button>
          </div>
        </div>
        <div className="xp-modal-footer">
          <button className="xp-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="xp-btn-primary"
            onClick={onSubmit}
            disabled={isSubmitting || !selectedFile}
          >
            {isSubmitting ? "Uploading..." : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// ERROR MODAL - UPDATED WITH SELLING PRICES
// ============================================
const ErrorModal = ({
  show, onClose, bulkSuccessCount, bulkErrorCount,
  bulkSuccessDetails, bulkErrors, onDownloadErrorExcel
}) => {
  if (!show) return null;

  const hasErrors = bulkErrors && bulkErrors.length > 0;
  const hasSuccess = bulkSuccessCount > 0;

  return (
    <div className="xp-modal-overlay" onClick={onClose}>
      <div className="xp-modal-content xp-modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="xp-modal-header">
          <div className="xp-modal-title">
            <FaFileExcel /> Bulk Upload Results
          </div>
          <button className="xp-modal-close" onClick={onClose}>
            <FaTimes />
          </button>
        </div>
        <div className="xp-modal-body">
          <div className="xp-upload-summary">
            <div className="xp-summary-success">
              <FaCheckCircle />
              <strong>Success:</strong> {bulkSuccessCount} items added
            </div>
            <div className={`xp-summary-error ${hasErrors ? 'has-errors' : 'no-errors'}`}>
              <FaTimesCircle />
              <strong>Failed:</strong> {bulkErrorCount} items
            </div>
          </div>

          {hasSuccess && bulkSuccessDetails && bulkSuccessDetails.length > 0 && (
            <div className="xp-result-section">
              <h4 className="xp-result-heading xp-result-success">
                <FaCheckCircle /> Successfully Added ({bulkSuccessDetails.length})
              </h4>
              <div className="xp-result-table-wrap">
                <table className="xp-result-table xp-success-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Product Name</th>
                      {bulkSuccessDetails[0]?.sellingPrice3ml !== undefined && (
                        <>
                          <th>Sell Price 3ml</th>
                          <th>Sell Price 6ml</th>
                        </>
                      )}
                      {bulkSuccessDetails[0]?.quantity !== undefined && (
                        <>
                          <th>Quantity</th>
                          <th>Price</th>
                          <th>New Stock</th>
                          <th>Avg Price</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {bulkSuccessDetails.map((item, index) => (
                      <tr key={index}>
                        <td>{item.row}</td>
                        <td>{item.productName}</td>
                        {item.sellingPrice3ml !== undefined && (
                          <>
                            <td>₹{item.sellingPrice3ml}</td>
                            <td>₹{item.sellingPrice6ml}</td>
                          </>
                        )}
                        {item.quantity !== undefined && (
                          <>
                            <td>{item.quantity} KG</td>
                            <td>₹{item.purchasePrice}/KG</td>
                            <td className="xp-success-cell">{item.newStock} KG</td>
                            <td className="xp-success-cell">₹{item.newAvgPrice?.toFixed(2)}/KG</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {hasErrors && (
            <div className="xp-result-section">
              <h4 className="xp-result-heading xp-result-error">
                <FaTimesCircle /> Failed ({bulkErrors.length})
              </h4>
              <div className="xp-result-table-wrap">
                <table className="xp-result-table xp-error-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Product Name</th>
                      {bulkErrors[0]?.sellingPrice3ml !== undefined && (
                        <>
                          <th>Sell Price 3ml</th>
                          <th>Sell Price 6ml</th>
                        </>
                      )}
                      {bulkErrors[0]?.quantity !== undefined && (
                        <>
                          <th>Quantity</th>
                          <th>Price</th>
                        </>
                      )}
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkErrors.map((err, index) => (
                      <tr key={index}>
                        <td>{err.row}</td>
                        <td>{err.productName || '-'}</td>
                        {err.sellingPrice3ml !== undefined && (
                          <>
                            <td>{err.sellingPrice3ml || '-'}</td>
                            <td>{err.sellingPrice6ml || '-'}</td>
                          </>
                        )}
                        {err.quantity !== undefined && (
                          <>
                            <td>{err.quantity || '-'}</td>
                            <td>{err.purchasePrice || '-'}</td>
                          </>
                        )}
                        <td className="xp-error-cell">{err.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {hasErrors && (
            <button className="xp-btn-download-error" onClick={onDownloadErrorExcel}>
              <FaDownload /> Download Error Report
            </button>
          )}
        </div>
        <div className="xp-modal-footer">
          <button className="xp-btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// ALERT MODAL
// ============================================
const AlertModal = ({ show, onClose, alerts }) => {
  if (!show) return null;

  const lowStockItems = alerts.filter(item => item.quantity > 0 && item.quantity <= item.minStock);
  const emptyItems = alerts.filter(item => item.quantity === 0);

  return (
    <div className="xp-modal-overlay" onClick={onClose}>
      <div className="xp-modal-content xp-modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="xp-modal-header">
          <div className="xp-modal-title">
            <FaBell /> Stock Alerts
          </div>
          <button className="xp-modal-close" onClick={onClose}>
            <FaTimes />
          </button>
        </div>
        <div className="xp-modal-body">
          {alerts.length === 0 ? (
            <div className="xp-alert-empty-state">
              <FaBell />
              <p>All stock levels are healthy!</p>
            </div>
          ) : (
            <>
              {emptyItems.length > 0 && (
                <div className="xp-alert-section">
                  <h4 className="xp-alert-heading-empty">Empty Stock (0)</h4>
                  <div className="xp-alert-list">
                    {emptyItems.map((item, index) => (
                      <div key={index} className="xp-alert-item xp-alert-empty">
                        <span>{item.productName}</span>
                        <span>Quantity: {item.quantity} KG</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {lowStockItems.length > 0 && (
                <div className="xp-alert-section">
                  <h4 className="xp-alert-heading-low">Low Stock (Below {alerts[0]?.minStock || 5} KG)</h4>
                  <div className="xp-alert-list">
                    {lowStockItems.map((item, index) => (
                      <div key={index} className="xp-alert-item xp-alert-low">
                        <span>{item.productName}</span>
                        <span>Quantity: {item.quantity} KG / Min: {item.minStock} KG</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <div className="xp-modal-footer">
          <button className="xp-btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// DELETE CONFIRMATION MODAL
// ============================================
const DeleteConfirmModal = ({ show, onClose, product, onConfirm, isDeleting }) => {
  if (!show || !product) return null;

  return (
    <div className="xp-modal-overlay" onClick={onClose}>
      <div className="xp-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="xp-modal-header xp-modal-header-danger">
          <div className="xp-modal-title">
            <FaTrash /> Confirm Delete
          </div>
          <button className="xp-modal-close" onClick={onClose}>
            <FaTimes />
          </button>
        </div>
        <div className="xp-modal-body">
          <div className="xp-delete-body">
            <div className="xp-delete-icon">
              <FaTrash />
            </div>
            <h3>Are you sure?</h3>
            <p>
              You are about to delete <strong>"{product.productName}"</strong>.
              This will also delete all stock and transaction history for this product.
              <br /><br />
              <strong style={{ color: '#dc3545' }}>This action cannot be undone!</strong>
            </p>
          </div>
        </div>
        <div className="xp-modal-footer">
          <button className="xp-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="xp-btn-delete"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete Permanently"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// DISPOSAL HISTORY PANEL
// ============================================
const DisposalHistoryPanel = ({ disposals, isLoading, onClose }) => {
  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    };
  };

  if (isLoading) {
    return (
      <div className="xp-disposal-panel">
        <div className="xp-disposal-loading">
          <div className="xp-loading-spinner tiny"></div>
          Loading disposal history...
        </div>
      </div>
    );
  }

  if (!disposals || disposals.length === 0) {
    return (
      <div className="xp-disposal-panel">
        <div className="xp-disposal-header">
          <h5><FaTrashAlt /> Disposal History</h5>
          <button className="xp-disposal-close-btn" onClick={onClose}>
            <FaTimes />
          </button>
        </div>
        <div className="xp-disposal-empty">No disposal records found for this product.</div>
      </div>
    );
  }

  return (
    <div className="xp-disposal-panel">
      <div className="xp-disposal-header">
        <h5><FaTrashAlt /> Disposal History ({disposals.length})</h5>
        <button className="xp-disposal-close-btn" onClick={onClose}>
          <FaTimes />
        </button>
      </div>
      <div className="xp-disposal-list">
        {disposals.map((d, idx) => {
          const { date, time } = formatDateTime(d.disposedAt);
          return (
            <div key={d.disposalEntryId || idx} className="xp-disposal-item">
              <div className="xp-disposal-row">
                <span className="xp-disposal-label"><FaUser /> Disposed By:</span>
                <span className="xp-disposal-value">{d.performedBy?.userName || 'Unknown'}</span>

                <span className="xp-disposal-separator">|</span>

                <span className="xp-disposal-label"><FaTag /> Reason:</span>
                <span className="xp-disposal-value xp-disposal-reason">{d.reason || 'N/A'}</span>

                <span className="xp-disposal-separator">|</span>

                <span className="xp-disposal-label"><FaCalendarAlt /> Date:</span>
                <span className="xp-disposal-value">{date}</span>

                <span className="xp-disposal-separator">|</span>

                <span className="xp-disposal-label"><FaClock /> Time:</span>
                <span className="xp-disposal-value">{time}</span>

                <span className="xp-disposal-separator">|</span>

                <span className="xp-disposal-label"><FaTrashAlt /> Quantity:</span>
                <span className="xp-disposal-value xp-disposal-qty">-{d.disposedQuantity} KG</span>

                {d.notes && (
                  <>
                    <span className="xp-disposal-separator">|</span>
                    <span className="xp-disposal-label"><FaInfoCircle /> Notes:</span>
                    <span className="xp-disposal-value">{d.notes}</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================
// TRANSACTION PANEL (For Expanded Row - Only IN transactions)
// ============================================
const TransactionPanel = ({ transactions, isLoading, onViewDisposal, hasDisposal, onViewAllTransactions }) => {
  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    };
  };

  const inTransactions = transactions?.filter(t => t.transactionType === 'IN') || [];

  if (isLoading) {
    return (
      <div className="xp-transaction-panel">
        <div className="xp-transaction-loading">
          <div className="xp-loading-spinner tiny"></div>
          Loading transaction history...
        </div>
      </div>
    );
  }

  if (inTransactions.length === 0) {
    return (
      <div className="xp-transaction-panel">
        <div className="xp-transaction-panel-header">
          <h5><FaHistory /> Stock History</h5>
          <div className="xp-transaction-actions">
            {hasDisposal && (
              <button className="xp-view-disposal-btn" onClick={onViewDisposal}>
                <FaTrashAlt /> View Disposals
              </button>
            )}
            <button className="xp-view-all-transactions-btn" onClick={onViewAllTransactions}>
              <FaEye /> View All Transactions
            </button>
          </div>
        </div>
        <div className="xp-transaction-empty">No stock IN transactions recorded yet.</div>
      </div>
    );
  }

  return (
    <div className="xp-transaction-panel">
      <div className="xp-transaction-panel-header">
        <h5><FaHistory /> Stock History ({inTransactions.length})</h5>
        <div className="xp-transaction-actions">
          {hasDisposal && (
            <button className="xp-view-disposal-btn" onClick={onViewDisposal}>
              <FaTrashAlt /> View Disposals
            </button>
          )}
          <button className="xp-view-all-transactions-btn" onClick={onViewAllTransactions}>
            <FaEye /> View All Transactions
          </button>
        </div>
      </div>
      <div className="xp-transaction-list">
        {inTransactions.map((t, idx) => {
          const { date, time } = formatDateTime(t.createdAt);
          const isBulk = t.bulkUploadId && t.bulkUploadId !== '';
          const reasonLabel = isBulk ? 'Bulk Upload' : t.reason || 'Manual Add';

          return (
            <div key={t.transactionId || idx} className="xp-transaction-item">
              <div className="xp-transaction-row">
                <span className="xp-txn-label"><FaArrowUp /> Quantity:</span>
                <span className="xp-txn-value xp-txn-qty">+{t.quantity} KG</span>

                <span className="xp-txn-separator">|</span>

                <span className="xp-txn-label"><FaMoneyBillWave /> Price:</span>
                <span className="xp-txn-value xp-txn-price">₹{t.purchasePrice?.toFixed(2) || '0.00'}/KG</span>

                <span className="xp-txn-separator">|</span>

                <span className="xp-txn-label"><FaBox /> Stock:</span>
                <span className="xp-txn-value">{t.previousStock?.toFixed(2)} → <strong>{t.newStock?.toFixed(2)}</strong></span>

                <span className="xp-txn-separator">|</span>

                <span className="xp-txn-label"><FaUser /> Name:</span>
                <span className="xp-txn-value">{t.performedBy?.userName || 'Unknown'}</span>

                <span className="xp-txn-separator">|</span>

                <span className="xp-txn-label"><FaCalendarAlt /> Date:</span>
                <span className="xp-txn-value">{date} - {time}</span>

                <span className="xp-txn-separator">|</span>

                <span className="xp-txn-label"><FaTag /> Reason:</span>
                <span className="xp-txn-value xp-txn-reason">{reasonLabel}</span>

                {t.notes && (
                  <>
                    <span className="xp-txn-separator">|</span>
                    <span className="xp-txn-label"><FaInfoCircle /> Notes:</span>
                    <span className="xp-txn-value">{t.notes}</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================
// FULL TRANSACTION MODAL (IN + OUT with Toggle)
// ============================================
const FullTransactionModal = ({
  show, onClose, productName, transactions, isLoading,
  activeTab, setActiveTab, formatDateTime
}) => {
  if (!show) return null;

  const inTransactions = transactions?.filter(t => t.transactionType === 'IN') || [];
  const outTransactions = transactions?.filter(t => t.transactionType === 'OUT') || [];

  const currentTransactions = activeTab === 'in' ? inTransactions : outTransactions;

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  const getReasonLabel = (reason, bulkUploadId) => {
    if (bulkUploadId) return 'Bulk Upload';
    if (reason === 'Purchase') return 'Manual Add';
    if (reason === 'Invoice') return 'Invoice Created';
    if (reason === 'Invoice Return') return 'Invoice Deleted/Restored';
    if (reason === 'Invoice Edit - Return') return 'Invoice Edit - Returned';
    if (reason === 'Invoice Edit - New Reduction') return 'Invoice Edit - Reduced';
    if (reason === 'Invoice Deletion - Return') return 'Invoice Deleted - Returned';
    return reason || 'Unknown';
  };

  return (
    <div className="xp-modal-overlay" onClick={onClose}>
      <div className="xp-modal-content xp-modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="xp-modal-header">
          <div className="xp-modal-title">
            <FaHistory /> Transaction History - {productName || 'Product'}
          </div>
          <button className="xp-modal-close" onClick={onClose}>
            <FaTimes />
          </button>
        </div>
        <div className="xp-modal-body">
          {isLoading ? (
            <div className="xp-transaction-loading">
              <div className="xp-loading-spinner large"></div>
              <p>Loading transactions...</p>
            </div>
          ) : transactions?.length === 0 ? (
            <div className="xp-transaction-empty">No transactions found for this product.</div>
          ) : (
            <>
              <div className="xp-transaction-tabs">
                <button
                  className={`xp-tab-btn ${activeTab === 'in' ? 'xp-tab-active' : ''}`}
                  onClick={() => setActiveTab('in')}
                >
                  <FaArrowUp /> IN ({inTransactions.length})
                </button>
                <button
                  className={`xp-tab-btn ${activeTab === 'out' ? 'xp-tab-active' : ''}`}
                  onClick={() => setActiveTab('out')}
                >
                  <FaArrowDown /> OUT ({outTransactions.length})
                </button>
              </div>

              <div className="xp-full-transaction-list">
                {currentTransactions.length === 0 ? (
                  <div className="xp-transaction-empty">
                    No {activeTab === 'in' ? 'IN' : 'OUT'} transactions found.
                  </div>
                ) : (
                  currentTransactions.map((t, idx) => {
                    const isIn = t.transactionType === 'IN';
                    const reasonLabel = getReasonLabel(t.reason, t.bulkUploadId);

                    return (
                      <div key={t.transactionId || idx} className={`xp-full-txn-item ${isIn ? 'xp-txn-in' : 'xp-txn-out'}`}>
                        <div className="xp-full-txn-header">
                          <span className="xp-full-txn-type">
                            {isIn ? <FaArrowUp className="xp-txn-in-icon" /> : <FaArrowDown className="xp-txn-out-icon" />}
                            {isIn ? '+' : '-'}{t.quantity} KG
                          </span>
                          <span className="xp-full-txn-reason">{reasonLabel}</span>
                          <span className="xp-full-txn-date">
                            <FaCalendarAlt /> {formatDate(t.createdAt)}
                          </span>
                          <span className="xp-full-txn-time">
                            <FaClock /> {formatTime(t.createdAt)}
                          </span>
                        </div>
                        <div className="xp-full-txn-details">
                          <div className="xp-full-txn-row">
                            <span className="xp-full-txn-label">Performed By:</span>
                            <span className="xp-full-txn-value">{t.performedBy?.userName || 'Unknown'}</span>
                          </div>
                          {isIn && (
                            <>
                              <div className="xp-full-txn-row">
                                <span className="xp-full-txn-label">Purchase Price:</span>
                                <span className="xp-full-txn-value">₹{t.purchasePrice?.toFixed(2) || '0.00'}/KG</span>
                              </div>
                              <div className="xp-full-txn-row">
                                <span className="xp-full-txn-label">Density:</span>
                                <span className="xp-full-txn-value">{t.density || 1000}</span>
                              </div>
                            </>
                          )}
                          <div className="xp-full-txn-row">
                            <span className="xp-full-txn-label">Stock Change:</span>
                            <span className="xp-full-txn-value">
                              {t.previousStock?.toFixed(2)} → <strong>{t.newStock?.toFixed(2)}</strong> KG
                            </span>
                          </div>
                          {t.notes && (
                            <div className="xp-full-txn-row">
                              <span className="xp-full-txn-label">Notes:</span>
                              <span className="xp-full-txn-value">{t.notes}</span>
                            </div>
                          )}
                          {t.bulkUploadId && (
                            <div className="xp-full-txn-row">
                              <span className="xp-full-txn-label">Bulk Upload ID:</span>
                              <span className="xp-full-txn-value xp-txn-bulk-id">{t.bulkUploadId}</span>
                            </div>
                          )}
                          {t.reason && t.reason.includes('Invoice') && (
                            <div className="xp-full-txn-row">
                              <span className="xp-full-txn-label">Invoice Related:</span>
                              <span className="xp-full-txn-value xp-txn-invoice-tag">Yes</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
        <div className="xp-modal-footer">
          <button className="xp-btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================
const XPInventory = () => {
  const [inventory, setInventory] = useState([]);
  const [filteredInventory, setFilteredInventory] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [isLoadingAllProducts, setIsLoadingAllProducts] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [showGrams, setShowGrams] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false
  });

  const navigate = useNavigate();

  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  // ✅ UPDATED: New product with selling prices
  const [newProduct, setNewProduct] = useState({
    productName: "",
    sellingPrice3ml: "",
    sellingPrice6ml: ""
  });

  // ✅ UPDATED: Edit data with selling prices
  const [editData, setEditData] = useState({
    xpId: "",
    productName: "",
    sellingPrice3ml: "",
    sellingPrice6ml: ""
  });

  const [addStockData, setAddStockData] = useState({
    xpId: "",
    productName: "",
    quantity: "",
    purchasePrice: "",
    notes: ""
  });

  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadType, setUploadType] = useState("inventory");
  const [bulkErrors, setBulkErrors] = useState([]);
  const [bulkSuccessCount, setBulkSuccessCount] = useState(0);
  const [bulkErrorCount, setBulkErrorCount] = useState(0);
  const [bulkSuccessDetails, setBulkSuccessDetails] = useState([]);
  const [bulkUploadId, setBulkUploadId] = useState("");

  const [expandedRowId, setExpandedRowId] = useState(null);
  const [transactionsByXpId, setTransactionsByXpId] = useState({});
  const [loadingTransactionsId, setLoadingTransactionsId] = useState(null);

  const [showDisposalPanel, setShowDisposalPanel] = useState(false);
  const [disposalData, setDisposalData] = useState(null);
  const [loadingDisposal, setLoadingDisposal] = useState(false);
  const [currentDisposalXpId, setCurrentDisposalXpId] = useState(null);

  const [showFullTransactionModal, setShowFullTransactionModal] = useState(false);
  const [fullTransactions, setFullTransactions] = useState([]);
  const [loadingFullTransactions, setLoadingFullTransactions] = useState(false);
  const [fullTransactionProductName, setFullTransactionProductName] = useState('');
  const [fullTransactionXpId, setFullTransactionXpId] = useState('');
  const [fullTransactionActiveTab, setFullTransactionActiveTab] = useState('in');

  const fileInputRef = useRef(null);

  // ============================================
  // FETCH ALL PRODUCTS FOR DROPDOWN
  // ============================================
  const fetchAllProducts = async () => {
    try {
      setIsLoadingAllProducts(true);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/xp/get-all?limit=9999&search=`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch all products');
      }

      const data = await response.json();
      setAllProducts(data.products || []);
    } catch (error) {
      console.error("Error fetching all products:", error);
      toast.error("Failed to load products");
      setAllProducts([]);
    } finally {
      setIsLoadingAllProducts(false);
    }
  };

  const fetchInventory = async (page = 1, search = '', status = 'all') => {
    try {
      setIsLoading(true);
      const queryParams = new URLSearchParams({
        page: page,
        limit: 20,
        search: search
      });

      if (status && status !== 'all') {
        queryParams.set('status', status);
      }

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/xp/get-all?${queryParams}`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        if (response.status === 401) navigate('/login');
        throw new Error('Failed to fetch inventory');
      }

      const data = await response.json();
      const products = data.products || [];

      setInventory(products);
      setFilteredInventory(products);

      setPagination({
        total: data.pagination?.total || 0,
        page: data.pagination?.page || 1,
        limit: data.pagination?.limit || 20,
        totalPages: data.pagination?.totalPages || 0,
        hasNextPage: data.pagination?.hasNextPage || false,
        hasPrevPage: data.pagination?.hasPrevPage || false
      });
      setCurrentPage(data.pagination?.page || 1);

    } catch (error) {
      console.error("Error fetching inventory:", error);
      toast.error("Failed to fetch inventory");
      setInventory([]);
      setFilteredInventory([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAlerts = async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/xp/get-alerts`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error('Failed to fetch alerts');
      const data = await response.json();
      setAlerts(data.alerts || []);
    } catch (error) {
      console.error("Error fetching alerts:", error);
    }
  };

  useEffect(() => {
    fetchInventory(1, '', statusFilter);
    fetchAlerts();
    fetchAllProducts();
  }, []);

  // ============================================
  // HANDLE SEARCH
  // ============================================
  const handleSearch = (term) => {
    setSearchTerm(term);
    fetchInventory(1, term, statusFilter);
  };

  // ============================================
  // HANDLE STATUS FILTER
  // ============================================
  const handleStatusFilter = (status) => {
    setStatusFilter(status);
    fetchInventory(1, searchTerm, status);
  };

  // ============================================
  // HANDLE PAGE CHANGE
  // ============================================
  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > pagination.totalPages) return;
    setCurrentPage(newPage);
    fetchInventory(newPage, searchTerm, statusFilter);
  };

  // ============================================
  // EXPORT TO EXCEL
  // ============================================
  const handleExport = async () => {
    try {
      setIsExporting(true);

      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (searchTerm.trim()) params.set('search', searchTerm.trim());

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/xp/export?${params}`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to export');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `xp_inventory_export_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success('Export completed successfully!');

    } catch (error) {
      console.error("Error exporting:", error);
      toast.error(error.message || 'Failed to export');
    } finally {
      setIsExporting(false);
    }
  };

  // ============================================
  // ROW EXPANSION
  // ============================================
  const fetchTransactionsForProduct = async (xpId) => {
    try {
      setLoadingTransactionsId(xpId);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/xp/get-transactions?xpId=${xpId}&limit=100&hideInvoice=true`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error('Failed to fetch transaction history');
      const data = await response.json();

      const sorted = [...(data.transactions || [])].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );

      setTransactionsByXpId(prev => ({ ...prev, [xpId]: sorted }));
    } catch (error) {
      console.error("Error fetching transactions:", error);
      toast.error("Failed to load transaction history");
      setTransactionsByXpId(prev => ({ ...prev, [xpId]: [] }));
    } finally {
      setLoadingTransactionsId(null);
    }
  };

  const fetchFullTransactions = async (xpId, productName) => {
    try {
      setLoadingFullTransactions(true);
      setFullTransactionProductName(productName);
      setFullTransactionXpId(xpId);
      setFullTransactionActiveTab('in');

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/xp/get-transactions?xpId=${xpId}&limit=500&hideInvoice=false`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error('Failed to fetch transactions');

      const data = await response.json();
      const sorted = [...(data.transactions || [])].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );

      setFullTransactions(sorted);
      setShowFullTransactionModal(true);
    } catch (error) {
      console.error("Error fetching full transactions:", error);
      toast.error("Failed to load transactions");
      setFullTransactions([]);
    } finally {
      setLoadingFullTransactions(false);
    }
  };

  const fetchDisposalHistory = async (xpId) => {
    try {
      setLoadingDisposal(true);
      setCurrentDisposalXpId(xpId);

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/disposal/get-by-product/${xpId}`,
        { credentials: 'include' }
      );

      if (!response.ok) throw new Error('Failed to fetch disposal history');

      const data = await response.json();
      setDisposalData(data.data);
      setShowDisposalPanel(true);
    } catch (error) {
      console.error("Error fetching disposal history:", error);
      toast.error("Failed to load disposal history");
      setDisposalData(null);
    } finally {
      setLoadingDisposal(false);
    }
  };

  const handleRowClick = (xpId) => {
    if (expandedRowId === xpId) {
      setExpandedRowId(null);
      setShowDisposalPanel(false);
      setDisposalData(null);
      return;
    }

    setExpandedRowId(xpId);

    if (!transactionsByXpId[xpId]) {
      fetchTransactionsForProduct(xpId);
    }
  };

  // ============================================
  // CREATE PRODUCT - UPDATED WITH SELLING PRICES
  // ============================================
  const handleCreateProduct = async () => {
    try {
      if (!newProduct.productName.trim()) {
        toast.error("Product name is required");
        return;
      }

      setIsSubmitting(true);

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/xp/create-product`,
        {
          method: "POST",
          credentials: 'include',
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productName: newProduct.productName.trim(),
            sellingPrice3ml: newProduct.sellingPrice3ml ? parseFloat(newProduct.sellingPrice3ml) : 0,
            sellingPrice6ml: newProduct.sellingPrice6ml ? parseFloat(newProduct.sellingPrice6ml) : 0
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create product");
      }

      const result = await response.json();
      toast.success(result.message);

      setNewProduct({ productName: "", sellingPrice3ml: "", sellingPrice6ml: "" });
      setShowAddProductModal(false);
      await fetchInventory(currentPage, searchTerm, statusFilter);
      await fetchAlerts();
      await fetchAllProducts();

    } catch (error) {
      console.error("Error creating product:", error);
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================
  // ADD STOCK
  // ============================================
  const handleAddStock = async () => {
    try {
      if (!addStockData.xpId) {
        toast.error("Please select a product");
        return;
      }

      if (!addStockData.quantity || parseFloat(addStockData.quantity) <= 0) {
        toast.error("Please enter valid quantity");
        return;
      }

      if (!addStockData.purchasePrice || parseFloat(addStockData.purchasePrice) <= 0) {
        toast.error("Please enter valid purchase price");
        return;
      }

      setIsSubmitting(true);

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/xp/add-stock`,
        {
          method: "POST",
          credentials: 'include',
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productName: addStockData.productName,
            quantity: parseFloat(addStockData.quantity),
            purchasePrice: parseFloat(addStockData.purchasePrice),
            notes: addStockData.notes || ''
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to add stock");
      }

      const result = await response.json();
      toast.success(result.message);

      const updatedXpId = addStockData.xpId;

      setAddStockData({
        xpId: "",
        productName: "",
        quantity: "",
        purchasePrice: "",
        notes: ""
      });
      setShowAddStockModal(false);
      await fetchInventory(currentPage, searchTerm, statusFilter);
      await fetchAlerts();
      await fetchAllProducts();

      if (expandedRowId === updatedXpId) {
        await fetchTransactionsForProduct(updatedXpId);
      } else {
        setTransactionsByXpId(prev => {
          const next = { ...prev };
          delete next[updatedXpId];
          return next;
        });
      }

    } catch (error) {
      console.error("Error adding stock:", error);
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================
  // UPDATE PRODUCT - UPDATED WITH SELLING PRICES
  // ============================================
  const handleUpdateProduct = async () => {
    try {
      if (!editData.productName.trim()) {
        toast.error("Product name is required");
        return;
      }

      setIsSubmitting(true);

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/xp/update/${editData.xpId}`,
        {
          method: "PUT",
          credentials: 'include',
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productName: editData.productName.trim(),
            sellingPrice3ml: editData.sellingPrice3ml ? parseFloat(editData.sellingPrice3ml) : undefined,
            sellingPrice6ml: editData.sellingPrice6ml ? parseFloat(editData.sellingPrice6ml) : undefined
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update product");
      }

      const result = await response.json();
      toast.success(result.message);

      setEditData({ xpId: "", productName: "", sellingPrice3ml: "", sellingPrice6ml: "" });
      setShowEditModal(false);
      setSelectedProduct(null);
      await fetchInventory(currentPage, searchTerm, statusFilter);
      await fetchAllProducts();

    } catch (error) {
      console.error("Error updating product:", error);
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================
  // DELETE PRODUCT
  // ============================================
  const handleDeleteProduct = async () => {
    if (!selectedProduct) return;

    try {
      setIsDeleting(true);

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/xp/delete/${selectedProduct.xpId}`,
        {
          method: "DELETE",
          credentials: 'include'
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete product");
      }

      const result = await response.json();
      toast.success(result.message);

      if (expandedRowId === selectedProduct.xpId) {
        setExpandedRowId(null);
        setShowDisposalPanel(false);
        setDisposalData(null);
      }
      setTransactionsByXpId(prev => {
        const next = { ...prev };
        delete next[selectedProduct.xpId];
        return next;
      });

      setShowDeleteModal(false);
      setSelectedProduct(null);
      await fetchInventory(currentPage, searchTerm, statusFilter);
      await fetchAlerts();
      await fetchAllProducts();

    } catch (error) {
      console.error("Error deleting product:", error);
      toast.error(error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  // ============================================
  // BULK UPLOAD
  // ============================================
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleBulkUpload = async () => {
    try {
      if (!selectedFile) {
        toast.error("Please select a file");
        return;
      }

      const formData = new FormData();
      formData.append('file', selectedFile);

      setIsSubmitting(true);

      const endpoint = uploadType === 'products'
        ? `${import.meta.env.VITE_API_URL}/xp/bulk-upload-products`
        : `${import.meta.env.VITE_API_URL}/xp/bulk-upload-inventory`;

      const response = await fetch(endpoint, {
        method: "POST",
        credentials: 'include',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Bulk upload failed");
      }

      const result = await response.json();

      if (result.success && result.success.details) {
        setBulkSuccessDetails(result.success.details);
        setBulkSuccessCount(result.success.count || 0);
      }

      if (result.errors && result.errors.details) {
        setBulkErrors(result.errors.details);
        setBulkErrorCount(result.errors.count || 0);
      }

      setBulkUploadId(result.bulkUploadId || "");
      setShowErrorModal(true);

      toast.success(result.message || "Bulk upload completed");

      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setShowBulkUploadModal(false);
      await fetchInventory(currentPage, searchTerm, statusFilter);
      await fetchAlerts();
      await fetchAllProducts();

      if (uploadType === 'inventory') {
        setTransactionsByXpId({});
        if (expandedRowId) {
          fetchTransactionsForProduct(expandedRowId);
        }
      }

    } catch (error) {
      console.error("Error in bulk upload:", error);
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================
  // DOWNLOAD ERROR EXCEL
  // ============================================
  const handleDownloadErrorExcel = () => {
    try {
      if (!bulkErrors || bulkErrors.length === 0) {
        toast.error("No errors to download");
        return;
      }

      const errorData = bulkErrors.map(err => ({
        'Row': err.row || '',
        'Product Name': err.productName || '',
        'Selling Price 3ml': err.sellingPrice3ml || '',
        'Selling Price 6ml': err.sellingPrice6ml || '',
        'Quantity': err.quantity || '',
        'Purchase Price': err.purchasePrice || '',
        'Error Reason': err.error || 'Unknown error'
      }));

      const worksheetData = [
        ['Row', 'Product Name', 'Selling Price 3ml', 'Selling Price 6ml', 'Quantity', 'Purchase Price', 'Error Reason'],
        ...errorData.map(item => [
          item['Row'],
          item['Product Name'],
          item['Selling Price 3ml'],
          item['Selling Price 6ml'],
          item['Quantity'],
          item['Purchase Price'],
          item['Error Reason']
        ])
      ];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(worksheetData);
      ws['!cols'] = [
        { wch: 8 },
        { wch: 35 },
        { wch: 18 },
        { wch: 18 },
        { wch: 12 },
        { wch: 18 },
        { wch: 50 }
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Errors');

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'xp_bulk_upload_errors.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success("Error report downloaded successfully");

    } catch (error) {
      console.error("Error downloading error file:", error);
      toast.error("Failed to download error file");
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/xp/download-template/${uploadType}`,
        { credentials: 'include' }
      );

      if (!response.ok) throw new Error('Failed to download template');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const filename = uploadType === 'products'
        ? 'xp_products_template.xlsx'
        : 'xp_inventory_template.xlsx';
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

    } catch (error) {
      console.error("Error downloading template:", error);
      toast.error("Failed to download template");
    }
  };

  // ============================================
  // OPEN ADD STOCK MODAL
  // ============================================
  const openAddStockModal = async () => {
    setShowAddStockModal(true);
    await fetchAllProducts();
  };

  // ============================================
  // HELPERS
  // ============================================
  const getStockStatus = (quantity, minStock) => {
    if (quantity <= 0) return { status: 'empty', label: 'Empty' };
    if (quantity <= minStock) return { status: 'low', label: 'Low Stock' };
    return { status: 'healthy', label: 'In Stock' };
  };

  const getStockInGrams = (quantity) => {
    return quantity * 1000;
  };

  const getStockInML = (quantity, density) => {
    return quantity * density;
  };

  const getStockDisplay = (quantity, density, showGrams) => {
    if (showGrams) {
      return { value: getStockInGrams(quantity), unit: 'g' };
    } else {
      return { value: getStockInML(quantity, density), unit: 'ml' };
    }
  };

  const openEditModal = (product) => {
    setSelectedProduct(product);
    setEditData({
      xpId: product.xpId,
      productName: product.productName,
      sellingPrice3ml: product.sellingPrice3ml || '',
      sellingPrice6ml: product.sellingPrice6ml || ''
    });
    setShowEditModal(true);
  };

  const openDeleteModal = (product) => {
    setSelectedProduct(product);
    setShowDeleteModal(true);
  };

  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    };
  };

  // ============================================
  // RENDER
  // ============================================
  return (
    <Navbar>
      <ToastContainer position="top-center" autoClose={3000} />
      <div className="xp-main">

        {/* Page Header */}
        <div className="xp-page-header">
          <h2></h2>
          <div className="xp-right-section">
            <div className="xp-search-container">
              <FaSearch className="xp-search-icon" />
              <input
                type="text"
                placeholder="Search by Product Name..."
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="xp-action-buttons-group">
              <div className="xp-status-filter">
                <FaFilter className="xp-filter-icon" />
                <select
                  value={statusFilter}
                  onChange={(e) => handleStatusFilter(e.target.value)}
                  className="xp-status-select"
                >
                  <option value="all">All Products</option>
                  <option value="low">Low Stock</option>
                  <option value="out-of-stock">Out of Stock</option>
                </select>
              </div>

              <button
                className="xp-alert-btn"
                onClick={() => setShowAlertModal(true)}
                title="View Stock Alerts"
              >
                <FaBell />
                {alerts.length > 0 && <span className="xp-alert-badge">{alerts.length}</span>}
              </button>
              <button
                className="xp-bulk-stock-btn"
                onClick={() => {
                  setUploadType('inventory');
                  setShowBulkUploadModal(true);
                }}
                title="Bulk add stock for multiple products at once"
              >
                <FaUpload /> Bulk Upload
              </button>
              <button
                className="xp-export-btn"
                onClick={handleExport}
                disabled={isExporting}
                title="Export to Excel"
              >
                <FaDownload /> {isExporting ? "Exporting..." : "Export"}
              </button>
              <button
                className="xp-add-stock-btn"
                onClick={openAddStockModal}
                title="Add stock to a product"
              >
                <FaPlus /> Add Stock
              </button>
              <button className="xp-add-product-btn" onClick={() => setShowAddProductModal(true)}>
                <FaPlus /> Add Product
              </button>
            </div>
          </div>
        </div>

        {/* Inventory Table - UPDATED WITH SELLING PRICES */}
        <div className="xp-data-table">
          {isLoading ? (
            <div className="xp-loading-container">
              <div className="xp-loading-spinner large"></div>
              <p>Loading inventory...</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Product Name</th>
                  <th>Quantity (KG)</th>
                  <th>
                    <div className="xp-stock-toggle-header">
                      <span>Stock</span>
                      <button
                        className="xp-stock-toggle-btn"
                        onClick={() => setShowGrams(!showGrams)}
                        title={showGrams ? "Switch to ML" : "Switch to Grams"}
                      >
                        {showGrams ? (
                          <>
                            <FaToggleOn /> Grams
                          </>
                        ) : (
                          <>
                            <FaToggleOff /> ML
                          </>
                        )}
                      </button>
                    </div>
                  </th>
                  <th>Sell Price 3ml</th>
                  <th>Sell Price 6ml</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.length === 0 ? (
                  <tr>
                    <td colSpan="7">
                      <div className="xp-empty-state">
                        <FaBox className="xp-empty-icon" />
                        <p>No products found</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredInventory.map((item) => {
                    const status = getStockStatus(item.quantity, item.minStock);
                    const isExpanded = expandedRowId === item.xpId;
                    const density = item.density || 1000;
                    const { value: stockDisplayValue, unit: stockDisplayUnit } = getStockDisplay(
                      item.quantity,
                      density,
                      showGrams
                    );
                    const isFragranceBase = item.productName?.toUpperCase().trim() === "FRAGRANCE BASE";

                    return (
                      <React.Fragment key={item.xpId}>
                        <tr
                          className={`xp-product-row ${isExpanded ? 'xp-row-expanded' : ''}`}
                          onClick={() => handleRowClick(item.xpId)}
                        >
                          <td className="xp-name-cell">
                            <span className="xp-name-cell-content">
                              <FaChevronRight className={`xp-expand-chevron ${isExpanded ? 'xp-chevron-open' : ''}`} />
                              {item.productName}
                              {isFragranceBase && (
                                <span className="xp-density-badge">Density: 820</span>
                              )}
                            </span>
                          </td>
                          <td className="xp-qty-cell">{item.quantity?.toFixed(2)}</td>
                          <td className="xp-stock-cell">
                            {stockDisplayValue.toFixed(2)} {stockDisplayUnit}
                            {isFragranceBase && (
                              <span className="xp-density-hint">
                                (1KG = {showGrams ? '1000g' : '820ml'})
                              </span>
                            )}
                          </td>
                          <td className="xp-price-cell">₹{item.sellingPrice3ml || 0}</td>
                          <td className="xp-price-cell">₹{item.sellingPrice6ml || 0}</td>
                          <td>
                            <span className={`xp-status-badge xp-status-${status.status}`}>
                              <span className="xp-status-dot"></span>
                              {status.label}
                            </span>
                          </td>
                          <td>
                            <div className="xp-row-actions" onClick={(e) => e.stopPropagation()}>
                              <button
                                className="xp-edit-btn"
                                onClick={() => openEditModal(item)}
                                title="Edit"
                              >
                                <FaEdit />
                              </button>
                              <button
                                className="xp-delete-btn"
                                onClick={() => openDeleteModal(item)}
                                title="Delete"
                              >
                                <FaTrash />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="xp-transaction-row">
                            <td colSpan="7">
                              <TransactionPanel
                                transactions={transactionsByXpId[item.xpId]}
                                isLoading={loadingTransactionsId === item.xpId}
                                onViewDisposal={() => fetchDisposalHistory(item.xpId)}
                                hasDisposal={true}
                                onViewAllTransactions={() => fetchFullTransactions(item.xpId, item.productName)}
                              />

                              {showDisposalPanel && currentDisposalXpId === item.xpId && (
                                <DisposalHistoryPanel
                                  disposals={disposalData?.disposals || []}
                                  isLoading={loadingDisposal}
                                  onClose={() => {
                                    setShowDisposalPanel(false);
                                    setDisposalData(null);
                                    setCurrentDisposalXpId(null);
                                  }}
                                />
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!isLoading && pagination.totalPages > 0 && (
          <div className="xp-pagination">
            <div className="xp-pagination-info">
              Showing {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} products
            </div>
            <div className="xp-pagination-controls">
              <button
                className="xp-pagination-btn"
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={!pagination.hasPrevPage}
              >
                <FaChevronLeft />
              </button>

              <div className="xp-pagination-pages">
                {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                  let pageNum;
                  if (pagination.totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (pagination.page <= 3) {
                    pageNum = i + 1;
                  } else if (pagination.page >= pagination.totalPages - 2) {
                    pageNum = pagination.totalPages - 4 + i;
                  } else {
                    pageNum = pagination.page - 2 + i;
                  }

                  return (
                    <button
                      key={pageNum}
                      className={`xp-pagination-page ${pagination.page === pageNum ? 'xp-pagination-active' : ''}`}
                      onClick={() => handlePageChange(pageNum)}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                className="xp-pagination-btn"
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={!pagination.hasNextPage}
              >
                <FaChevronRightIcon />
              </button>
            </div>
          </div>
        )}

        {/* Modals */}
        <AddProductModal
          show={showAddProductModal}
          onClose={() => setShowAddProductModal(false)}
          newProduct={newProduct}
          setNewProduct={setNewProduct}
          isSubmitting={isSubmitting}
          onSubmit={handleCreateProduct}
        />

        <AddStockModal
          show={showAddStockModal}
          onClose={() => {
            setShowAddStockModal(false);
            setAddStockData({
              xpId: "",
              productName: "",
              quantity: "",
              purchasePrice: "",
              notes: ""
            });
          }}
          products={allProducts}
          addStockData={addStockData}
          setAddStockData={setAddStockData}
          isSubmitting={isSubmitting}
          onSubmit={handleAddStock}
          isLoadingProducts={isLoadingAllProducts}
        />

        <EditProductModal
          show={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setSelectedProduct(null);
          }}
          editData={editData}
          setEditData={setEditData}
          isSubmitting={isSubmitting}
          onSubmit={handleUpdateProduct}
        />

        <DeleteConfirmModal
          show={showDeleteModal}
          onClose={() => {
            setShowDeleteModal(false);
            setSelectedProduct(null);
          }}
          product={selectedProduct}
          onConfirm={handleDeleteProduct}
          isDeleting={isDeleting}
        />

        <BulkUploadModal
          show={showBulkUploadModal}
          onClose={() => {
            setShowBulkUploadModal(false);
            setSelectedFile(null);
          }}
          fileInputRef={fileInputRef}
          selectedFile={selectedFile}
          onFileChange={handleFileChange}
          onDownloadTemplate={handleDownloadTemplate}
          isSubmitting={isSubmitting}
          onSubmit={handleBulkUpload}
          uploadType={uploadType}
          setUploadType={setUploadType}
        />

        <ErrorModal
          show={showErrorModal}
          onClose={() => {
            setShowErrorModal(false);
            setBulkErrors([]);
            setBulkSuccessDetails([]);
          }}
          bulkSuccessCount={bulkSuccessCount}
          bulkErrorCount={bulkErrorCount}
          bulkSuccessDetails={bulkSuccessDetails}
          bulkErrors={bulkErrors}
          onDownloadErrorExcel={handleDownloadErrorExcel}
        />

        <AlertModal
          show={showAlertModal}
          onClose={() => setShowAlertModal(false)}
          alerts={alerts}
        />

        <FullTransactionModal
          show={showFullTransactionModal}
          onClose={() => {
            setShowFullTransactionModal(false);
            setFullTransactions([]);
          }}
          productName={fullTransactionProductName}
          transactions={fullTransactions}
          isLoading={loadingFullTransactions}
          activeTab={fullTransactionActiveTab}
          setActiveTab={setFullTransactionActiveTab}
          formatDateTime={formatDateTime}
        />

      </div>
    </Navbar>
  );
};

export default XPInventory;
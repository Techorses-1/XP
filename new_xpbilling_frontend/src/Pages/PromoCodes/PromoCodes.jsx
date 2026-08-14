import React, { useState, useEffect, useRef } from "react";
import { toast, ToastContainer } from "react-toastify";
import {
    FaTags, FaPlus, FaSearch, FaSave, FaEdit, FaTrash,
    FaCalendarAlt, FaClock, FaTimes, FaFileExport
} from "react-icons/fa";
import * as XLSX from "xlsx";
import { useNavigate } from "react-router-dom";
import Navbar from "../../Components/Navbar/Navbar";
import "./PromoCodes.scss";
import "react-toastify/dist/ReactToastify.css";

const PromoCodes = () => {
    const [promoCodes, setPromoCodes] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(9);
    const [isLoading, setIsLoading] = useState(true);
    const [isDeleting, setIsDeleting] = useState(false);
    const navigate = useNavigate();

    // Form states
    const [showForm, setShowForm] = useState(false);
    const [editingPromo, setEditingPromo] = useState(null);
    const [newPromoCode, setNewPromoCode] = useState("");
    const [newPromoDiscount, setNewPromoDiscount] = useState("");
    const [newPromoStartDate, setNewPromoStartDate] = useState("");
    const [newPromoEndDate, setNewPromoEndDate] = useState("");
    const [isSavingPromo, setIsSavingPromo] = useState(false);

    // Delete confirmation
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [promoToDelete, setPromoToDelete] = useState(null);

    // Refs for input focus
    const promoCodeInputRef = useRef(null);
    const promoDiscountInputRef = useRef(null);
    const startDateInputRef = useRef(null);
    const endDateInputRef = useRef(null);

    // ============================================
    // FETCH PROMO CODES
    // ============================================
    const fetchPromoCodes = async () => {
        try {
            setIsLoading(true);
            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/promo/get-promos`,
                { credentials: 'include' }
            );

            if (!response.ok) {
                if (response.status === 401) {
                    navigate('/login');
                    return;
                }
                throw new Error('Failed to fetch promo codes');
            }

            const data = await response.json();
            setPromoCodes(data);
        } catch (error) {
            console.error("Error fetching promo codes:", error);
            toast.error("Failed to fetch promo codes");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchPromoCodes();
    }, []);

    // ============================================
    // DEBOUNCE SEARCH
    // ============================================
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(searchTerm.trim().toLowerCase());
            setCurrentPage(1);
        }, 300);
        return () => clearTimeout(handler);
    }, [searchTerm]);

    // ============================================
    // RESET FORM
    // ============================================
    const resetForm = () => {
        setNewPromoCode("");
        setNewPromoDiscount("");
        setNewPromoStartDate("");
        setNewPromoEndDate("");
        setEditingPromo(null);
    };

    // ============================================
    // HANDLE EDIT
    // ============================================
    const handleEdit = (promo) => {
        setEditingPromo(promo);
        setNewPromoCode(promo.code);
        setNewPromoDiscount(promo.discount.toString());

        const startDate = new Date(promo.startDate);
        const endDate = new Date(promo.endDate);

        setNewPromoStartDate(startDate.toISOString().split('T')[0]);
        setNewPromoEndDate(endDate.toISOString().split('T')[0]);

        setShowForm(true);

        setTimeout(() => {
            promoCodeInputRef.current?.focus();
        }, 100);
    };

    // ============================================
    // HANDLE SAVE (CREATE/UPDATE)
    // ============================================
    const handleSave = async () => {
        try {
            if (!newPromoCode.trim()) {
                toast.error("Please enter promo code");
                return;
            }

            if (!newPromoDiscount || newPromoDiscount < 1 || newPromoDiscount > 100) {
                toast.error("Please enter valid discount (1-100%)");
                return;
            }

            if (!newPromoStartDate || !newPromoEndDate) {
                toast.error("Please select both start and end dates");
                return;
            }

            let startDate = new Date(newPromoStartDate);
            let endDate = new Date(newPromoEndDate);

            if (startDate > endDate) {
                toast.error("End date cannot be before start date");
                return;
            }

            endDate.setHours(23, 59, 59, 999);

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const endDateOnly = new Date(endDate);
            endDateOnly.setHours(0, 0, 0, 0);

            if (endDateOnly < today) {
                toast.error("End date cannot be in the past");
                return;
            }

            setIsSavingPromo(true);

            const url = editingPromo
                ? `${import.meta.env.VITE_API_URL}/promo/update-promo/${editingPromo.promoId}`
                : `${import.meta.env.VITE_API_URL}/promo/create-promo`;

            const method = editingPromo ? "PUT" : "POST";

            const response = await fetch(url, {
                method,
                credentials: 'include',
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    code: newPromoCode,
                    discount: parseFloat(newPromoDiscount),
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString()
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Failed to save promo code");
            }

            const result = await response.json();
            toast.success(result.message);

            await fetchPromoCodes();
            resetForm();
            setShowForm(false);
        } catch (error) {
            console.error("Error saving promo code:", error);
            toast.error(error.message);
        } finally {
            setIsSavingPromo(false);
        }
    };

    // ============================================
    // HANDLE DELETE
    // ============================================
    const handleDelete = async () => {
        if (!promoToDelete) return;

        try {
            setIsDeleting(true);
            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/promo/delete-promo/${promoToDelete}`,
                { method: "DELETE", credentials: 'include' }
            );

            if (!response.ok) throw new Error('Failed to delete promo code');

            const result = await response.json();
            toast.success(result.message);
            await fetchPromoCodes();
        } catch (error) {
            console.error("Error deleting promo code:", error);
            toast.error("Failed to delete promo code");
        } finally {
            setIsDeleting(false);
            setShowDeleteConfirm(false);
            setPromoToDelete(null);
        }
    };

    // ============================================
    // TOGGLE PROMO STATUS
    // ============================================
    const toggleStatus = async (promo) => {
        try {
            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/promo/update-promo/${promo.promoId}`,
                {
                    method: "PUT",
                    credentials: 'include',
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ isActive: !promo.isActive }),
                }
            );

            if (!response.ok) throw new Error('Failed to update promo code');

            await fetchPromoCodes();
            toast.success(`Promo code ${!promo.isActive ? 'activated' : 'deactivated'} successfully`);
        } catch (error) {
            console.error("Error updating promo code:", error);
            toast.error("Failed to update promo code");
        }
    };

    // ============================================
    // EXPORT TO EXCEL
    // ============================================
    const exportAllAsExcel = () => {
        const dataToExport = filteredPromoCodes.length > 0 ? filteredPromoCodes : promoCodes;

        if (dataToExport.length === 0) {
            toast.warning("No promo codes to export");
            return;
        }

        const worksheet = XLSX.utils.json_to_sheet(
            dataToExport.map((promo) => ({
                "Promo Code": promo.code,
                "Discount": `${promo.discount}%`,
                "Start Date": formatDate(promo.startDate),
                "End Date": formatDate(promo.endDate),
                "Status": getPromoStatus(promo).label,
                "Created At": new Date(promo.createdAt).toLocaleDateString()
            }))
        );

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "PromoCodes");

        const fileName = debouncedSearch ? "filtered_promocodes.xlsx" : "all_promocodes.xlsx";
        XLSX.writeFile(workbook, fileName);
    };

    // ============================================
    // HELPERS
    // ============================================
    const getPromoStatus = (promo) => {
        const now = new Date();
        const startDate = new Date(promo.startDate);
        const endDate = new Date(promo.endDate);

        if (promo.isExpired || endDate < now) {
            return { status: 'expired', label: 'Expired' };
        } else if (startDate > now) {
            return { status: 'upcoming', label: 'Upcoming' };
        } else if (!promo.isActive) {
            return { status: 'inactive', label: 'Inactive' };
        } else {
            return { status: 'active', label: 'Active' };
        }
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    };

    const isPromoCurrentlyActive = (promo) => {
        const now = new Date();
        const startDate = new Date(promo.startDate);
        const endDate = new Date(promo.endDate);
        return promo.isActive && !promo.isExpired && startDate <= now && endDate >= now;
    };

    // ============================================
    // FILTER & PAGINATION
    // ============================================
    const filteredPromoCodes = React.useMemo(() => {
        if (!debouncedSearch) return promoCodes;
        return promoCodes.filter((promo) => promo.code?.toLowerCase().includes(debouncedSearch));
    }, [debouncedSearch, promoCodes]);

    const paginatedPromoCodes = React.useMemo(() => {
        if (debouncedSearch) return filteredPromoCodes;
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredPromoCodes.slice(0, startIndex + itemsPerPage);
    }, [filteredPromoCodes, currentPage, itemsPerPage, debouncedSearch]);

    const hasMore = React.useMemo(() => {
        return debouncedSearch ? false : currentPage * itemsPerPage < filteredPromoCodes.length;
    }, [currentPage, itemsPerPage, filteredPromoCodes.length, debouncedSearch]);

    const loadMore = () => setCurrentPage(prev => prev + 1);

    // ============================================
    // DELETE CONFIRMATION MODAL
    // ============================================
    const DeleteConfirmationModal = () => {
        if (!showDeleteConfirm) return null;

        const promo = promoCodes.find(p => p.promoId === promoToDelete);

        return (
            <div className="pc-modal-overlay">
                <div className="pc-modal-content">
                    <div className="pc-modal-header">
                        <div className="pc-modal-title">
                            <FaTrash /> Delete Promo Code
                        </div>
                        <button className="pc-modal-close" onClick={() => setShowDeleteConfirm(false)}>
                            <FaTimes />
                        </button>
                    </div>

                    <div className="pc-modal-body">
                        <div className="pc-delete-icon">
                            <FaTrash />
                        </div>
                        <h3>Confirm Deletion</h3>
                        <p>
                            Are you sure you want to delete the promo code{" "}
                            <strong style={{ color: "#9b59b6" }}>{promo?.code}</strong>
                            ? This action cannot be undone.
                        </p>

                        <div className="pc-promo-detail-card">
                            <div className="pc-promo-detail-header">
                                <FaTags />
                                <strong>Promo Details:</strong>
                            </div>
                            <div className="pc-promo-detail-info">
                                <div>Code: <strong>{promo?.code}</strong></div>
                                <div>Discount: <strong>{promo?.discount}%</strong></div>
                                <div>Valid: {formatDate(promo?.startDate)} to {formatDate(promo?.endDate)}</div>
                            </div>
                        </div>

                        <div className="pc-modal-actions">
                            <button className="pc-btn-cancel" onClick={() => setShowDeleteConfirm(false)}>
                                <FaTimes /> Cancel
                            </button>
                            <button className="pc-btn-delete" onClick={handleDelete} disabled={isDeleting}>
                                {isDeleting ? "Deleting..." : <><FaTrash /> Delete</>}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // ============================================
    // RENDER
    // ============================================
    return (
        <Navbar>
            <ToastContainer position="top-center" autoClose={3000} />
            <div className="pc-main">

                {/* Page Header */}
                <div className="pc-page-header">
                    <h2>Promo Codes Management</h2>
                    <div className="pc-right-section">
                        <div className="pc-search-container">
                            <FaSearch className="pc-search-icon" />
                            <input
                                type="text"
                                placeholder="Search Promo Codes..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="pc-action-buttons-group">
                            <button className="pc-export-btn" onClick={exportAllAsExcel}>
                                <FaFileExport /> Export All
                            </button>
                            <button
                                className="pc-add-btn"
                                onClick={() => {
                                    resetForm();
                                    setShowForm(!showForm);
                                }}
                            >
                                <FaPlus /> {showForm ? "Close" : "Add Promo Code"}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Form */}
                {showForm && (
                    <div className="pc-form-container">
                        <h2>{editingPromo ? "Edit Promo Code" : "Add New Promo Code"}</h2>

                        <div className="pc-form-row">
                            <div className="pc-form-field">
                                <label><FaTags /> Promo Code *</label>
                                <input
                                    ref={promoCodeInputRef}
                                    type="text"
                                    value={newPromoCode}
                                    onChange={(e) => setNewPromoCode(e.target.value.toUpperCase())}
                                    placeholder="Enter promo code (e.g., SUMMER20)"
                                    maxLength={20}
                                />
                            </div>
                            <div className="pc-form-field">
                                <label>Discount (%) *</label>
                                <input
                                    ref={promoDiscountInputRef}
                                    type="number"
                                    min="1"
                                    max="100"
                                    step="0.01"
                                    value={newPromoDiscount}
                                    onChange={(e) => setNewPromoDiscount(e.target.value)}
                                    placeholder="1-100"
                                />
                            </div>
                        </div>

                        <div className="pc-form-row">
                            <div className="pc-form-field">
                                <label><FaCalendarAlt /> Start Date *</label>
                                <input
                                    ref={startDateInputRef}
                                    type="date"
                                    value={newPromoStartDate}
                                    onChange={(e) => setNewPromoStartDate(e.target.value)}
                                    min={new Date().toISOString().split('T')[0]}
                                />
                            </div>
                            <div className="pc-form-field">
                                <label><FaClock /> End Date *</label>
                                <input
                                    ref={endDateInputRef}
                                    type="date"
                                    value={newPromoEndDate}
                                    onChange={(e) => setNewPromoEndDate(e.target.value)}
                                    min={newPromoStartDate || new Date().toISOString().split('T')[0]}
                                />
                            </div>
                        </div>

                        <div className="pc-form-actions">
                            <button
                                type="button"
                                className="pc-cancel-btn"
                                onClick={() => {
                                    resetForm();
                                    setShowForm(false);
                                }}
                            >
                                <FaTimes /> Cancel
                            </button>
                            <button
                                type="button"
                                className="pc-save-btn"
                                onClick={handleSave}
                                disabled={isSavingPromo || !newPromoCode.trim() || !newPromoDiscount || !newPromoStartDate || !newPromoEndDate}
                            >
                                {isSavingPromo ? (
                                    <>
                                        <div className="pc-loading-spinner small"></div>
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <FaSave />
                                        {editingPromo ? "Update Promo Code" : "Save Promo Code"}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* Data Table */}
                <div className="pc-data-table">
                    {isLoading ? (
                        <div className="pc-loading-container">
                            <div className="pc-loading-spinner large"></div>
                            <p>Loading promo codes...</p>
                        </div>
                    ) : (
                        <>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Promo Code</th>
                                        <th>Discount</th>
                                        <th>Start Date</th>
                                        <th>End Date</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedPromoCodes.length === 0 ? (
                                        <tr>
                                            <td colSpan="6">
                                                <div className="pc-empty-state">
                                                    <FaTags className="pc-empty-icon" />
                                                    <p>No promo codes found</p>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        paginatedPromoCodes.map((promo) => {
                                            const statusInfo = getPromoStatus(promo);
                                            const isActive = isPromoCurrentlyActive(promo);
                                            return (
                                                <tr key={promo.promoId}>
                                                    <td className="pc-code-cell">{promo.code}</td>
                                                    <td className="pc-discount-cell">{promo.discount}%</td>
                                                    <td>{formatDate(promo.startDate)}</td>
                                                    <td>{formatDate(promo.endDate)}</td>
                                                    <td>
                                                        <span className={`pc-status-badge pc-${statusInfo.status}`}>
                                                            {statusInfo.label}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div className="pc-row-actions">
                                                            <button
                                                                className="pc-edit-btn"
                                                                onClick={() => handleEdit(promo)}
                                                                title="Edit"
                                                                disabled={promo.isExpired}
                                                            >
                                                                <FaEdit /> Edit
                                                            </button>
                                                            <button
                                                                className={`pc-toggle-btn ${isActive ? 'pc-deactivate' : 'pc-activate'}`}
                                                                onClick={() => toggleStatus(promo)}
                                                                title={isActive ? "Deactivate" : "Activate"}
                                                                disabled={promo.isExpired}
                                                            >
                                                                {isActive ? "Deactivate" : "Activate"}
                                                            </button>
                                                            <button
                                                                className="pc-delete-btn"
                                                                onClick={() => {
                                                                    setPromoToDelete(promo.promoId);
                                                                    setShowDeleteConfirm(true);
                                                                }}
                                                                title="Delete"
                                                            >
                                                                <FaTrash />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>

                            {hasMore && (
                                <div className="pc-load-more-container">
                                    <button className="pc-load-more-btn" onClick={loadMore}>
                                        Load More
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Delete Confirmation Modal */}
                <DeleteConfirmationModal />

            </div>
        </Navbar>
    );
};

export default PromoCodes;
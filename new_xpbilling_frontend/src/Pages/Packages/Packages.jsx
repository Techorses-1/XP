import React, { useState, useEffect, useRef } from "react";
import { toast, ToastContainer } from "react-toastify";
import {
    FaBox, FaDollarSign, FaHashtag, FaPlus,
    FaSearch, FaSave, FaEdit, FaTrash,
    FaToggleOn, FaToggleOff, FaTimes, FaPercentage,
    FaFlask, FaBeer
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import Navbar from "../../Components/Navbar/Navbar";
import "./Packages.scss";
import "react-toastify/dist/ReactToastify.css";

const Packages = () => {
    const [packages, setPackages] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const navigate = useNavigate();

    // Form states
    const [showForm, setShowForm] = useState(false);
    const [editingPackage, setEditingPackage] = useState(null);
    const [packageName, setPackageName] = useState("");
    const [pricing, setPricing] = useState("");
    const [discount, setDiscount] = useState("0");

    // NEW FIELDS
    const [bottleML, setBottleML] = useState("");
    const [fillingLevel, setFillingLevel] = useState("");
    const [fragranceQty, setFragranceQty] = useState("");
    const [alcoholQty, setAlcoholQty] = useState("");

    // Delete confirmation
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [packageToDelete, setPackageToDelete] = useState(null);

    // Refs
    const nameInputRef = useRef(null);

    // ============================================
    // FETCH PACKAGES
    // ============================================
    const fetchPackages = async () => {
        try {
            setIsLoading(true);
            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/packages/get-all`,
                { credentials: 'include' }
            );

            if (!response.ok) {
                if (response.status === 401) {
                    navigate('/login');
                    return;
                }
                throw new Error('Failed to fetch packages');
            }

            const data = await response.json();
            setPackages(data);
        } catch (error) {
            console.error("Error fetching packages:", error);
            toast.error("Failed to fetch packages");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchPackages();
    }, []);

    // ============================================
    // RESET FORM
    // ============================================
    const resetForm = () => {
        setPackageName("");
        setPricing("");
        setDiscount("0");
        setBottleML("");
        setFillingLevel("");
        setFragranceQty("");
        setAlcoholQty("");
        setEditingPackage(null);
    };

    // ============================================
    // AUTO-CALCULATE FRAGRANCE & ALCOHOL
    // ============================================
    const calculateRatios = (filling) => {
        if (filling && parseFloat(filling) > 0) {
            const fragrance = (parseFloat(filling) * 0.30).toFixed(2);
            const alcohol = (parseFloat(filling) * 0.70).toFixed(2);
            setFragranceQty(fragrance);
            setAlcoholQty(alcohol);
        } else {
            setFragranceQty("");
            setAlcoholQty("");
        }
    };

    const handleFillingLevelChange = (e) => {
        const value = e.target.value;
        setFillingLevel(value);

        // Auto-calculate only if not editing manually
        if (value && parseFloat(value) > 0) {
            const fragrance = (parseFloat(value) * 0.30).toFixed(2);
            const alcohol = (parseFloat(value) * 0.70).toFixed(2);
            setFragranceQty(fragrance);
            setAlcoholQty(alcohol);
        }
    };

    const handleBottleMLChange = (e) => {
        const value = e.target.value;
        setBottleML(value);
        // Reset filling level if it exceeds new bottle ML
        if (fillingLevel && parseFloat(fillingLevel) > parseFloat(value)) {
            setFillingLevel("");
            setFragranceQty("");
            setAlcoholQty("");
            toast.warning(`Filling level cannot exceed ${value}ml`);
        }
    };

    // ============================================
    // HANDLE EDIT
    // ============================================
    const handleEdit = (pkg) => {
        setEditingPackage(pkg);
        setPackageName(pkg.packageName);
        setPricing(pkg.pricing.toString());
        setDiscount(pkg.discount?.toString() || "0");
        setBottleML(pkg.bottleML?.toString() || "");
        setFillingLevel(pkg.fillingLevel?.toString() || "");
        setFragranceQty(pkg.fragranceQty?.toString() || "");
        setAlcoholQty(pkg.alcoholQty?.toString() || "");
        setShowForm(true);

        setTimeout(() => {
            nameInputRef.current?.focus();
        }, 100);
    };

    // ============================================
    // HANDLE SAVE (CREATE/UPDATE)
    // ============================================
    const handleSave = async () => {
        try {
            if (!packageName.trim()) {
                toast.error("Please enter package name");
                return;
            }

            if (!pricing || parseFloat(pricing) < 1) {
                toast.error("Please enter valid pricing (minimum 1)");
                return;
            }

            if (parseFloat(discount) < 0 || parseFloat(discount) > 100) {
                toast.error("Discount must be between 0 and 100");
                return;
            }

            // Validate new fields
            if (!bottleML || ![30, 60, 125].includes(parseInt(bottleML))) {
                toast.error("Please select a valid Bottle ML (30, 60, or 125)");
                return;
            }

            if (!fillingLevel || parseFloat(fillingLevel) < 1) {
                toast.error("Please enter valid filling level (minimum 1)");
                return;
            }

            if (parseFloat(fillingLevel) > parseFloat(bottleML)) {
                toast.error(`Filling level cannot exceed ${bottleML}ml`);
                return;
            }

            // Validate fragrance and alcohol
            if (parseFloat(fragranceQty) < 0) {
                toast.error("Fragrance quantity cannot be negative");
                return;
            }

            if (parseFloat(alcoholQty) < 0) {
                toast.error("Fragrance Base quantity cannot be negative");
                return;
            }

            setIsSaving(true);

            const url = editingPackage
                ? `${import.meta.env.VITE_API_URL}/packages/update/${editingPackage.packageId}`
                : `${import.meta.env.VITE_API_URL}/packages/create`;

            const method = editingPackage ? "PUT" : "POST";

            // ✅ Build payload - OIL COUNT NOT SENT (backend will default to 1)
            const payload = {
                packageName: packageName.trim(),
                pricing: parseFloat(pricing),
                discount: parseFloat(discount) || 0,
                bottleML: parseInt(bottleML),
                fillingLevel: parseFloat(fillingLevel),
                fragranceQty: parseFloat(fragranceQty),
                alcoholQty: parseFloat(alcoholQty)
            };

            // ✅ Only add oilCount if editing and user wants to change it
            // (But since we removed the input, we NEVER send it)
            // Backend will handle default = 1

            const response = await fetch(url, {
                method,
                credentials: 'include',
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Failed to save package");
            }

            const result = await response.json();
            toast.success(result.message);

            await fetchPackages();
            resetForm();
            setShowForm(false);
        } catch (error) {
            console.error("Error saving package:", error);
            toast.error(error.message);
        } finally {
            setIsSaving(false);
        }
    };

    // ============================================
    // HANDLE DELETE
    // ============================================
    const handleDelete = async () => {
        if (!packageToDelete) return;

        try {
            setIsDeleting(true);
            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/packages/delete/${packageToDelete}`,
                { method: "DELETE", credentials: 'include' }
            );

            if (!response.ok) throw new Error('Failed to delete package');

            const result = await response.json();
            toast.success(result.message);
            await fetchPackages();
        } catch (error) {
            console.error("Error deleting package:", error);
            toast.error("Failed to delete package");
        } finally {
            setIsDeleting(false);
            setShowDeleteConfirm(false);
            setPackageToDelete(null);
        }
    };

    // ============================================
    // TOGGLE STATUS
    // ============================================
    const toggleStatus = async (pkg) => {
        try {
            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/packages/toggle-status/${pkg.packageId}`,
                {
                    method: "PATCH",
                    credentials: 'include',
                    headers: { "Content-Type": "application/json" }
                }
            );

            if (!response.ok) throw new Error('Failed to toggle package status');

            const result = await response.json();
            toast.success(result.message);
            await fetchPackages();
        } catch (error) {
            console.error("Error toggling package status:", error);
            toast.error("Failed to toggle package status");
        }
    };

    // ============================================
    // FILTER PACKAGES
    // ============================================
    const filteredPackages = packages.filter((pkg) => {
        const search = searchTerm.toLowerCase();
        return (
            pkg.packageName?.toLowerCase().includes(search) ||
            pkg.pricing?.toString().includes(search) ||
            pkg.oilCount?.toString().includes(search) ||
            pkg.bottleML?.toString().includes(search)
        );
    });

    // ============================================
    // DELETE CONFIRMATION MODAL
    // ============================================
    const DeleteConfirmationModal = () => {
        if (!showDeleteConfirm) return null;

        const pkg = packages.find(p => p.packageId === packageToDelete);

        return (
            <div className="pk-modal-overlay">
                <div className="pk-modal-content">
                    <div className="pk-modal-header">
                        <div className="pk-modal-title">
                            <FaTrash /> Delete Package
                        </div>
                        <button className="pk-modal-close" onClick={() => setShowDeleteConfirm(false)}>
                            <FaTimes />
                        </button>
                    </div>

                    <div className="pk-modal-body">
                        <div className="pk-delete-icon">
                            <FaTrash />
                        </div>
                        <h3>Confirm Deletion</h3>
                        <p>
                            Are you sure you want to delete the package{" "}
                            <strong style={{ color: "#3f3f91" }}>{pkg?.packageName}</strong>
                            ? This action cannot be undone.
                        </p>

                        <div className="pk-detail-card">
                            <div className="pk-detail-card-header">
                                <FaBox />
                                <strong>Package Details:</strong>
                            </div>
                            <div className="pk-detail-card-info">
                                <div>Name: <strong>{pkg?.packageName}</strong></div>
                                <div>Pricing: <strong>₹{pkg?.pricing}</strong></div>
                                {/* <div>Oil Count: <strong>{pkg?.oilCount || 1}</strong></div> */}
                                <div>Discount: <strong>{pkg?.discount || 0}%</strong></div>
                                <div>Bottle ML: <strong>{pkg?.bottleML}ml</strong></div>
                                <div>Filling Level: <strong>{pkg?.fillingLevel}g</strong></div>
                                <div>Fragrance: <strong>{pkg?.fragranceQty}g</strong></div>
                                <div>Fragrance Base: <strong>{pkg?.alcoholQty}g</strong></div>
                            </div>
                        </div>

                        <div className="pk-modal-actions">
                            <button className="pk-btn-cancel" onClick={() => setShowDeleteConfirm(false)}>
                                <FaTimes /> Cancel
                            </button>
                            <button className="pk-btn-delete" onClick={handleDelete} disabled={isDeleting}>
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
            <div className="pk-main">

                {/* Page Header */}
                <div className="pk-page-header">
                    <h2>Packages Management</h2>
                    <div className="pk-right-section">
                        <div className="pk-search-container">
                            <FaSearch className="pk-search-icon" />
                            <input
                                type="text"
                                placeholder="Search Packages..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="pk-action-buttons-group">
                            <button
                                className="pk-add-btn"
                                onClick={() => {
                                    resetForm();
                                    setShowForm(!showForm);
                                }}
                            >
                                <FaPlus /> {showForm ? "Close" : "Add Package"}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Form */}
                {showForm && (
                    <div className="pk-form-container">
                        <h2>{editingPackage ? "Edit Package" : "Add New Package"}</h2>

                        {/* Basic Info Row 1 */}
                        <div className="pk-form-row">
                            <div className="pk-form-field">
                                <label><FaBox /> Package Name *</label>
                                <input
                                    ref={nameInputRef}
                                    type="text"
                                    value={packageName}
                                    onChange={(e) => setPackageName(e.target.value)}
                                    placeholder="Enter package name"
                                    maxLength={50}
                                />
                            </div>
                            <div className="pk-form-field">
                                <label><FaDollarSign /> Pricing (₹) *</label>
                                <input
                                    type="number"
                                    min="1"
                                    step="0.01"
                                    value={pricing}
                                    onChange={(e) => setPricing(e.target.value)}
                                    placeholder="Enter pricing"
                                />
                            </div>
                        </div>

                        {/* Basic Info Row 2 - OIL COUNT REMOVED */}
                        <div className="pk-form-row">
                            <div className="pk-form-field">
                                <label><FaPercentage /> Discount (%)</label>
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.01"
                                    value={discount}
                                    onChange={(e) => setDiscount(e.target.value)}
                                    placeholder="Enter discount (0-100)"
                                />
                                <small className="pk-field-hint">Default: 0%, Maximum 100%</small>
                            </div>
                            <div className="pk-form-field">
                                {/* <label><FaHashtag /> Oil Count</label> */}
                                <div className="pk-oil-count-display">
                                    {/* <span className="pk-oil-count-value">Default: 1</span> */}
                                    {/* <small className="pk-field-hint">Auto-set to 1 (fixed)</small> */}
                                </div>
                            </div>
                        </div>

                        {/* NEW FIELDS Row 1 - Bottle ML & Filling Level */}
                        <div className="pk-form-row">
                            <div className="pk-form-field">
                                <label><FaFlask /> Bottle ML *</label>
                                <select
                                    value={bottleML}
                                    onChange={handleBottleMLChange}
                                    className="pk-form-select"
                                >
                                    <option value="">Select Bottle ML</option>
                                    <option value="30">30 ml</option>
                                    <option value="60">60 ml</option>
                                    <option value="125">125 ml</option>
                                </select>
                            </div>
                            <div className="pk-form-field">
                                <label><FaBeer /> Filling Level (g) *</label>
                                <input
                                    type="number"
                                    min="1"
                                    step="0.01"
                                    value={fillingLevel}
                                    onChange={handleFillingLevelChange}
                                    placeholder={`Enter filling level (max ${bottleML || '--'})`}
                                />
                                <small className="pk-field-hint">
                                    Must be ≤ {bottleML || 'selected bottle ML'}g
                                </small>
                            </div>
                        </div>

                        {/* NEW FIELDS Row 2 - Fragrance & Alcohol */}
                        <div className="pk-form-row">
                            <div className="pk-form-field">
                                <label><FaPercentage /> Fragrance (g) *</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={fragranceQty}
                                    onChange={(e) => setFragranceQty(e.target.value)}
                                    placeholder="Auto-calculated (30%)"
                                />
                                <small className="pk-field-hint">30% of filling level (editable)</small>
                            </div>
                            <div className="pk-form-field">
                                <label><FaPercentage /> Fragrance Base (g) *</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={alcoholQty}
                                    onChange={(e) => setAlcoholQty(e.target.value)}
                                    placeholder="Auto-calculated (70%)"
                                />
                                <small className="pk-field-hint">70% of filling level (editable)</small>
                            </div>
                        </div>

                        <div className="pk-form-actions">
                            <button
                                type="button"
                                className="pk-cancel-btn"
                                onClick={() => {
                                    resetForm();
                                    setShowForm(false);
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="pk-save-btn"
                                onClick={handleSave}
                                disabled={isSaving || !packageName.trim() || !pricing || !bottleML || !fillingLevel}
                            >
                                {isSaving ? (
                                    <>
                                        <div className="pk-loading-spinner small"></div>
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <FaSave />
                                        {editingPackage ? "Update Package" : "Save Package"}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* Data Table */}
                <div className="pk-data-table">
                    {isLoading ? (
                        <div className="pk-loading-container">
                            <div className="pk-loading-spinner large"></div>
                            <p>Loading packages...</p>
                        </div>
                    ) : (
                        <table>
                            <thead>
                                <tr>
                                    <th>Package Name</th>
                                    <th>Pricing (₹)</th>
                                    {/* <th>Oil Count</th> */}
                                    <th>Bottle ML</th>
                                    <th>Filling (g)</th>
                                    <th>Fragrance (g)</th>
                                    <th>Fragrance Base (g)</th>
                                    <th>Discount</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredPackages.length === 0 ? (
                                    <tr>
                                        <td colSpan="10">
                                            <div className="pk-empty-state">
                                                <FaBox className="pk-empty-icon" />
                                                <p>No packages found</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredPackages.map((pkg) => (
                                        <tr key={pkg.packageId}>
                                            <td className="pk-name-cell">{pkg.packageName}</td>
                                            <td className="pk-price-cell">₹{pkg.pricing}</td>
                                            {/* <td className="pk-oil-count-cell">
                                                <span className="pk-oil-count-pill">{pkg.oilCount || 1} Oils</span>
                                            </td> */}
                                            <td className="pk-ml-cell">{pkg.bottleML}ml</td>
                                            <td className="pk-filling-cell">{pkg.fillingLevel}g</td>
                                            <td className="pk-fragrance-cell">{pkg.fragranceQty}g</td>
                                            <td className="pk-alcohol-cell">{pkg.alcoholQty}g</td>
                                            <td className="pk-discount-cell">{pkg.discount || 0}%</td>
                                            <td>
                                                <span className={`pk-status-badge ${pkg.isActive ? 'pk-active' : 'pk-inactive'}`}>
                                                    {pkg.isActive ? "Active" : "Inactive"}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="pk-row-actions">
                                                    <button
                                                        className="pk-edit-btn"
                                                        onClick={() => handleEdit(pkg)}
                                                        title="Edit"
                                                    >
                                                        <FaEdit /> Edit
                                                    </button>
                                                    <button
                                                        className={`pk-toggle-btn ${pkg.isActive ? 'pk-deactivate' : 'pk-activate'}`}
                                                        onClick={() => toggleStatus(pkg)}
                                                        title={pkg.isActive ? "Deactivate" : "Activate"}
                                                    >
                                                        {pkg.isActive ? <FaToggleOn /> : <FaToggleOff />}
                                                        {pkg.isActive ? "Deactivate" : "Activate"}
                                                    </button>
                                                    <button
                                                        className="pk-delete-btn"
                                                        onClick={() => {
                                                            setPackageToDelete(pkg.packageId);
                                                            setShowDeleteConfirm(true);
                                                        }}
                                                        title="Delete"
                                                    >
                                                        <FaTrash />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Delete Confirmation Modal */}
                <DeleteConfirmationModal />

            </div>
        </Navbar>
    );
};

export default Packages;
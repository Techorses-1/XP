import React, { useState, useEffect, useMemo, useRef } from "react";
import { Formik, Form, Field, ErrorMessage } from "formik";
import * as Yup from "yup";
import { toast, ToastContainer } from "react-toastify";
import {
  FaUser, FaEnvelope, FaPhone, FaPlus,
  FaFileExport, FaFileExcel, FaSearch,
  FaEdit, FaSave, FaTrash, FaLock, FaEye, FaEyeSlash,
  FaExclamationTriangle, FaKey
} from "react-icons/fa";
import html2pdf from "html2pdf.js";
import * as XLSX from "xlsx";
import { useNavigate } from "react-router-dom";
import Navbar from "../../../Components/Navbar/Navbar";
import "./AdminUsers.scss";
import "react-toastify/dist/ReactToastify.css";

const AdminUsers = () => {
  const [showForm, setShowForm] = useState(false);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(9);
  const [isLoading, setIsLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const MAX_USERS_LIMIT = 5;

  const isUserLimitReached = useMemo(() => users.length >= MAX_USERS_LIMIT, [users.length]);
  const remainingUsers = useMemo(() => Math.max(0, MAX_USERS_LIMIT - users.length), [users.length]);

  const availablePermissions = [
    { id: "customer", name: "Customer" },
    { id: "promo", name: "PromoCodes" },
    { id: "invoice", name: "Invoice" },
    { id: "dashboard", name: "Dashboard" },
    { id: "inventory", name: "Inventory" },
    { id: "disposal", name: "Disposal" },
    { id: "admin", name: "Admin" },
    { id: "report", name: "Reports" },
    { id: "packages", name: "Packages" },
    { id: "workshop", name: "Workshop" },
    { id: "dispose", name: "Product Disposal" },
  
  ];

  useEffect(() => { window.scrollTo(0, 0); }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim().toLowerCase());
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`${import.meta.env.VITE_API_URL}/admin/users`, {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) {
          if (response.status === 401) { navigate('/login'); return; }
          throw new Error('Failed to fetch users');
        }
        const data = await response.json();
        const sortedData = data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        setUsers(sortedData);
      } catch (err) {
        console.error("Error fetching users:", err);
        toast.error("Failed to fetch users");
      } finally {
        setIsLoading(false);
      }
    };
    fetchUsers();
  }, [navigate]);

  const filteredUsers = useMemo(() => {
    if (!debouncedSearch) return users;
    return users.filter((user) =>
      user.name?.toLowerCase().includes(debouncedSearch) ||
      user.email?.toLowerCase().includes(debouncedSearch) ||
      user.phone?.toLowerCase().includes(debouncedSearch)
    );
  }, [debouncedSearch, users]);

  const paginatedUsers = useMemo(() => {
    if (debouncedSearch) return filteredUsers;
    return filteredUsers.slice(0, currentPage * itemsPerPage);
  }, [filteredUsers, currentPage, itemsPerPage, debouncedSearch]);

  const hasMoreUsers = useMemo(() => {
    return debouncedSearch ? false : currentPage * itemsPerPage < filteredUsers.length;
  }, [currentPage, itemsPerPage, filteredUsers.length, debouncedSearch]);

  const loadMoreUsers = () => setCurrentPage(prev => prev + 1);
  const selectUser = (userId) => setSelectedUser(prev => prev === userId ? null : userId);

  const exportAsPdf = () => {
    if (!selectedUser) { toast.warning("Please select a user first"); return; }
    const user = users.find(u => u.userId === selectedUser);
    const content = `
      <div style="font-family:'Arial',sans-serif;padding:30px;background:#fff;max-width:600px;margin:0 auto;">
        <div style="text-align:center;margin-bottom:30px;">
          <h1 style="color:#3f3f91;margin:0;font-size:28px;font-weight:bold;">User Details</h1>
          <div style="height:3px;background:linear-gradient(90deg,#3f3f91,#6a6ac5);width:100px;margin:10px auto;"></div>
        </div>
        <div style="border:2px solid #3f3f91;border-radius:10px;overflow:hidden;">
          <div style="background:#3f3f91;padding:15px;color:white;">
            <h2 style="margin:0;font-size:22px;">${user.name || 'N/A'}</h2>
          </div>
          <div style="padding:25px;">
            <div style="margin-bottom:12px;"><div style="font-weight:bold;color:#555;margin-bottom:4px;">Email</div><div>${user.email || 'N/A'}</div></div>
            <div style="margin-bottom:12px;"><div style="font-weight:bold;color:#555;margin-bottom:4px;">Phone</div><div>${user.phone || 'N/A'}</div></div>
            <div style="margin-bottom:12px;"><div style="font-weight:bold;color:#555;margin-bottom:4px;">Permissions</div><div>${user.permissions?.join(', ') || 'No permissions'}</div></div>
            <div style="margin-bottom:12px;"><div style="font-weight:bold;color:#555;margin-bottom:4px;">Created Date</div><div>${new Date(user.createdAt).toLocaleDateString()}</div></div>
            <div style="background:#f9f9f9;padding:15px;border-radius:8px;text-align:center;margin-top:20px;border:1px dashed #ddd;">
              <div style="font-style:italic;color:#777;">Generated on ${new Date().toLocaleDateString()}</div>
            </div>
          </div>
        </div>
      </div>`;
    const opt = {
      margin: 10, filename: `${user.name}_details.pdf`,
      image: { type: "jpeg", quality: 1 },
      html2canvas: { scale: 3 },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    };
    html2pdf().from(content).set(opt).save();
  };

  const exportAllAsExcel = () => {
    const dataToExport = filteredUsers.length > 0 ? filteredUsers : users;
    if (dataToExport.length === 0) { toast.warning("No users to export"); return; }
    const worksheet = XLSX.utils.json_to_sheet(
      dataToExport.map(user => ({
        Name: user.name,
        Email: user.email,
        "Phone Number": user.phone,
        Permissions: user.permissions?.join(', ') || 'No permissions',
        "Created At": new Date(user.createdAt).toLocaleDateString()
      }))
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Users");
    XLSX.writeFile(workbook, debouncedSearch ? "filtered_users.xlsx" : "all_users.xlsx");
  };

  const userInitialValues = { name: "", email: "", phone: "", password: "", permissions: [] };

  const userValidationSchema = Yup.object({
    name: Yup.string().required("Name is required").matches(/^[a-zA-Z\s]*$/, "Name cannot contain numbers"),
    email: Yup.string().email("Invalid email").required("Email is required"),
    phone: Yup.string().required("Phone Number is required").matches(/^[0-9]+$/, "Must be only digits").min(10, "Must be exactly 10 digits").max(10, "Must be exactly 10 digits"),
    password: Yup.string().min(8, "Password must be at least 8 characters").required("Password is required"),
    permissions: Yup.array().min(1, "At least one permission is required")
  });

  const handleUserSubmit = async (values, { resetForm, setFieldError }) => {
    try {
      if (isUserLimitReached) {
        toast.error(`Maximum ${MAX_USERS_LIMIT} users allowed. Please delete some users to create new ones.`);
        return;
      }
      const response = await fetch(`${import.meta.env.VITE_API_URL}/admin/register`, {
        method: "POST", credentials: 'include',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.field === "email") {
          setFieldError("email", "User with this email already exists");
          toast.error("User with this email already exists");
        } else {
          throw new Error(data.message || "Failed to add user");
        }
        return;
      }
      setUsers(prev => [data.user, ...prev]);
      toast.success("User added successfully!");
      resetForm();
      setShowForm(false);
    } catch (error) {
      console.error("Error adding user:", error);
      toast.error(error.message || "Error creating user");
    }
  };

  const handleUpdateUser = async (updatedUser) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/admin/users/${updatedUser.userId}`, {
        method: "PUT", credentials: 'include',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedUser),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update user");
      }
      const data = await response.json();
      setUsers(prev => prev.map(user => user.userId === updatedUser.userId ? data.user : user));
      toast.success("User updated successfully!");
      return data;
    } catch (error) {
      console.error("Error updating user:", error);
      toast.error(error.message || "Error updating user");
      throw error;
    }
  };

  const handleDeleteUser = async (userId) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/admin/users/${userId}`, {
        method: "DELETE", credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error("Failed to delete user");
      setUsers(prev => prev.filter(user => user.userId !== userId));
      setSelectedUser(null);
      toast.success("User deleted successfully!");
      if (isUserLimitReached) toast.info("You can now create new users. 1 slot available.");
    } catch (error) {
      console.error("Error deleting user:", error);
      toast.error(error.message || "Error deleting user");
    }
  };

  const handleAddUserClick = () => {
    if (isUserLimitReached) {
      toast.error(`Maximum ${MAX_USERS_LIMIT} users reached. Please delete existing users to create new ones.`);
      return;
    }
    setShowForm(!showForm);
  };

  // ── User Limit Indicator ──
  const UserLimitIndicator = () => (
    <div className={`au-limit-indicator ${isUserLimitReached ? 'au-limit-reached' : ''}`}>
      <div className="au-limit-info">
        <FaExclamationTriangle className="au-limit-icon" />
        <span>
          {isUserLimitReached
            ? `Maximum ${MAX_USERS_LIMIT} users reached`
            : `${remainingUsers} of ${MAX_USERS_LIMIT} user slots remaining`
          }
        </span>
      </div>
      <div className="au-limit-progress">
        <div
          className="au-limit-progress-bar"
          style={{ width: `${(users.length / MAX_USERS_LIMIT) * 100}%` }}
        />
      </div>
    </div>
  );

  // ── User Modal ──
  const UserModal = ({ user, onClose, onExport, onUpdate, onDelete }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedUser, setEditedUser] = useState({});
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [errors, setErrors] = useState({});
    const [showPasswordField, setShowPasswordField] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);

    useEffect(() => {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = 'auto'; };
    }, []);

    useEffect(() => {
      if (user) {
        setEditedUser({ ...user, permissions: user.permissions || [], password: '' });
        setErrors({});
        setShowPasswordField(false);
      }
    }, [user]);

    const isUserAdmin = useMemo(() => user?.permissions?.includes('admin') || false, [user]);

    const validateForm = (values) => {
      const newErrors = {};
      if (!values.name) newErrors.name = "Name is required";
      else if (!/^[a-zA-Z\s]*$/.test(values.name)) newErrors.name = "Name cannot contain numbers";
      if (!values.email) newErrors.email = "Email is required";
      else if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(values.email)) newErrors.email = "Invalid email address";
      if (!values.phone) newErrors.phone = "Phone Number is required";
      else if (!/^[0-9]+$/.test(values.phone)) newErrors.phone = "Must be only digits";
      else if (values.phone.length !== 10) newErrors.phone = "Must be exactly 10 digits";
      if (!values.permissions || values.permissions.length === 0) newErrors.permissions = "At least one permission is required";
      if (showPasswordField && values.password && values.password.length < 8) newErrors.password = "Password must be at least 8 characters";
      return newErrors;
    };

    const handleInputChange = (e) => {
      const { name, value } = e.target;
      setEditedUser(prev => ({ ...prev, [name]: value }));
      const fieldErrors = validateForm({ ...editedUser, [name]: value });
      setErrors(prev => ({ ...prev, [name]: fieldErrors[name] }));
    };

    const handlePermissionChange = (permission) => {
      setEditedUser(prev => {
        const current = prev.permissions || [];
        const updated = current.includes(permission)
          ? current.filter(p => p !== permission)
          : [...current, permission];
        return { ...prev, permissions: updated };
      });
      if (errors.permissions) setErrors(prev => ({ ...prev, permissions: null }));
    };

    const handleSave = async () => {
      const formErrors = validateForm(editedUser);
      if (Object.keys(formErrors).length > 0) {
        setErrors(formErrors);
        toast.error("Please fix the errors before saving");
        return;
      }
      try {
        const userToUpdate = { ...editedUser };
        if (!showPasswordField || !userToUpdate.password) delete userToUpdate.password;
        await onUpdate(userToUpdate);
        setIsEditing(false);
        setShowPasswordField(false);
        setErrors({});
      } catch (error) {
        console.error("Error updating user:", error);
      }
    };

    const togglePasswordField = () => {
      setShowPasswordField(prev => !prev);
      setEditedUser(prev => ({ ...prev, password: '' }));
      if (errors.password) setErrors(prev => ({ ...prev, password: null }));
    };

    if (!user) return null;

    return (
      <div className="au-modal-overlay" onClick={onClose}>
        <div className="au-modal-content" onClick={e => e.stopPropagation()}>

          <div className="au-modal-header">
            <div className="au-modal-title">
              {isEditing ? "Edit User" : `User Details: ${user.name}`}
            </div>
            <button className="au-modal-close" onClick={onClose}>&times;</button>
          </div>

          <div className="au-modal-body">
            <div className="au-details-grid">

              {/* Name */}
              <div className="au-detail-row">
                <span className="au-detail-label">Name *</span>
                {isEditing ? (
                  <div className="au-edit-field-container">
                    <input type="text" name="name" value={editedUser.name || ''} onChange={handleInputChange} className={`au-edit-input ${errors.name ? 'error' : ''}`} />
                    {errors.name && <div className="au-error-message">{errors.name}</div>}
                  </div>
                ) : (
                  <span className="au-detail-value">{user.name}</span>
                )}
              </div>

              {/* Email */}
              <div className="au-detail-row">
                <span className="au-detail-label">Email *</span>
                {isEditing ? (
                  <div className="au-edit-field-container">
                    <input type="email" name="email" value={editedUser.email || ''} onChange={handleInputChange} className={`au-edit-input ${errors.email ? 'error' : ''}`} />
                    {errors.email && <div className="au-error-message">{errors.email}</div>}
                  </div>
                ) : (
                  <span className="au-detail-value">{user.email || 'N/A'}</span>
                )}
              </div>

              {/* Phone */}
              <div className="au-detail-row">
                <span className="au-detail-label">Phone Number *</span>
                {isEditing ? (
                  <div className="au-edit-field-container">
                    <input type="text" name="phone" value={editedUser.phone || ''} onChange={handleInputChange} className={`au-edit-input ${errors.phone ? 'error' : ''}`} />
                    {errors.phone && <div className="au-error-message">{errors.phone}</div>}
                  </div>
                ) : (
                  <span className="au-detail-value">{user.phone || 'N/A'}</span>
                )}
              </div>

              {/* Permissions */}
              <div className="au-detail-row">
                <span className="au-detail-label">Permissions *</span>
                {isEditing ? (
                  <div className="au-edit-field-container">
                    <div className="au-permissions-grid-horizontal">
                      {availablePermissions.map(permission => (
                        <label key={permission.id} className="au-permission-checkbox-horizontal">
                          <input
                            type="checkbox"
                            checked={editedUser.permissions?.includes(permission.id) || false}
                            onChange={() => handlePermissionChange(permission.id)}
                          />
                          <span>{permission.name}</span>
                        </label>
                      ))}
                    </div>
                    {errors.permissions && <div className="au-error-message">{errors.permissions}</div>}
                  </div>
                ) : (
                  <span className="au-detail-value">
                    {user.permissions?.join(', ') || 'No permissions'}
                  </span>
                )}
              </div>

              {/* Password Update — non-admin only */}
              {isEditing && !isUserAdmin && (
                <div className="au-detail-row">
                  <span className="au-detail-label"><FaKey /> Password Update</span>
                  <div className="au-edit-field-container">
                    <button
                      type="button"
                      className={`au-password-toggle-btn ${showPasswordField ? 'active' : ''}`}
                      onClick={togglePasswordField}
                    >
                      <FaKey /> {showPasswordField ? 'Cancel Password Update' : 'Update Password'}
                    </button>
                    {showPasswordField && (
                      <div className="au-password-field-container">
                        <div className="au-password-input-wrapper">
                          <input
                            type={showNewPassword ? "text" : "password"}
                            name="password"
                            value={editedUser.password || ''}
                            onChange={handleInputChange}
                            placeholder="Enter new password"
                            className={errors.password ? 'error' : ''}
                          />
                          <button type="button" className="au-password-visibility-toggle" onClick={() => setShowNewPassword(prev => !prev)}>
                            {showNewPassword ? <FaEyeSlash /> : <FaEye />}
                          </button>
                        </div>
                        {errors.password && <div className="au-error-message">{errors.password}</div>}
                        <div className="au-password-hint">Leave empty to keep current password. Minimum 8 characters.</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Admin note */}
              {isEditing && isUserAdmin && (
                <div className="au-detail-row">
                  <div className="au-admin-note">
                    <FaExclamationTriangle />
                    Password update is not available for admin users.
                  </div>
                </div>
              )}

              {/* Created At */}
              <div className="au-detail-row">
                <span className="au-detail-label">Created At</span>
                <span className="au-detail-value">{new Date(user.createdAt).toLocaleDateString()}</span>
              </div>

            </div>
          </div>

          <div className="au-modal-footer">
            <button className="au-export-btn" onClick={onExport}>
              <FaFileExport /> Export PDF
            </button>
            <button
              className={`au-update-btn ${isEditing ? 'au-save-btn' : ''}`}
              onClick={isEditing ? handleSave : () => setIsEditing(true)}
            >
              {isEditing ? <><FaSave /> Save Changes</> : <><FaEdit /> Update</>}
            </button>
            <button className="au-delete-btn" onClick={() => setShowDeleteConfirm(true)}>
              <FaTrash /> Delete
            </button>
          </div>

        </div>

        {/* Delete Confirm */}
        {showDeleteConfirm && (
          <div className="au-confirm-dialog-overlay">
            <div className="au-confirm-dialog">
              <h3>Confirm Deletion</h3>
              <p>Are you sure you want to delete <strong>{user.name}</strong>? This action cannot be undone.</p>
              <div className="au-confirm-buttons">
                <button className="au-confirm-cancel" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
                <button className="au-confirm-delete" onClick={() => { onDelete(user.userId); setShowDeleteConfirm(false); }}>Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Main Return ──
  return (
    <Navbar>
      <ToastContainer position="top-center" autoClose={3000} />
      <div className="au-main">

        {/* Page Header */}
        <div className="au-page-header">
          <div className="au-right-section">
            <div className="au-search-container">
              <FaSearch className="au-search-icon" />
              <input
                type="text"
                placeholder="Search Users..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="au-action-buttons-group">
              <button className="au-export-all-btn" onClick={exportAllAsExcel}>
                <FaFileExcel /> Export All
              </button>
              <button
                className={`au-add-btn ${isUserLimitReached ? 'disabled' : ''}`}
                onClick={handleAddUserClick}
                disabled={isUserLimitReached}
                title={isUserLimitReached ? `Maximum ${MAX_USERS_LIMIT} users allowed` : "Add new user"}
              >
                <FaPlus />
                {showForm ? "Close" : "Add User"}
                {isUserLimitReached && <FaExclamationTriangle className="au-warning-icon" />}
              </button>
            </div>
          </div>
        </div>

        {/* Limit Indicator */}
        <UserLimitIndicator />

        {/* Add User Form */}
        {showForm && (
          <div className="au-form-container">
            <h2>Add User</h2>

            {remainingUsers <= 2 && (
              <div className="au-limit-warning">
                <FaExclamationTriangle />
                {isUserLimitReached
                  ? `You have reached the maximum limit of ${MAX_USERS_LIMIT} users.`
                  : `Only ${remainingUsers} user slot(s) remaining.`
                }
              </div>
            )}

            <Formik initialValues={userInitialValues} validationSchema={userValidationSchema} onSubmit={handleUserSubmit}>
              {({ values, setFieldValue, isSubmitting }) => (
                <Form>
                  <div className="au-form-row">
                    <div className="au-form-field">
                      <label><FaUser /> Name *</label>
                      <Field name="name" type="text" />
                      <ErrorMessage name="name" component="div" className="au-error" />
                    </div>
                  </div>

                  <div className="au-form-row">
                    <div className="au-form-field">
                      <label><FaEnvelope /> Email *</label>
                      <Field name="email" type="email" />
                      <ErrorMessage name="email" component="div" className="au-error" />
                    </div>
                  </div>

                  <div className="au-form-row">
                    <div className="au-form-field">
                      <label><FaPhone /> Phone Number *</label>
                      <Field name="phone" type="text" />
                      <ErrorMessage name="phone" component="div" className="au-error" />
                    </div>
                  </div>

                  <div className="au-form-row">
                    <div className="au-form-field">
                      <label><FaLock /> Password *</label>
                      <div className="au-password-input-container">
                        <Field name="password" type={showPassword ? "text" : "password"} />
                        <button type="button" className="au-password-toggle" onClick={() => setShowPassword(prev => !prev)}>
                          {showPassword ? <FaEyeSlash /> : <FaEye />}
                        </button>
                      </div>
                      <ErrorMessage name="password" component="div" className="au-error" />
                    </div>
                  </div>

                  <div className="au-form-row">
                    <div className="au-form-field">
                      <label>Permissions *</label>
                      <div className="au-permissions-grid">
                        {availablePermissions.map(permission => (
                          <label key={permission.id} className="au-permission-checkbox">
                            <Field
                              type="checkbox"
                              name="permissions"
                              value={permission.id}
                              checked={values.permissions.includes(permission.id)}
                              onChange={e => {
                                if (e.target.checked) {
                                  setFieldValue('permissions', [...values.permissions, permission.id]);
                                } else {
                                  setFieldValue('permissions', values.permissions.filter(p => p !== permission.id));
                                }
                              }}
                            />
                            <span>{permission.name}</span>
                          </label>
                        ))}
                      </div>
                      <ErrorMessage name="permissions" component="div" className="au-error" />
                    </div>
                  </div>

                  <button type="submit" disabled={isUserLimitReached || isSubmitting} className={isUserLimitReached ? 'disabled' : ''}>
                    {isUserLimitReached ? 'Limit Reached' : isSubmitting ? 'Creating...' : 'Create User'}
                  </button>
                </Form>
              )}
            </Formik>
          </div>
        )}

        {/* Data Table */}
        <div className="au-data-table">
          {isLoading ? (
            <div className="au-loading-container">
              <div className="au-loading-spinner large"></div>
              <p>Loading users...</p>
            </div>
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone Number</th>
                    <th>Permissions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedUsers.map((user, index) => (
                    <tr
                      key={user.userId || index}
                      className={selectedUser === user.userId ? "au-selected" : ""}
                      onClick={() => selectUser(user.userId)}
                    >
                      <td>{user.name}</td>
                      <td>{user.email}</td>
                      <td>{user.phone}</td>
                      <td>{user.permissions?.join(', ') || 'No permissions'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {hasMoreUsers && (
                <div className="au-load-more-container">
                  <button className="au-load-more-btn" onClick={loadMoreUsers}>Load More</button>
                </div>
              )}
            </>
          )}
        </div>

        {/* User Modal */}
        {selectedUser && (
          <UserModal
            user={users.find(u => u.userId === selectedUser)}
            onClose={() => setSelectedUser(null)}
            onExport={exportAsPdf}
            onUpdate={handleUpdateUser}
            onDelete={handleDeleteUser}
          />
        )}

      </div>
    </Navbar>
  );
};

export default AdminUsers;
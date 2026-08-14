const express = require('express');
const router = express.Router();
const User = require("../models/user");
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { logSuccess, logFailed } = require("../utils/logHelper");

// Middleware to verify JWT from cookie
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

// Get all users (admin only)
router.get('/users', auth, async (req, res) => {
  try {
    if (!req.user.permissions || !req.user.permissions.includes('admin')) {
      await logFailed({
        module: 'Admin',
        userId: req.user.userId,
        userName: req.user.name,
        userEmail: req.user.email,
        action: 'Update',  // ✅ Using existing 'Update'
        heading: 'Access Denied',
        description: 'Non-admin user attempted to view all users'
      });
      return res.status(403).json({ message: 'Access denied. Admin required.' });
    }

    const users = await User.find({}).sort({ createdAt: -1 });

    const usersWithoutPasswords = users.map(user => {
      const userObj = user.toObject();
      delete userObj.password;
      return userObj;
    });

    await logSuccess({
      module: 'Admin',
      userId: req.user.userId,
      userName: req.user.name,
      userEmail: req.user.email,
      action: 'Update',  // ✅ Using existing 'Update'
      heading: 'Users Fetched Successfully',
      description: `Fetched ${usersWithoutPasswords.length} users`
    });

    res.json(usersWithoutPasswords);
  } catch (error) {
    console.error('Error fetching users:', error);

    await logFailed({
      module: 'Admin',
      userId: req.user.userId,
      userName: req.user.name,
      userEmail: req.user.email,
      action: 'Update',  // ✅ Using existing 'Update'
      heading: 'Fetch Users Failed',
      description: error.message || 'Unknown error occurred'
    });

    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Register new user (admin only)
router.post('/register', auth, async (req, res) => {
  try {
    if (!req.user.permissions || !req.user.permissions.includes('admin')) {
      await logFailed({
        module: 'Admin',
        userId: req.user.userId,
        userName: req.user.name,
        userEmail: req.user.email,
        action: 'Create',  // ✅ Using existing 'Create'
        heading: 'Access Denied',
        description: 'Non-admin user attempted to register new user'
      });
      return res.status(403).json({ message: 'Access denied. Admin required.' });
    }

    const { name, email, phone, password, permissions } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      await logFailed({
        module: 'Admin',
        userId: req.user.userId,
        userName: req.user.name,
        userEmail: req.user.email,
        action: 'Create',  // ✅ Using existing 'Create'
        heading: 'Registration Failed',
        description: `Email ${email} already registered`
      });
      return res.status(400).json({
        message: "Email already registered",
        field: "email"
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({
      name,
      email,
      phone,
      password: hashedPassword,
      permissions: permissions || []
    });

    const savedUser = await user.save();

    const userResponse = savedUser.toObject();
    delete userResponse.password;

    await logSuccess({
      module: 'Admin',
      userId: req.user.userId,
      userName: req.user.name,
      userEmail: req.user.email,
      action: 'Create',  // ✅ Using existing 'Create'
      heading: 'User Registered Successfully',
      description: `New user "${name}" (${email}) registered with permissions: ${permissions?.join(', ') || 'None'}`
    });

    res.status(201).json({
      message: "User registered successfully",
      user: {
        userId: userResponse.userId,
        name: userResponse.name,
        email: userResponse.email,
        phone: userResponse.phone,
        permissions: userResponse.permissions,
        createdAt: userResponse.createdAt
      }
    });
  } catch (error) {
    console.error("Registration error:", error);

    await logFailed({
      module: 'Admin',
      userId: req.user.userId,
      userName: req.user.name,
      userEmail: req.user.email,
      action: 'Create',  // ✅ Using existing 'Create'
      heading: 'Registration Failed',
      description: error.message || 'Unknown error occurred'
    });

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        message: "Validation error",
        error: error.message
      });
    }

    res.status(500).json({
      message: "Registration failed",
      error: error.message
    });
  }
});

// Update user (admin only)
router.put('/users/:userId', auth, async (req, res) => {
  try {
    if (!req.user.permissions || !req.user.permissions.includes('admin')) {
      await logFailed({
        module: 'Admin',
        userId: req.user.userId,
        userName: req.user.name,
        userEmail: req.user.email,
        action: 'Update',  // ✅ Using existing 'Update'
        heading: 'Access Denied',
        description: 'Non-admin user attempted to update user'
      });
      return res.status(403).json({ message: 'Access denied. Admin required.' });
    }

    const { userId } = req.params;
    const { name, email, phone, permissions, password } = req.body;

    const user = await User.findOne({ userId });
    if (!user) {
      await logFailed({
        module: 'Admin',
        userId: req.user.userId,
        userName: req.user.name,
        userEmail: req.user.email,
        action: 'Update',  // ✅ Using existing 'Update'
        heading: 'Update Failed',
        description: `User with ID ${userId} not found`
      });
      return res.status(404).json({ message: 'User not found' });
    }

    if (password && user.permissions && user.permissions.includes('admin')) {
      await logFailed({
        module: 'Admin',
        userId: req.user.userId,
        userName: req.user.name,
        userEmail: req.user.email,
        action: 'Update',  // ✅ Using existing 'Update'
        heading: 'Update Failed',
        description: `Attempted to update password for admin user ${user.name} (${user.email})`
      });
      return res.status(403).json({
        message: 'Cannot update password for admin users'
      });
    }

    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser && existingUser.userId !== userId) {
        await logFailed({
          module: 'Admin',
          userId: req.user.userId,
          userName: req.user.name,
          userEmail: req.user.email,
          action: 'Update',  // ✅ Using existing 'Update'
          heading: 'Update Failed',
          description: `Email ${email} already taken by another user`
        });
        return res.status(400).json({
          message: "Email already taken by another user",
          field: "email"
        });
      }
    }

    const oldName = user.name;
    const oldEmail = user.email;
    const oldPermissions = user.permissions;

    user.name = name || user.name;
    user.email = email || user.email;
    user.phone = phone || user.phone;
    user.permissions = permissions || user.permissions;

    let passwordUpdated = false;
    if (password && password.trim() !== '') {
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);
      passwordUpdated = true;
    }

    const updatedUser = await user.save();

    const userResponse = updatedUser.toObject();
    delete userResponse.password;

    let descriptionParts = [];
    if (name && name !== oldName) descriptionParts.push(`Name: ${oldName} → ${name}`);
    if (email && email !== oldEmail) descriptionParts.push(`Email: ${oldEmail} → ${email}`);
    if (permissions && JSON.stringify(permissions) !== JSON.stringify(oldPermissions)) {
      descriptionParts.push(`Permissions: ${oldPermissions?.join(', ') || 'None'} → ${permissions?.join(', ') || 'None'}`);
    }
    if (passwordUpdated) descriptionParts.push('Password updated');
    const description = descriptionParts.length > 0
      ? `Updated user ${user.name} (${user.email}): ${descriptionParts.join(', ')}`
      : `Updated user ${user.name} (${user.email})`;

    await logSuccess({
      module: 'Admin',
      userId: req.user.userId,
      userName: req.user.name,
      userEmail: req.user.email,
      action: 'Update',  // ✅ Using existing 'Update'
      heading: 'User Updated Successfully',
      description: description
    });

    res.json({
      message: "User updated successfully",
      user: {
        userId: userResponse.userId,
        name: userResponse.name,
        email: userResponse.email,
        phone: userResponse.phone,
        permissions: userResponse.permissions,
        createdAt: userResponse.createdAt,
        updatedAt: userResponse.updatedAt
      }
    });
  } catch (error) {
    console.error("Update error:", error);

    await logFailed({
      module: 'Admin',
      userId: req.user.userId,
      userName: req.user.name,
      userEmail: req.user.email,
      action: 'Update',  // ✅ Using existing 'Update'
      heading: 'Update Failed',
      description: error.message || 'Unknown error occurred'
    });

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        message: "Validation error",
        error: error.message
      });
    }

    res.status(500).json({
      message: "Update failed",
      error: error.message
    });
  }
});

// Delete user (admin only)
router.delete('/users/:userId', auth, async (req, res) => {
  try {
    if (!req.user.permissions || !req.user.permissions.includes('admin')) {
      await logFailed({
        module: 'Admin',
        userId: req.user.userId,
        userName: req.user.name,
        userEmail: req.user.email,
        action: 'Delete',  // ✅ Using existing 'Delete'
        heading: 'Access Denied',
        description: 'Non-admin user attempted to delete user'
      });
      return res.status(403).json({ message: 'Access denied. Admin required.' });
    }

    const { userId } = req.params;

    if (userId === req.user.userId) {
      await logFailed({
        module: 'Admin',
        userId: req.user.userId,
        userName: req.user.name,
        userEmail: req.user.email,
        action: 'Delete',  // ✅ Using existing 'Delete'
        heading: 'Delete Failed',
        description: 'Attempted to delete own account'
      });
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    const userToDelete = await User.findOne({ userId });
    if (!userToDelete) {
      await logFailed({
        module: 'Admin',
        userId: req.user.userId,
        userName: req.user.name,
        userEmail: req.user.email,
        action: 'Delete',  // ✅ Using existing 'Delete'
        heading: 'Delete Failed',
        description: `User with ID ${userId} not found`
      });
      return res.status(404).json({ message: 'User not found' });
    }

    await User.findOneAndDelete({ userId });

    await logSuccess({
      module: 'Admin',
      userId: req.user.userId,
      userName: req.user.name,
      userEmail: req.user.email,
      action: 'Delete',  // ✅ Using existing 'Delete'
      heading: 'User Deleted Successfully',
      description: `User "${userToDelete.name}" (${userToDelete.email}) deleted by ${req.user.name}`
    });

    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Delete error:", error);

    await logFailed({
      module: 'Admin',
      userId: req.user.userId,
      userName: req.user.name,
      userEmail: req.user.email,
      action: 'Delete',  // ✅ Using existing 'Delete'
      heading: 'Delete Failed',
      description: error.message || 'Unknown error occurred'
    });

    res.status(500).json({
      message: "Delete failed",
      error: error.message
    });
  }
});

module.exports = router;
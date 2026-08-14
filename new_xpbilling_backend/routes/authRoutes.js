const express = require("express");
const router = express.Router();
const User = require("../models/user");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { logSuccess, logFailed } = require("../utils/logHelper");

// Helper function to set cookie with token
const setTokenCookie = (res, token) => {
  res.cookie('token', token, {
    httpOnly: true,        // Prevents XSS attacks
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    // sameSite: 'none',
    sameSite: 'strict',    
    maxAge: 10 * 60 * 60 * 1000 // 10 hours in milliseconds
  });
};

// POST /register - Register new user
router.post("/register", async (req, res) => {
  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email: req.body.email });
    if (existingUser) {
      await logFailed({
        module: 'Admin',
        userId: 'SYSTEM',
        userName: 'SYSTEM',
        userEmail: 'SYSTEM',
        action: 'Create',
        heading: 'Registration Failed',
        description: `Email ${req.body.email} already registered`
      });
      return res.status(400).json({
        message: "Email already registered",
        field: "email"
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(req.body.password, salt);

    // Create new user
    const user = new User({
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      password: hashedPassword
    });

    const savedUser = await user.save();

    // Create JWT token
    const token = jwt.sign(
      { userId: savedUser.userId },
      process.env.JWT_SECRET,
      { expiresIn: "10h" }
    );

    // Set cookie with token
    setTokenCookie(res, token);

    await logSuccess({
      module: 'Admin',
      userId: savedUser.userId,
      userName: savedUser.name,
      userEmail: savedUser.email,
      action: 'Create',
      heading: 'User Registered Successfully',
      description: `User "${savedUser.name}" (${savedUser.email}) registered successfully`
    });

    res.status(201).json({
      message: "User registered successfully",
      user: {
        userId: savedUser.userId,
        name: savedUser.name,
        email: savedUser.email,
        phone: savedUser.phone,
        permissions: savedUser.permissions || []
      }
    });
  } catch (error) {
    console.error("Registration error:", error);

    await logFailed({
      module: 'Admin',
      userId: 'SYSTEM',
      userName: 'SYSTEM',
      userEmail: 'SYSTEM',
      action: 'Create',
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

// POST /login - Authenticate user
router.post("/login", async (req, res) => {
  try {
    // Find user by email
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      await logFailed({
        module: 'Admin',
        userId: 'SYSTEM',
        userName: 'SYSTEM',
        userEmail: 'SYSTEM',
        action: 'Update',
        heading: 'Login Failed',
        description: `Invalid login attempt for email: ${req.body.email}`
      });
      return res.status(401).json({
        message: "Invalid credentials",
        field: "email"
      });
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(req.body.password, user.password);
    if (!isMatch) {
      await logFailed({
        module: 'Admin',
        userId: user.userId,
        userName: user.name,
        userEmail: user.email,
        action: 'Update',
        heading: 'Login Failed',
        description: `User "${user.name}" (${user.email}) failed login attempt - invalid password`
      });
      return res.status(401).json({
        message: "Invalid credentials",
        field: "password"
      });
    }

    // Create JWT token
    const token = jwt.sign(
      { userId: user.userId },
      process.env.JWT_SECRET,
      { expiresIn: "10h" }
    );

    // Set cookie with token
    setTokenCookie(res, token);

    await logSuccess({
      module: 'Admin',
      userId: user.userId,
      userName: user.name,
      userEmail: user.email,
      action: 'Update',
      heading: 'Login Successful',
      description: `User "${user.name}" (${user.email}) logged in successfully`
    });

    res.status(200).json({
      message: "Login successful",
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        phone: user.phone,
        permissions: user.permissions || []
      }
    });
  } catch (error) {
    console.error("Login error:", error);

    await logFailed({
      module: 'Admin',
      userId: 'SYSTEM',
      userName: 'SYSTEM',
      userEmail: 'SYSTEM',
      action: 'Update',
      heading: 'Login Failed',
      description: error.message || 'Unknown error occurred'
    });

    res.status(500).json({
      message: "Login failed",
      error: error.message
    });
  }
});

// POST /logout - Clear the cookie
router.post("/logout", async (req, res) => {
  try {
    // Get user info from cookie before clearing
    let userId = 'SYSTEM';
    let userName = 'SYSTEM';
    let userEmail = 'SYSTEM';

    try {
      const token = req.cookies.token;
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findOne({ userId: decoded.userId });
        if (user) {
          userId = user.userId;
          userName = user.name;
          userEmail = user.email;
        }
      }
    } catch (e) {
      // Ignore token verification errors during logout
    }

    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
      // sameSite: 'none'
    });

    await logSuccess({
      module: 'Admin',
      userId: userId,
      userName: userName,
      userEmail: userEmail,
      action: 'Update',
      heading: 'Logout Successful',
      description: `User "${userName}" (${userEmail}) logged out successfully`
    });

    res.status(200).json({
      message: "Logged out successfully"
    });
  } catch (error) {
    console.error("Logout error:", error);

    await logFailed({
      module: 'Admin',
      userId: 'SYSTEM',
      userName: 'SYSTEM',
      userEmail: 'SYSTEM',
      action: 'Update',
      heading: 'Logout Failed',
      description: error.message || 'Unknown error occurred'
    });

    res.status(500).json({
      message: "Logout failed",
      error: error.message
    });
  }
});

// GET /me - Get current user profile (protected route)
router.get("/me", async (req, res) => {
  try {
    // Get token from cookie instead of Authorization header
    const token = req.cookies.token;

    if (!token) {
      await logFailed({
        module: 'Admin',
        userId: 'SYSTEM',
        userName: 'SYSTEM',
        userEmail: 'SYSTEM',
        action: 'Update',
        heading: 'Profile Fetch Failed',
        description: 'No token provided - unauthorized access attempt'
      });
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findOne({ userId: decoded.userId });

    if (!user) {
      await logFailed({
        module: 'Admin',
        userId: 'SYSTEM',
        userName: 'SYSTEM',
        userEmail: 'SYSTEM',
        action: 'Update',
        heading: 'Profile Fetch Failed',
        description: `User not found for token: ${decoded.userId}`
      });
      return res.status(404).json({ message: 'User not found' });
    }

    await logSuccess({
      module: 'Admin',
      userId: user.userId,
      userName: user.name,
      userEmail: user.email,
      action: 'Update',
      heading: 'Profile Fetched Successfully',
      description: `User "${user.name}" (${user.email}) fetched their profile`
    });

    res.status(200).json({
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        phone: user.phone,
        permissions: user.permissions || []
      }
    });
  } catch (error) {
    console.error("Get profile error:", error);

    await logFailed({
      module: 'Admin',
      userId: 'SYSTEM',
      userName: 'SYSTEM',
      userEmail: 'SYSTEM',
      action: 'Update',
      heading: 'Profile Fetch Failed',
      description: error.message || 'Invalid token or unknown error'
    });

    res.status(401).json({
      message: "Invalid token",
      error: error.message
    });
  }
});

module.exports = router;
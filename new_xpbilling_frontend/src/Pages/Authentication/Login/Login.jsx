import { useFormik } from "formik";
import * as Yup from "yup";
import { useState } from "react";
import { FiMail, FiLock, FiEye, FiEyeOff } from "react-icons/fi";
import { ToastContainer, toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "./Login.scss";
import logo from "../../../assets/logo/jass_logo_new.png";
import "react-toastify/dist/ReactToastify.css";

const Login = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  // Axios instance with credentials included
  const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
    withCredentials: true, // THIS IS CRUCIAL - sends cookies automatically!
  });

  const formik = useFormik({
    initialValues: { email: "", password: "" },
    validationSchema: Yup.object({
      email: Yup.string().email("Invalid email address").required("Email is required"),
      password: Yup.string().required("Password is required"),
    }),
    onSubmit: async (values) => {
      try {
        setIsSubmitting(true);

        // NO localStorage - cookie handles everything!
        const response = await api.post("/auth/login", values);

        // The cookie is automatically set by the server
        // We just get the user data from response
        console.log("Login successful:", response.data.user);

        // Store user data in state or context (NOT localStorage)
        // You can use React Context, Redux, or just keep in component state
        // For now, we'll just show success
        toast.success("Login successful! Redirecting...", {
          position: "top-center",
          autoClose: 2000
        });

        setTimeout(() => navigate("/"), 2000);
      } catch (error) {
        console.error("Login error:", error);
        let errorMessage = "Login failed";
        if (error.response) errorMessage = error.response.data.message || errorMessage;
        toast.error(errorMessage, { position: "top-center", autoClose: 3000 });
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  const handleSwitchToRegister = () => navigate("/register");

  return (
    <div className="login-container">
      <ToastContainer />
      <div className="login-wrapper">
        {/* LEFT: welcome text */}
        <div className="login-left">
          <div className="left-inner">
            <img src={logo} alt="Logo" className="left-logo" />
            <h1 className="welcome-title">Welcome Back</h1>
            <div className="divider" />
            <p className="welcome-desc">
              From essence to invoice — streamline every step of your perfume and attar business. Log in to keep your fragrances flowing and your operations effortless.
            </p>
            {/* Check if user is logged in via cookie */}
            {/* You'll need a way to check if cookie exists - we'll handle this with a /me endpoint */}
          </div>
        </div>

        {/* RIGHT: decorative background panel + glass form on top */}
        <div className="login-right">
          <div className="form-bg" aria-hidden="true" />

          <div className="glass-card">
            <h2 className="login-title">Sign in</h2>
            <p className="login-subtitle">Enter your credentials below</p>

            <form onSubmit={formik.handleSubmit} className="login-form">
              <div className="form-group">
                <label htmlFor="email" className="form-label">
                  <FiMail className="input-icon" />
                  Email Address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  value={formik.values.email}
                  className={`form-input ${formik.touched.email && formik.errors.email ? "error" : ""}`}
                  autoComplete="username"
                />
                {formik.touched.email && formik.errors.email ? <div className="error-message">{formik.errors.email}</div> : null}
              </div>

              <div className="form-group">
                <label htmlFor="password" className="form-label">
                  <FiLock className="input-icon" />
                  Password
                </label>
                <div className="password-input-container">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    value={formik.values.password}
                    className={`form-input ${formik.touched.password && formik.errors.password ? "error" : ""}`}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <FiEyeOff /> : <FiEye />}
                  </button>
                </div>
                {formik.touched.password && formik.errors.password ? <div className="error-message">{formik.errors.password}</div> : null}
              </div>

              <button type="submit" className="submit-button" disabled={isSubmitting}>
                {isSubmitting ? "Logging in..." : "Submit"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
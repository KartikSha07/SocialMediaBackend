const bcrypt = require("bcrypt");
const User = require("../models/userModel");
const jwt = require("jsonwebtoken");
const { success, failure: error } = require("../utils/responseStatus");

const generateAccessToken = (data) => {
  return jwt.sign(data, process.env.JWT_SECRET, { expiresIn: "1d" });
};

const generateRefreshToken = (data) => {
  return jwt.sign(data, process.env.REFRESH_KEY, { expiresIn: "2d" });
};

const signUpController = async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json(error(400, "Email, Name and Password are required"));
    }

    const user = await User.findOne({ email });
    if (user) return res.status(409).json(error(409, "User is already registered"));

    const hashedPwd = await bcrypt.hash(password, 10);
    const newUser = new User({ email, password: hashedPwd, name });
    const savedUser = await newUser.save();
    return res.status(201).json(success(201, savedUser));
  } catch (e) {
    console.error("Signup error:", e.message);
    return res.status(500).json(error(500, "Internal Server Error"));
  }
};

const loginController = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json(error(400, "Email and Password are required"));
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json(error(401, "User not registered"));

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json(error(401, "Invalid Password"));

    const accessToken = generateAccessToken({ id: user._id });
    const refreshToken = generateRefreshToken({ id: user._id });

    res.cookie("jwt", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // only HTTPS in prod
      sameSite: "lax",
    });

    return res.status(200).json(success(200, { "user-email": user.email, accessToken }));
  } catch (e) {
    console.error("Login error:", e.message);
    return res.status(500).json(error(500, "Internal Server Error"));
  }
};

const logoutController = async (req, res) => {
  try {
    res.clearCookie("jwt", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });
    return res.status(200).json(success(200, "Logged Out"));
  } catch (e) {
    return res.status(500).json(error(500, "Internal Server Error"));
  }
};

const refreshTokenController = async (req, res) => {
  const cookie = req.cookies;
  if (!cookie.jwt) return res.status(401).json(error(401, "No Refresh Token Found"));

  try {
    const decoded = jwt.verify(cookie.jwt, process.env.REFRESH_KEY);
    const accessToken = generateAccessToken({ id: decoded.id });
    return res.status(201).json(success(201, { accessToken }));
  } catch (err) {
    console.error("Refresh error:", err.message);
    return res.status(401).json(error(401, "Invalid token"));
  }
};

module.exports = {
  loginController,
  logoutController,
  signUpController,
  refreshTokenController,
};

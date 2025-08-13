// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const { success, failure: error } = require('../utils/responseStatus');
const User = require('../models/userModel');

const authChecker = async (req, res, next) => {
  if (!req.headers?.authorization?.startsWith("Bearer ")) {
    return res.status(401).json(error(401, "Not Authorized without token"));
  }

  const accessToken = req.headers.authorization.split(" ")[1];
  try {
    const decoded = jwt.verify(accessToken, process.env.JWT_SECRET);
    req.id = decoded.id;
    const user = await User.findById(req.id);
    if (!user) {
      return res.status(403).json(error(403, "User not found"));
    }
    next();
  } catch (err) {
    console.error("JWT error:", err.message);
    return res.status(401).json(error(401, "Invalid token"));
  }
};

module.exports = { authChecker };

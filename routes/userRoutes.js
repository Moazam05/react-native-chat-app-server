const express = require("express");
// Custom Imports
const authController = require("../controllers/authController");
const userController = require("../controllers/userController");

const router = express.Router();

// AUTH ROUTES
router.post("/signup", authController.signup);
router.post("/login", authController.login);
router.get("/logout", authController.protect, authController.logout);

// Protected routes
router.use(authController.protect);

// USER ROUTES
router.put("/updateMe", userController.updateMe);
router.get("/", userController.getAllUsers);

module.exports = router;

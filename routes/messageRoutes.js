const express = require("express");
const messageController = require("../controllers/messageController");
const authController = require("../controllers/authController");

const router = express.Router();

// Protect all routes
router.use(authController.protect);

// Message routes
router.post("/:chatId", messageController.sendMessage);
router.get("/:chatId", messageController.getMessages);
router.put("/:messageId/read", messageController.markAsRead);

module.exports = router;

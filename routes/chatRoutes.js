const express = require("express");
const chatController = require("../controllers/chatController");
const authController = require("../controllers/authController");

const router = express.Router();

router.use(authController.protect);

router.post("/", chatController.accessChat); // Create or access 1-on-1 chat
router.get("/", chatController.fetchChats); // Fetch all chats
router.get("/user-chats", chatController.fetchUserChats); // Fetch all chats for a user

router.post("/group", chatController.createGroupChat);
router.put("/group/:chatId", chatController.updateGroupChat);
router.delete("/group/:chatId", chatController.removeFromGroup);
router.post("/group/:chatId/add", chatController.addToGroup);

module.exports = router;

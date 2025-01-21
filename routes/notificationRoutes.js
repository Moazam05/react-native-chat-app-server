const express = require("express");
const notificationController = require("../controllers/notificationController");

const router = express.Router();

router.post("/send", notificationController.createNotification);
router.post("/send-bulk", notificationController.createBulkNotification);

module.exports = router;

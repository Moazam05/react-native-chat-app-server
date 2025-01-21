const admin = require("firebase-admin");

const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const serviceAccount = require("../serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

exports.createNotification = catchAsync(async (req, res, next) => {
  const { token, title, body, data } = req.body;

  if (!token) {
    return next(new AppError("FCM token is required", 400));
  }

  const message = {
    notification: {
      title: title || "New Notification",
      body: body || "You have a new notification",
    },
    data: data || {},
    token: token,
  };

  try {
    const response = await admin.messaging().send(message);

    res.status(200).json({
      status: "success",
      data: {
        messageId: response,
        message: "Notification sent successfully",
      },
    });
  } catch (error) {
    return next(new AppError(error.message, 500));
  }
});

// Send notification to multiple devices
exports.createBulkNotification = catchAsync(async (req, res, next) => {
  const { tokens, title, body, data } = req.body;

  if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
    return next(new AppError("Valid FCM tokens array is required", 400));
  }

  const message = {
    notification: {
      title: title || "New Notification",
      body: body || "You have a new notification",
    },
    data: data || {},
    tokens: tokens,
  };

  try {
    const response = await admin.messaging().sendMulticast(message);

    res.status(200).json({
      status: "success",
      data: {
        successCount: response.successCount,
        failureCount: response.failureCount,
        responses: response.responses,
      },
    });
  } catch (error) {
    return next(new AppError(error.message, 500));
  }
});

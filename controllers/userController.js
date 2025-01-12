const multer = require("multer");
// Custom Imports
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const User = require("../models/userModel");
const cloudinary = require("../cloudinary");

// Configure multer storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 1024 * 1024 * 5, // 5MB
  },
}).single("avatar");

// Middleware to upload image
const handleFileUpload = (req, res, next) => {
  upload(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      return next(new AppError("File upload error", 400));
    } else if (err) {
      return next(new AppError("Something went wrong", 500));
    }
    next();
  });
};

exports.updateMe = [
  handleFileUpload,
  catchAsync(async (req, res, next) => {
    // 1) Check if user exists
    const user = await User.findById(req.user._id);
    if (!user) {
      return next(new AppError("No user found", 404));
    }

    // Create update object
    const updateData = {};

    // Add text fields if they exist
    if (req.body.username) updateData.username = req.body.username;

    // 2) Handle image upload if file exists
    if (req.file) {
      try {
        const fileStr = `data:${
          req.file.mimetype
        };base64,${req.file.buffer.toString("base64")}`;
        const result = await cloudinary.uploader.upload(fileStr, {
          folder: "react-native-chat-app",
          resource_type: "auto",
        });
        updateData.avatar = result.secure_url;
      } catch (error) {
        return next(new AppError("Error uploading to Cloudinary", 400));
      }
    }

    // 3) Update user
    const newUser = await User.findByIdAndUpdate(req.user._id, updateData, {
      new: true,
      runValidators: true,
    });

    newUser.password = undefined;

    // 4) Send Response
    res.status(200).json({
      status: "success",
      data: {
        user: newUser,
      },
    });
  }),
];

exports.getAllUsers = catchAsync(async (req, res, next) => {
  const query = req.query.search;
  const currentUserId = req.user._id.toString();

  // User search based on username or email
  let filter = { _id: { $ne: currentUserId } };

  if (query) {
    filter = {
      $or: [
        { username: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } },
      ],
    };
  }

  let users = await User.find(filter);

  // Remove current user from response
  users = users.filter((user) => user._id.toString() !== currentUserId);

  // Remove password from response
  users.forEach((user) => {
    user.password = undefined;
  });

  res.status(200).json({
    status: "success",
    results: users.length,
    users,
  });
});

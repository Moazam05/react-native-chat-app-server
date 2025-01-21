const jwt = require("jsonwebtoken");
const { promisify } = require("util");
// Custom Imports
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const User = require("../models/userModel");

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);

  // Remove password from output
  user.password = undefined;

  res.status(statusCode).json({
    status: "success",
    token,
    data: {
      user,
    },
  });
};

exports.signup = catchAsync(async (req, res, next) => {
  const newUser = await User.create({
    username: req.body.username,
    email: req.body.email,
    password: req.body.password,
  });

  createSendToken(newUser, 201, res);
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  // 1) Check if email and password exist
  if (!email || !password) {
    return next(new AppError("Please provide email and password", 400));
  }

  // 2) Check if user exists && password is exist
  const user = await User.findOne({ email }).select("+password");
  if (!user) {
    return next(new AppError("User not found", 404));
  }

  // 3) Check if password is correct
  const correct = await user.correctPassword(password, user.password);
  if (!correct) {
    return next(new AppError("Incorrect password", 401));
  }

  // Update user's online status
  await User.findByIdAndUpdate(user._id, {
    isOnline: true,
    lastSeen: new Date(),
  });

  // Emit socket event for user online status
  const io = req.app.get("io");
  if (io) {
    io.emit("user online", user._id);
  }

  // 4) If everything ok, send token to client
  createSendToken(user, 200, res);
});

exports.logout = catchAsync(async (req, res, next) => {
  if (!req.user || !req.user._id) {
    return next(new AppError("No authenticated user found", 401));
  }

  try {
    await User.findByIdAndUpdate(req.user._id, {
      isOnline: false,
      lastSeen: new Date(),
    });

    // Emit socket event for user offline status
    const io = req.app.get("io");
    if (io) {
      io.emit("user offline", req.user._id);
    }

    res.status(200).json({
      status: "success",
      message: "Logged out successfully",
    });
  } catch (error) {
    return next(new AppError("Error during logout process", 500));
  }
});

exports.protect = catchAsync(async (req, res, next) => {
  // 1) Getting token and check if it's there
  let token;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer")) {
    token = authHeader.split(" ")[1];

    // Check if token is empty or malformed
    if (!token || token === "null" || token === "undefined") {
      return next(new AppError("Invalid token. Please log in again.", 401));
    }

    try {
      // 2) Verify token
      const decoded = await promisify(jwt.verify)(
        token,
        process.env.JWT_SECRET
      );

      // 3) Check if user still exists
      const currentUser = await User.findById(decoded.id);
      if (!currentUser) {
        return next(
          new AppError(
            "The user belonging to this token no longer exists.",
            401
          )
        );
      }

      // GRANT ACCESS TO PROTECTED ROUTE
      req.user = currentUser;
      next();
    } catch (error) {
      // Handle specific JWT errors
      if (error.name === "JsonWebTokenError") {
        return next(new AppError("Invalid token. Please log in again.", 401));
      }
      if (error.name === "TokenExpiredError") {
        return next(
          new AppError("Your token has expired. Please log in again.", 401)
        );
      }
      return next(error);
    }
  } else {
    return next(
      new AppError("You are not logged in! Please log in to get access.", 401)
    );
  }
});

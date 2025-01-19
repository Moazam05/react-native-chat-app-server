const AppError = require("../utils/appError");
const fs = require("fs");
const path = require("path");

// Ensure logs directory exists
const logsDir = path.join(__dirname, "..", "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Error handlers
const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new AppError(message, 400);
};

const handleDuplicateFieldsDB = (err) => {
  const message = `Duplicate field value: \"${err.keyValue.name}"\. Please use another value!`;
  return new AppError(message, 400);
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map((el) => el.message);
  const message = `Invalid input data. ${errors.join(". ")}`;
  return new AppError(message, 400);
};

const handleJWTError = () =>
  new AppError("Invalid token. Please login again!", 401);

const handleJWTExpiredError = () =>
  new AppError("Your token has expired! Please login again.", 401);

// Enhanced error logging for development
const sendErrorDev = (err, res) => {
  console.log("\n🔴 Development Error:");
  console.log("Time:", new Date().toISOString());
  console.log("Error Name:", err.name);
  console.log("Status Code:", err.statusCode);
  console.log("Message:", err.message);
  console.log("Stack:", err.stack);

  res.status(err.statusCode).json({
    status: err.status,
    error: err,
    message: err.message,
    stack: err.stack,
  });
};

// Enhanced error logging for production
const sendErrorProd = (err, res) => {
  const errorLog = {
    timestamp: new Date().toISOString(),
    name: err.name,
    statusCode: err.statusCode,
    message: err.message,
    isOperational: err.isOperational,
  };

  // Log error to file
  fs.appendFileSync(
    path.join(logsDir, "error.log"),
    JSON.stringify(errorLog) + "\n"
  );

  if (err.isOperational) {
    // Log operational errors
    console.log("\n🟡 Operational Error:");
    console.log(JSON.stringify(errorLog, null, 2));

    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });
  } else {
    // Log programming or unknown errors
    console.error("\n🔴 Programming Error:");
    console.error(
      JSON.stringify(
        {
          ...errorLog,
          stack: err.stack,
        },
        null,
        2
      )
    );

    res.status(500).json({
      status: "error",
      message: "Something went very wrong!",
    });
  }
};

// Main error handling middleware
module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  // Add request details to error log
  const requestInfo = {
    method: req.method,
    url: req.originalUrl,
    body: req.method !== "GET" ? req.body : undefined,
    params: req.params,
    query: req.query,
    timestamp: new Date().toISOString(),
  };

  console.log("\n📝 Request Information:");
  console.log(JSON.stringify(requestInfo, null, 2));

  if (process.env.NODE_ENV === "development") {
    sendErrorDev(err, res);
  } else if (process.env.NODE_ENV === "production") {
    let error = { ...err };
    error.message = err.message;
    error.name = err.name;

    if (error.name === "CastError") error = handleCastErrorDB(error);
    if (error.code === 11000) error = handleDuplicateFieldsDB(error);
    if (error.name === "ValidationError")
      error = handleValidationErrorDB(error);
    if (error.name === "JsonWebTokenError") error = handleJWTError();
    if (error.name === "TokenExpiredError") error = handleJWTExpiredError();

    sendErrorProd(error, res);
  }
};

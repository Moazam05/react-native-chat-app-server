const express = require("express");
const morgan = require("morgan");
const colors = require("colors");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

// Custom Imports
const AppError = require("./utils/appError");
const globalErrorHandler = require("./controllers/errorController");
const userRouter = require("./routes/userRoutes");
const chatRouter = require("./routes/chatRoutes");
const messageRouter = require("./routes/messageRoutes");
const notificationRouter = require("./routes/notificationRoutes");
const { formatTimestamp } = require("./utils");

// Ensure logs directory exists
const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Create write stream for access logs
const accessLogStream = fs.createWriteStream(path.join(logsDir, "access.log"), {
  flags: "a",
});

// CORS setup
const corsOptions = {
  origin: "*",
  methods: "*",
  allowedHeaders: "*",
};

const app = express();

// Static files and CORS
app.use(express.static(path.join(__dirname, "public")));
app.use(cors(corsOptions));

// Custom Morgan tokens
morgan.token("status-emoji", (req, res) => {
  return res.statusCode < 400 ? "✅" : "❌";
});

morgan.token("custom-timestamp", () => {
  return formatTimestamp(new Date());
});

morgan.token("short-agent", (req) => {
  return req.get("user-agent")?.split(" ")[0] || "Unknown Agent";
});

// Custom Morgan format
const customFormat = (tokens, req, res) => {
  // Save log message for production file logging
  if (process.env.NODE_ENV === "production") {
    const logMessage = {
      timestamp: tokens["custom-timestamp"](req, res),
      method: tokens.method(req, res),
      url: tokens.url(req, res),
      status: tokens.status(req, res),
      duration: `${tokens["response-time"](req, res)}ms`,
      userAgent: tokens["short-agent"](req, res),
    };

    fs.appendFileSync(
      path.join(logsDir, "responses.log"),
      JSON.stringify(logMessage) + "\n"
    );
  }

  return [
    `${tokens["status-emoji"](req, res)} ${tokens["custom-timestamp"](
      req,
      res
    )}`,
    `🛣️  ${tokens.method(req, res)} ${tokens.url(req, res)} (${tokens.status(
      req,
      res
    )})`,
    `⏱️  ${tokens["response-time"](req, res)}ms | ${tokens["short-agent"](
      req,
      res
    )}\n`,
  ].join("\n");
};

// Logging setup
if (process.env.NODE_ENV === "production") {
  app.use(morgan("combined", { stream: accessLogStream })); // File logging
}
app.use(morgan(customFormat)); // Console logging with custom format

// Body parser
app.use(express.json({ limit: "1mb" }));

// API Routes
app.use("/api/v1/users", userRouter);
app.use("/api/v1/chats", chatRouter);
app.use("/api/v1/messages", messageRouter);
app.use("/api/v1/notifications", notificationRouter);

// Health Check
app.get("/", (req, res) => {
  const healthCheck = {
    uptime: process.uptime(),
    message: "Chat Socket io App API is running...",
    timestamp: new Date().toISOString(),
  };
  res.send(healthCheck);
});

// 404 Handler
app.all("*", (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Global Error Handler
app.use(globalErrorHandler);

// Error logging for uncaught exceptions and unhandled rejections
const logError = (type, error) => {
  const errorLog = {
    timestamp: new Date().toISOString(),
    type,
    error: error.message,
    stack: error.stack,
  };

  console.error(`💥 ${type}:`, error);

  if (process.env.NODE_ENV === "production") {
    fs.appendFileSync(
      path.join(logsDir, `${type.toLowerCase()}.log`),
      JSON.stringify(errorLog) + "\n"
    );
  }
};

// Uncaught Exception Handler
process.on("uncaughtException", (error) => {
  logError("UncaughtException", error);
});

// Unhandled Rejection Handler
process.on("unhandledRejection", (error) => {
  logError("UnhandledRejection", error);
});

module.exports = app;

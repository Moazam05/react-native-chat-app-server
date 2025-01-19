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

// Ensure logs directory exists
const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Create write stream for access logs
const accessLogStream = fs.createWriteStream(path.join(logsDir, "access.log"), {
  flags: "a",
});

const corsOptions = {
  origin: "*",
  methods: "*",
  allowedHeaders: "*",
};

const app = express();
app.use(cors(corsOptions));

// Enhanced logging setup
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  // Production logging
  app.use(morgan("combined", { stream: accessLogStream }));

  // Console logging with timestamp
  app.use(
    morgan((tokens, req, res) => {
      return [
        "🌐",
        new Date().toISOString(),
        tokens.method(req, res),
        tokens.url(req, res),
        tokens.status(req, res),
        tokens["response-time"](req, res),
        "ms",
      ].join(" ");
    })
  );
}

app.use(express.json({ limit: "1mb" }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();

  // Add timestamp to request
  req.requestTime = new Date().toISOString();

  // Log request details
  if (process.env.NODE_ENV === "production") {
    const requestLog = {
      timestamp: req.requestTime,
      method: req.method,
      url: req.originalUrl,
      body: req.method !== "GET" ? req.body : undefined,
      headers: req.headers,
      ip: req.ip,
    };

    // Log to file
    fs.appendFileSync(
      path.join(logsDir, "requests.log"),
      JSON.stringify(requestLog) + "\n"
    );
  }

  // Log response
  res.on("finish", () => {
    const duration = Date.now() - start;
    const logMessage = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get("user-agent"),
    };

    if (process.env.NODE_ENV === "production") {
      // Log to file
      fs.appendFileSync(
        path.join(logsDir, "responses.log"),
        JSON.stringify(logMessage) + "\n"
      );
    }

    // Console log with emoji based on status code
    const emoji = res.statusCode < 400 ? "✅" : "❌";
    console.log(`${emoji} ${JSON.stringify(logMessage)}`);
  });

  next();
});

// API Routes
app.use("/api/v1/users", userRouter);
app.use("/api/v1/chats", chatRouter);
app.use("/api/v1/messages", messageRouter);

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

// Uncaught Exception Handler
process.on("uncaughtException", (error) => {
  const errorLog = {
    timestamp: new Date().toISOString(),
    type: "UncaughtException",
    error: error.message,
    stack: error.stack,
  };

  console.error("💥 UNCAUGHT EXCEPTION:", error);

  if (process.env.NODE_ENV === "production") {
    fs.appendFileSync(
      path.join(logsDir, "uncaught-exceptions.log"),
      JSON.stringify(errorLog) + "\n"
    );
  }
});

// Unhandled Rejection Handler
process.on("unhandledRejection", (error) => {
  const errorLog = {
    timestamp: new Date().toISOString(),
    type: "UnhandledRejection",
    error: error.message,
    stack: error.stack,
  };

  console.error("💥 UNHANDLED REJECTION:", error);

  if (process.env.NODE_ENV === "production") {
    fs.appendFileSync(
      path.join(logsDir, "unhandled-rejections.log"),
      JSON.stringify(errorLog) + "\n"
    );
  }
});

module.exports = app;

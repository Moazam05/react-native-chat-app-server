const mongoose = require("mongoose");
require("dotenv").config();
// Custom Imports
const app = require("./app");
const initSocket = require("./socket");

process.on("uncaughtException", (err) => {
  console.log("UNCAUGHT EXCEPTION! 💥 Shutting down...");
  console.log(err.name, err.message);

  process.exit(1);
});

const dbURI = process.env.DATABASE;

mongoose.connect(dbURI);

const db = mongoose.connection;

db.on("error", (error) => {
  console.error("Connection error:", error);
});

db.once("open", () => {
  console.log(`Connected to MongoDB`.cyan.underline.bold);
  console.log("Environment:", `${process.env.NODE_ENV}`.yellow);
});

console.log("HI");

const port = process.env.PORT || 8000;
const server = app.listen(port, () => {
  console.log(`Server in running on port ${port}`);
});

// INITIALIZE SOCKET.IO
const io = initSocket(server);
app.set("io", io);

process.on("unhandledRejection", (err) => {
  console.log("UNHANDLED REJECTION! 💥 Shutting down...");
  console.log(err.name, err.message);

  server.close(() => {
    process.exit(1);
  });
});

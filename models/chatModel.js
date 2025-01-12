const mongoose = require("mongoose");
const validator = require("validator");

const chatSchema = new mongoose.Schema(
  {
    chatName: {
      type: String,
      trim: true,
      required: [true, "Chat name is required"],
    },
    isGroupChat: {
      type: Boolean,
      default: false,
    },
    users: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    latestMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    groupAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    // For group chats settings
    groupSettings: {
      notifications: {
        type: Boolean,
        default: true,
      },
      description: String,
      avatar: {
        type: String,
        default:
          "https://icon-library.com/images/default-group-icon/default-group-icon-13.jpg",
      },
    },
    // For tracking who left the chat (useful for group chats)
    leftUsers: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        leftAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Add indexes for better query performance
chatSchema.index({ users: 1 });
chatSchema.index({ isGroupChat: 1 });

// Middleware to ensure at least 2 users in a chat
chatSchema.pre("save", function (next) {
  if (this.users.length < 2) {
    next(new Error("Chat must have at least 2 users"));
  }
  next();
});

// Custom methods
chatSchema.methods.addUser = function (userId) {
  if (!this.users.includes(userId)) {
    this.users.push(userId);
  }
  return this.save();
};

chatSchema.methods.removeUser = function (userId) {
  this.users = this.users.filter((id) => !id.equals(userId));
  this.leftUsers.push({
    user: userId,
    leftAt: Date.now(),
  });
  return this.save();
};

chatSchema.methods.updateLatestMessage = function (messageId) {
  this.latestMessage = messageId;
  return this.save();
};

const Chat = mongoose.model("Chat", chatSchema);
module.exports = Chat;

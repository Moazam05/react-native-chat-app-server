const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: [true, "Message must belong to a chat"],
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Message must have a sender"],
    },
    content: {
      type: String,
      trim: true,
      required: [true, "Message must have a content"],
    },
    messageType: {
      type: String,
      enum: ["text", "image", "document"],
      default: "text",
    },
    fileUrl: {
      type: String,
      // Required only if messageType is image or document
      required: function () {
        return ["image", "document"].includes(this.messageType);
      },
    },
    fileName: String,
    fileSize: Number,
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
messageSchema.index({ chatId: 1, createdAt: -1 });

// After saving message, update latest message in chat
messageSchema.post("save", async function () {
  await this.model("Chat").findByIdAndUpdate(this.chatId, {
    latestMessage: this._id,
  });
});

const Message = mongoose.model("Message", messageSchema);
module.exports = Message;

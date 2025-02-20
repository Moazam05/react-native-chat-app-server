const Chat = require("../models/chatModel");
const Message = require("../models/messageModel");
const User = require("../models/userModel");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");

exports.accessChat = catchAsync(async (req, res, next) => {
  const { userId } = req.body;

  if (!userId) {
    return next(new AppError("UserId param not sent with request", 400));
  }

  // Check if chat exists between these two users
  let chat = await Chat.findOne({
    isGroupChat: false,
    users: {
      $all: [req.user._id, userId],
    },
  })
    .populate("users", "-password")
    .populate("latestMessage");

  // If exists, return it
  if (chat) {
    res.status(200).json({
      status: "success",
      data: { chat },
    });
  } else {
    // If not exists, create new chat
    const newChat = await Chat.create({
      chatName: "sender",
      isGroupChat: false,
      users: [req.user._id, userId],
    });

    const fullChat = await Chat.findById(newChat._id).populate(
      "users",
      "-password"
    );

    res.status(200).json({
      status: "success",
      data: { chat: fullChat },
    });
  }
});

exports.createGroupChat = catchAsync(async (req, res, next) => {
  const { users, name } = req.body;

  if (!users || !name) {
    return next(new AppError("Please fill all the fields", 400));
  }

  // Parse string back to array if sent as string
  let userArray = typeof users === "string" ? JSON.parse(users) : users;

  if (userArray.length < 2) {
    return next(
      new AppError("More than 2 users required to form a group chat", 400)
    );
  }

  // Add current user to group
  userArray.push(req.user._id);

  const groupChat = await Chat.create({
    chatName: name,
    users: userArray,
    isGroupChat: true,
    groupAdmin: req.user._id,
  });

  const fullGroupChat = await Chat.findById(groupChat._id)
    .populate("users", "-password")
    .populate("groupAdmin", "-password");

  res.status(201).json({
    status: "success",
    data: { chat: fullGroupChat },
  });
});

exports.updateGroupChat = catchAsync(async (req, res, next) => {
  const { chatName } = req.body;
  const { chatId } = req.params;

  const chat = await Chat.findById(chatId);

  if (!chat) {
    return next(new AppError("Chat not found", 404));
  }

  // Only admin can update group
  if (chat.groupAdmin.toString() !== req.user._id.toString()) {
    return next(new AppError("Only admin can update group", 403));
  }

  const updatedChat = await Chat.findByIdAndUpdate(
    chatId,
    { chatName },
    { new: true }
  )
    .populate("users", "-password")
    .populate("groupAdmin", "-password");

  res.status(200).json({
    status: "success",
    data: { chat: updatedChat },
  });
});

exports.removeFromGroup = catchAsync(async (req, res, next) => {
  const { userId } = req.body;
  const { chatId } = req.params;

  const chat = await Chat.findById(chatId);

  if (!chat) {
    return next(new AppError("Chat not found", 404));
  }

  // Only admin can remove users
  if (chat.groupAdmin.toString() !== req.user._id.toString()) {
    return next(new AppError("Only admin can remove users", 403));
  }

  const updatedChat = await Chat.findByIdAndUpdate(
    chatId,
    {
      $pull: { users: userId },
      $push: {
        leftUsers: {
          user: userId,
          leftAt: Date.now(),
        },
      },
    },
    { new: true }
  )
    .populate("users", "-password")
    .populate("groupAdmin", "-password");

  res.status(200).json({
    status: "success",
    data: { chat: updatedChat },
  });
});

exports.addToGroup = catchAsync(async (req, res, next) => {
  const { userId } = req.body;
  const { chatId } = req.params;

  const chat = await Chat.findById(chatId);

  if (!chat) {
    return next(new AppError("Chat not found", 404));
  }

  // Only admin can add users
  if (chat.groupAdmin.toString() !== req.user._id.toString()) {
    return next(new AppError("Only admin can add users", 403));
  }

  const updatedChat = await Chat.findByIdAndUpdate(
    chatId,
    { $push: { users: userId } },
    { new: true }
  )
    .populate("users", "-password")
    .populate("groupAdmin", "-password");

  res.status(200).json({
    status: "success",
    data: { chat: updatedChat },
  });
});

exports.fetchUserChats = catchAsync(async (req, res, next) => {
  const chats = await Chat.find({
    users: { $elemMatch: { $eq: req.user._id } },
    leftUsers: {
      $not: {
        $elemMatch: { user: req.user._id },
      },
    },
  })
    .populate({
      path: "users",
      select: "username avatar isOnline lastSeen",
    })
    .select("chatName isGroupChat users latestMessage")
    .sort({ updatedAt: -1 });

  const chatPromises = chats.map(async (chat) => {
    const chatData = chat.toObject();

    // Get messages and count empty readBy arrays
    const [messages, lastMessage] = await Promise.all([
      // Get all messages for this chat
      Message.find({
        chatId: chat._id,
      }).select("readBy"),

      // Get latest message
      Message.findOne({ chatId: chat._id })
        .sort({ createdAt: -1 })
        .populate({
          path: "sender",
          select: "username avatar",
        })
        .select("content createdAt sender readBy messageType"),
    ]);

    // Count messages with empty readBy array
    const unreadCount = messages.filter(
      (msg) => msg.readBy.length === 0
    ).length;

    if (!chat.isGroupChat) {
      chatData.users = chat.users.filter(
        (user) => user._id.toString() !== req.user._id.toString()
      );
      chatData.chatName = chatData.users[0]?.username;
    }

    if (lastMessage) {
      chatData.latestMessage = lastMessage;
    }

    chatData.unreadCount = unreadCount;

    return chatData;
  });

  const formattedChats = await Promise.all(chatPromises);

  res.status(200).json({
    status: "success",
    results: formattedChats.length,
    data: {
      chats: formattedChats,
    },
  });
});

exports.getGroupInfo = catchAsync(async (req, res, next) => {
  const { chatId } = req.params;

  const chat = await Chat.findById(chatId)
    .populate("users", "-password")
    .populate("groupAdmin", "-password");

  if (!chat) {
    return next(new AppError("Chat not found", 404));
  }

  res.status(200).json({
    status: "success",
    data: { chat },
  });
});

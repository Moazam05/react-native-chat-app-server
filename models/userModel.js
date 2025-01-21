const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      minlength: 3,
      unique: true,
      required: [true, "Please tell us your username!"],
    },
    email: {
      type: String,
      unique: true,
      lowercase: true,
      required: [true, "Please provide your email"],
      validate: [validator.isEmail, "Please provide a valid email"],
    },
    password: {
      type: String,
      minlength: 6,
      required: [true, "Please provide a password"],
    },
    avatar: {
      type: String,
      default:
        "https://icon-library.com/images/anonymous-avatar-icon/anonymous-avatar-icon-25.jpg",
    },
    fcmToken: {
      type: String,
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Password Hashing
userSchema.pre("save", async function (next) {
  // Only hash the password if it is new or has been modified
  if (!this.isModified("password")) return next();

  // Hash the password with cost of 12
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// instance method
userSchema.methods.correctPassword = async function (
  candidatePassword,
  userPassword
) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

// Find user by email (static method)
userSchema.statics.findByEmail = function (email) {
  return this.findOne({ email });
};

// Update last seen
userSchema.methods.updateLastSeen = function () {
  this.lastSeen = Date.now();
  return this.save();
};

userSchema.methods.updateFCMToken = function (fcmToken) {
  this.fcmToken = fcmToken;
  return this.save();
};

const User = new mongoose.model("User", userSchema);
module.exports = User;

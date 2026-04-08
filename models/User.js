const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const studyKitSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Name is required"], trim: true },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
    },
    savedContent: { type: String, default: "" },
    studyKits: { type: [studyKitSchema], default: [] },
    activeKitId: { type: String, default: null },
    planProgress: {
      type: Map,
      of: [{ taskId: String, done: { type: Boolean, default: false } }],
      default: {},
    },
    preferences: {
      theme: { type: String, default: "light" },
      fontSize: { type: String, default: "medium" },
    },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model("User", userSchema);

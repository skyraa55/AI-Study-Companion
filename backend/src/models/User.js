const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },

    // Persistent Global Learning Context (PRD 3.4 - Persistent Context)
    globalContext: {
      learningPreferences: { type: String, default: '' }, // e.g. "prefers analogies, visual examples"
      overallGoals: [{ type: String }],
      lastActiveAt: { type: Date, default: Date.now },
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

userSchema.statics.hashPassword = function (plain) {
  return bcrypt.hash(plain, 10);
};

userSchema.methods.toSafeJSON = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    globalContext: this.globalContext,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);

const User = require('../models/User');
const { signToken } = require('../utils/jwt');
const asyncHandler = require('../utils/asyncHandler');

const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'name, email and password are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters.' });
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return res.status(409).json({ message: 'An account with this email already exists.' });
  }

  const passwordHash = await User.hashPassword(password);
  const user = await User.create({ name, email: email.toLowerCase(), passwordHash });

  const token = signToken(user);
  res.status(201).json({ token, user: user.toSafeJSON() });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'email and password are required.' });
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }
  if (!user.isActive) {
    return res.status(403).json({ message: 'This account has been deactivated.' });
  }

  user.globalContext.lastActiveAt = new Date();
  await user.save();

  const token = signToken(user);
  res.json({ token, user: user.toSafeJSON() });
});

const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user.toSafeJSON() });
});

const updatePreferences = asyncHandler(async (req, res) => {
  const { learningPreferences, overallGoals } = req.body;
  if (learningPreferences !== undefined) req.user.globalContext.learningPreferences = learningPreferences;
  if (Array.isArray(overallGoals)) req.user.globalContext.overallGoals = overallGoals;
  await req.user.save();
  res.json({ user: req.user.toSafeJSON() });
});

module.exports = { register, login, me, updatePreferences };

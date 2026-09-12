/**
 * Usage: npm run seed:admin
 * Creates (or promotes) an admin user from env vars ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME
 */
require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');

(async () => {
  await connectDB();
  const email = (process.env.ADMIN_EMAIL || 'admin@studycompanion.dev').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'Admin@12345';
  const name = process.env.ADMIN_NAME || 'Platform Admin';

  let user = await User.findOne({ email });
  if (user) {
    user.role = 'admin';
    await user.save();
    console.log(`[seed:admin] Existing user promoted to admin: ${email}`);
  } else {
    const passwordHash = await User.hashPassword(password);
    user = await User.create({ name, email, passwordHash, role: 'admin' });
    console.log(`[seed:admin] Admin created: ${email} / ${password}`);
  }
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

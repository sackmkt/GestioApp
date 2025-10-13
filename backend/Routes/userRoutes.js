const express = require('express');
const {
  registerUser,
  loginUser,
  getProfile,
  updateProfile,
  requestPasswordReset,
  resetPassword,
  changePassword,
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/forgot-password', requestPasswordReset);
router.post('/reset-password', resetPassword);
router.get('/me', protect, getProfile);
router.put('/me', protect, updateProfile);
router.post('/me/password', protect, changePassword);

module.exports = router;

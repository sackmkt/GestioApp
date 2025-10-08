const express = require('express');
const { registerUser, loginUser, getProfile, updateProfile } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/me', protect, getProfile);
router.put('/me', protect, updateProfile);

module.exports = router;

const User = require('../models/User');
const jwt = require('jsonwebtoken');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });
};

const buildUserResponse = (user, includeToken = true) => {
  const base = {
    _id: user._id,
    username: user.username,
    email: user.email,
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    profession: user.profession || '',
    country: user.country || '',
    province: user.province || '',
    city: user.city || '',
    profileCompleted: user.profileCompleted || false,
  };

  if (!includeToken) {
    return base;
  }

  return {
    ...base,
    token: generateToken(user._id),
  };
};

exports.registerUser = async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Usuario, correo y contraseña son obligatorios' });
  }

  try {
    const normalizedUsername = username.trim();
    const normalizedEmail = email.toLowerCase().trim();

    const userExists = await User.findOne({ username: normalizedUsername });
    if (userExists) {
      return res.status(400).json({ message: 'El nombre de usuario ya existe' });
    }

    const emailExists = await User.findOne({ email: normalizedEmail });
    if (emailExists) {
      return res.status(400).json({ message: 'El correo electrónico ya está registrado' });
    }

    const user = await User.create({
      username: normalizedUsername,
      email: normalizedEmail,
      password,
    });

    const createdUser = await User.findById(user._id).select('-password');
    res.status(201).json(buildUserResponse(createdUser));
  } catch (error) {
    res.status(500).json({ message: 'Error del servidor' });
  }
};

exports.loginUser = async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username });

    if (user && (await user.matchPassword(password))) {
      const sanitizedUser = await User.findById(user._id).select('-password');
      res.json(buildUserResponse(sanitizedUser));
    } else {
      res.status(401).json({ message: 'Usuario o contraseña incorrectos' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error del servidor' });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    res.json(buildUserResponse(user, false));
  } catch (error) {
    res.status(500).json({ message: 'Error del servidor' });
  }
};

exports.updateProfile = async (req, res) => {
  const { username, email, firstName, lastName, profession, country, province, city } = req.body;

  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    if (username && username.trim() !== user.username) {
      const sanitizedUsername = username.trim();
      const usernameTaken = await User.findOne({ username: sanitizedUsername });
      if (usernameTaken) {
        return res.status(400).json({ message: 'El nombre de usuario ya existe' });
      }
      user.username = sanitizedUsername;
    }

    if (email && email.toLowerCase().trim() !== user.email) {
      const normalizedEmail = email.toLowerCase().trim();
      const emailTaken = await User.findOne({ email: normalizedEmail });
      if (emailTaken) {
        return res.status(400).json({ message: 'El correo electrónico ya está registrado' });
      }
      user.email = normalizedEmail;
    }

    if (typeof firstName !== 'undefined') user.firstName = (firstName || '').trim();
    if (typeof lastName !== 'undefined') user.lastName = (lastName || '').trim();
    if (typeof profession !== 'undefined') user.profession = (profession || '').trim();
    if (typeof country !== 'undefined') user.country = (country || '').trim();
    if (typeof province !== 'undefined') user.province = (province || '').trim();
    if (typeof city !== 'undefined') user.city = (city || '').trim();

    const mandatoryFields = [user.firstName, user.lastName, user.profession, user.country, user.province, user.city];
    user.profileCompleted = mandatoryFields.every((field) => field && field.trim() !== '');

    await user.save();

    const updatedUser = await User.findById(user._id).select('-password');
    res.json(buildUserResponse(updatedUser));
  } catch (error) {
    res.status(500).json({ message: 'Error del servidor' });
  }
};

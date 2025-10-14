import React, { useState } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import authService from '../services/authService';
import GestioLogo from '../assets/GestioLogo.png';
import '../styles/auth-pages.css';

function RegisterPage({ onAuthChange }) {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Función para validar la seguridad de la contraseña
  const isPasswordSecure = (pwd) => {
    // La contraseña debe tener al menos 8 caracteres,
    // una mayúscula, una minúscula, un número y un carácter especial.
    const hasMinLength = pwd.length >= 8;
    const hasUpperCase = /[A-Z]/.test(pwd);
    const hasLowerCase = /[a-z]/.test(pwd);
    const hasNumber = /[0-9]/.test(pwd);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(pwd);
    return hasMinLength && hasUpperCase && hasLowerCase && hasNumber && hasSpecialChar;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validar que las contraseñas coincidan
    if (formData.password !== formData.confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    // Validar la seguridad de la contraseña
    if (!isPasswordSecure(formData.password)) {
      setError('La contraseña no es lo suficientemente segura. Debe tener al menos 8 caracteres, incluyendo una mayúscula, una minúscula, un número y un carácter especial.');
      return;
    }
    
    setIsSubmitting(true);

    try {
      const user = await authService.register({
        username: formData.username.trim(),
        email: formData.email.trim(),
        password: formData.password,
      });
      if (onAuthChange) {
        onAuthChange(user);
      }
      navigate('/complete-profile');
    } catch (error) {
      const message = error.response?.data?.message || 'Hubo un error al registrar la cuenta.';
      setError(message);
      console.error('Registration error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-card__brand">
          <img src={GestioLogo} alt="Gestio" className="auth-card__brand-logo" />
          <h2 className="auth-card__brand-title">GESTIO</h2>
          <p className="auth-card__brand-subtitle">
            Diseñado para equipos que necesitan centralizar la información clínica y la administración sin perder tiempo.
          </p>
          <ul className="auth-card__highlights">
            <li>Integración bidireccional con Google Calendar y Outlook</li>
            <li>Automatizaciones no-code con plantillas de flujos</li>
            <li>Webhooks y API pública para integraciones externas</li>
          </ul>
        </div>
        <div className="auth-card__form">
          <header>
            <h1 className="auth-card__form-title">Crea tu cuenta</h1>
            <p className="auth-card__form-description">
              Configura tu acceso para comenzar a utilizar la plataforma y completar tu perfil profesional.
            </p>
          </header>
          {error && <div className="auth-alert">{error}</div>}
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-form-group">
              <label htmlFor="registerUsername">Nombre de usuario</label>
              <input
                id="registerUsername"
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                className="auth-input"
                autoComplete="username"
                required
              />
            </div>
            <div className="auth-form-group">
              <label htmlFor="registerEmail">Correo electrónico</label>
              <input
                id="registerEmail"
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="auth-input"
                autoComplete="email"
                required
              />
            </div>
            <div className="auth-form-group">
              <label htmlFor="registerPassword">Contraseña</label>
              <input
                id="registerPassword"
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                className="auth-input"
                autoComplete="new-password"
                required
              />
            </div>
            <div className="auth-form-group">
              <label htmlFor="registerConfirm">Confirmar contraseña</label>
              <input
                id="registerConfirm"
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                className="auth-input"
                autoComplete="new-password"
                required
              />
            </div>
            <button type="submit" className="auth-submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creando cuenta…' : 'Registrarse'}
            </button>
          </form>
          <p className="auth-switch">
            ¿Ya tienes una cuenta?{' '}
            <NavLink to="/login" className="auth-link">
              Inicia sesión aquí
            </NavLink>
          </p>
        </div>
      </div>
    </div>
  );
}

export default RegisterPage;

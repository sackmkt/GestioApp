import React, { useState } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import authService from '../services/authService';
import GoogleAuthButton from '../components/GoogleAuthButton.jsx';
import GestioLogo from '../assets/GestioLogo.png';
import '../styles/auth-pages.css';

function LoginPage({ onAuthChange }) {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const user = await authService.login({
        username: formData.username.trim(),
        password: formData.password,
      });
      if (onAuthChange) {
        onAuthChange(user);
      }
      navigate(user.profileCompleted ? '/dashboard' : '/complete-profile');
    } catch (error) {
      const message = error.response?.data?.message || 'Credenciales inválidas. Inténtalo de nuevo.';
      setError(message);
      console.error('Login error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleCredential = async (idToken) => {
    if (!idToken) {
      setError('No pudimos iniciar sesión con Google. Intenta nuevamente.');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const user = await authService.googleAuth({ idToken });
      if (onAuthChange) {
        onAuthChange(user);
      }
      navigate(user.profileCompleted ? '/dashboard' : '/complete-profile');
    } catch (googleError) {
      const message =
        googleError.response?.data?.message || 'No pudimos iniciar sesión con Google. Intenta nuevamente.';
      setError(message);
      console.error('Google login error:', googleError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleError = (message) => {
    setError(message || 'No pudimos iniciar sesión con Google. Intenta nuevamente.');
  };

  return (
    <div className="auth-page">
      <div className="auth-card auth-card--single" role="main">
        <div className="auth-card__brand" aria-label="GestioApp">
          <img src={GestioLogo} alt="Gestio" className="auth-card__logo" />
          <div>
            <span className="gestio-brand">
              <span className="gestio-brand__strong">GESTIO</span>
              <span className="gestio-brand__light">APP</span>
            </span>
            <p className="auth-card__summary">Simplifica la administración integral de tu consultorio.</p>
          </div>
        </div>
        <ul className="auth-card__features">
          <li>Agenda inteligente con recordatorios automáticos.</li>
          <li>Indicadores financieros claros y actualizados.</li>
        </ul>
        <header className="auth-card__header">
          <h1 className="auth-card__title">Inicia sesión</h1>
          <p className="auth-card__subtitle">Accede con tus credenciales para continuar gestionando tu consultorio.</p>
        </header>
        {error && <div className="auth-alert">{error}</div>}
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-form-group">
            <label htmlFor="loginUsername">Nombre de usuario</label>
            <input
              id="loginUsername"
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
            <label htmlFor="loginPassword">Contraseña</label>
            <input
              id="loginPassword"
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              className="auth-input"
              autoComplete="current-password"
              required
            />
          </div>
          <div className="auth-links auth-links--align-end">
            <NavLink to="/forgot-password" className="auth-link">
              ¿Olvidaste tu contraseña?
            </NavLink>
          </div>
          <button type="submit" className="auth-submit" disabled={isSubmitting}>
            {isSubmitting ? 'Ingresando…' : 'Acceder'}
          </button>
        </form>
        <div className="auth-divider">
          <span>O continúa con</span>
        </div>
        <div className={`auth-social ${isSubmitting ? 'auth-social--disabled' : ''}`}>
          <GoogleAuthButton
            onCredential={handleGoogleCredential}
            onError={handleGoogleError}
            text="signin_with"
            disabled={isSubmitting}
          />
        </div>
        <p className="auth-switch">
          ¿No tienes una cuenta?{' '}
          <NavLink to="/register" className="auth-link">
            Regístrate aquí
          </NavLink>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;

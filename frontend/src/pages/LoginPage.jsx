import React, { useState } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import authService from '../services/authService';
import GestioLogo from '../assets/GestioLogo.png';
import '../styles/auth-pages.css';

function LoginPage({ onAuthChange }) {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const togglePasswordVisibility = () => {
    setShowPassword((prev) => !prev);
  };

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

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-card__brand">
          <img src={GestioLogo} alt="Gestio" className="auth-card__brand-logo" />
          <h2 className="auth-card__brand-title">
            <span className="gestio-brand" aria-label="GestioApp">
              <span className="gestio-brand__strong">GESTIO</span>
              <span className="gestio-brand__light">APP</span>
            </span>
          </h2>
          <p className="auth-card__brand-subtitle">
            Simplificamos la gestión integral de pacientes, turnos y facturación para profesionales de la salud.
          </p>
          <ul className="auth-card__highlights">
            <li>Agenda inteligente y recordatorios automáticos</li>
            <li>Información clínica ordenada en un solo lugar</li>
            <li>Facturación y obras sociales sin complicaciones</li>
          </ul>
        </div>
        <div className="auth-card__form">
          <header>
            <h1 className="auth-card__form-title">Inicia sesión</h1>
            <p className="auth-card__form-description">
              Accede a tu panel para coordinar turnos, pacientes y la gestión diaria de tu consultorio.
            </p>
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
              <div className="auth-password-field">
                <input
                  id="loginPassword"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  className="auth-input auth-input--password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="auth-toggle-visibility"
                  onClick={togglePasswordVisibility}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
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
          <p className="auth-switch">
            ¿No tienes una cuenta?{' '}
            <NavLink to="/register" className="auth-link">
              Regístrate aquí
            </NavLink>
          </p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;

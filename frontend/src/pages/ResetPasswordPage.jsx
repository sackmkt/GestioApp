import React, { useMemo, useState } from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import authService from '../services/authService';
import GestioLogo from '../assets/GestioLogo.png';
import '../styles/auth-pages.css';

function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [formData, setFormData] = useState({ password: '', confirmPassword: '' });
  const [status, setStatus] = useState({ type: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const tokenAvailable = useMemo(() => token.trim().length > 0, [token]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!tokenAvailable) {
      setStatus({ type: 'error', message: 'El enlace de restablecimiento no es válido o ha expirado.' });
      return;
    }

    if (!formData.password.trim() || !formData.confirmPassword.trim()) {
      setStatus({ type: 'error', message: 'Ingresa y confirma tu nueva contraseña.' });
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setStatus({ type: 'error', message: 'Las contraseñas no coinciden.' });
      return;
    }

    if (formData.password.length < 8) {
      setStatus({ type: 'error', message: 'La nueva contraseña debe tener al menos 8 caracteres.' });
      return;
    }

    setIsSubmitting(true);
    setStatus({ type: '', message: '' });

    try {
      await authService.resetPassword({ token, password: formData.password });
      setStatus({ type: 'success', message: 'Actualizamos tu contraseña correctamente. Ya podés iniciar sesión.' });
      setFormData({ password: '', confirmPassword: '' });
    } catch (error) {
      const message =
        error.response?.data?.message || 'No pudimos restablecer tu contraseña. Intenta nuevamente o solicita un nuevo enlace.';
      setStatus({ type: 'error', message });
      console.error('Error al restablecer la contraseña:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card auth-card--simple">
        <div className="auth-card__form">
          <div className="auth-card__logo">
            <img src={GestioLogo} alt="Gestio" />
          </div>
          <header>
            <h1 className="auth-card__form-title">Elegí una nueva contraseña</h1>
            <p className="auth-card__form-description">
              Crea una contraseña segura para proteger tu cuenta. Recordá que el enlace expira a los 60 minutos de la
              solicitud.
            </p>
          </header>
          {status.type === 'error' && <div className="auth-alert">{status.message}</div>}
          {status.type === 'success' && <div className="auth-alert--success">{status.message}</div>}
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-form-group">
              <label htmlFor="resetPassword">Nueva contraseña</label>
              <input
                id="resetPassword"
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
              <label htmlFor="resetConfirmPassword">Confirmar contraseña</label>
              <input
                id="resetConfirmPassword"
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                className="auth-input"
                autoComplete="new-password"
                required
              />
            </div>
            <button type="submit" className="auth-submit" disabled={isSubmitting || !tokenAvailable}>
              {isSubmitting ? 'Actualizando…' : 'Actualizar contraseña'}
            </button>
          </form>
          <div className="auth-links auth-links--center">
            <NavLink to="/login" className="auth-link">
              Ir al inicio de sesión
            </NavLink>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ResetPasswordPage;

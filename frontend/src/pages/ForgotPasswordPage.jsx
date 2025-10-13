import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import authService from '../services/authService';
import GestioLogo from '../assets/GestioLogo.png';
import '../styles/auth-pages.css';

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState({ type: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setStatus({ type: 'error', message: 'Ingresa el correo electrónico asociado a tu cuenta.' });
      return;
    }

    setIsSubmitting(true);
    setStatus({ type: '', message: '' });

    try {
      await authService.requestPasswordReset(trimmedEmail);
      setStatus({
        type: 'success',
        message: 'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.',
      });
    } catch (error) {
      const message =
        error.response?.data?.message || 'No pudimos procesar tu solicitud. Intenta nuevamente en unos minutos.';
      setStatus({ type: 'error', message });
      console.error('Error al solicitar el restablecimiento de contraseña:', error);
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
            <h1 className="auth-card__form-title">Recupera tu acceso</h1>
            <p className="auth-card__form-description">
              Ingresá el correo electrónico que usas en Gestio y te enviaremos un enlace seguro para que restablezcas tu
              contraseña.
            </p>
          </header>
          {status.type === 'error' && <div className="auth-alert">{status.message}</div>}
          {status.type === 'success' && <div className="auth-alert--success">{status.message}</div>}
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-form-group">
              <label htmlFor="forgotEmail">Correo electrónico</label>
              <input
                id="forgotEmail"
                type="email"
                name="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="auth-input"
                autoComplete="email"
                required
              />
            </div>
            <button type="submit" className="auth-submit" disabled={isSubmitting}>
              {isSubmitting ? 'Enviando…' : 'Enviar instrucciones'}
            </button>
          </form>
          <div className="auth-links auth-links--center">
            <NavLink to="/login" className="auth-link">
              Volver al inicio de sesión
            </NavLink>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;

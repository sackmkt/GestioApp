import React, { useState } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import authService from '../services/authService';

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

  return (
    <div className="container mt-5">
      <div className="row justify-content-center">
        <div className="col-md-6">
          <div className="card shadow-sm">
            <div className="card-header text-white bg-primary">
              <h4 className="mb-0">Iniciar Sesión</h4>
            </div>
            <div className="card-body">
              {error && <div className="alert alert-danger">{error}</div>}
              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label className="form-label">Nombre de Usuario</label>
                  <input
                    type="text"
                    name="username"
                    value={formData.username}
                    onChange={handleChange}
                    className="form-control"
                    required
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Contraseña</label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    className="form-control"
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary w-100" disabled={isSubmitting}>
                  {isSubmitting ? 'Ingresando...' : 'Acceder'}
                </button>
              </form>
              <p className="mt-3 text-center">
                ¿No tienes una cuenta? <NavLink to="/register">Regístrate aquí</NavLink>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;

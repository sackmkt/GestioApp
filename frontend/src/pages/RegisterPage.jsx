import React, { useState } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import authService from '../services/authService';

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
    <div className="container mt-5">
      <div className="row justify-content-center">
        <div className="col-md-6">
          <div className="card shadow-sm">
            <div className="card-header text-white bg-info">
              <h4 className="mb-0">Crear Cuenta</h4>
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
                  <label className="form-label">Correo Electrónico</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
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
                {/* Campo de confirmación de contraseña agregado */}
                <div className="mb-3">
                  <label className="form-label">Confirmar Contraseña</label>
                  <input
                    type="password"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className="form-control"
                    required
                  />
                </div>
                <button type="submit" className="btn btn-info text-white w-100" disabled={isSubmitting}>
                  {isSubmitting ? 'Creando cuenta...' : 'Registrarse'}
                </button>
              </form>
              <p className="mt-3 text-center">
                ¿Ya tienes una cuenta? <NavLink to="/login">Inicia sesión aquí</NavLink>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RegisterPage;

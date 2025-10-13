import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import userService from '../services/UserService';
import { DASHBOARD_WIDGET_OPTIONS, DEFAULT_DASHBOARD_PREFERENCES, resolveDashboardPreferences } from '../constants/dashboardPreferences.js';

const professionOptions = [
  'Kinesiología',
  'Fonoaudiología',
  'Psicología',
  'Acompañante terapéutico',
  'Psicopedagogía',
  'Otorrinolaringología',
  'Pediatría',
  'Neurología',
  'Otra',
];

const resolveProfessionSelection = (profession) => {
  if (!profession) {
    return { selected: '', custom: '' };
  }
  if (professionOptions.includes(profession)) {
    return { selected: profession, custom: '' };
  }
  return { selected: 'Otra', custom: profession };
};

const DASHBOARD_SELECTION_ERROR = 'Selecciona al menos un bloque para tu panel principal.';

const sortDashboardPreferences = (widgets) => {
  if (!Array.isArray(widgets) || widgets.length === 0) {
    return [...DEFAULT_DASHBOARD_PREFERENCES];
  }
  return DEFAULT_DASHBOARD_PREFERENCES.filter((id) => widgets.includes(id));
};

function CompleteProfilePage({ currentUser, onProfileUpdated }) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    username: currentUser?.username || '',
    email: currentUser?.email || '',
    firstName: '',
    lastName: '',
    country: '',
    province: '',
    city: '',
  });
  const [{ selected, custom }, setProfessionSelection] = useState({ selected: '', custom: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [selectedWidgets, setSelectedWidgets] = useState(() => sortDashboardPreferences(resolveDashboardPreferences(currentUser?.dashboardPreferences)));

  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
      return;
    }
    if (currentUser.profileCompleted) {
      navigate('/dashboard');
      return;
    }

    const fetchProfile = async () => {
      try {
        const profile = await userService.getProfile();
        setFormData({
          username: profile.username || currentUser.username || '',
          email: profile.email || currentUser.email || '',
          firstName: profile.firstName || '',
          lastName: profile.lastName || '',
          country: profile.country || '',
          province: profile.province || '',
          city: profile.city || '',
        });
        setProfessionSelection(resolveProfessionSelection(profile.profession));
        setSelectedWidgets(sortDashboardPreferences(resolveDashboardPreferences(profile.dashboardPreferences)));
      } catch (fetchError) {
        console.error('Error al cargar el perfil:', fetchError);
        setError('No pudimos cargar tu perfil. Intenta nuevamente.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [currentUser, navigate]);

  useEffect(() => {
    if (Array.isArray(selectedWidgets) && selectedWidgets.length > 0 && error === DASHBOARD_SELECTION_ERROR) {
      setError('');
    }
  }, [error, selectedWidgets]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleProfessionChange = (event) => {
    const value = event.target.value;
    if (value === 'Otra') {
      setProfessionSelection((prev) => ({ ...prev, selected: value }));
    } else {
      setProfessionSelection({ selected: value, custom: '' });
    }
  };

  const handleCustomProfessionChange = (event) => {
    const value = event.target.value;
    setProfessionSelection((prev) => ({ ...prev, custom: value }));
  };

  const handleWidgetToggle = (widgetId) => {
    setSelectedWidgets((prev) => {
      if (!Array.isArray(prev)) {
        return sortDashboardPreferences([widgetId]);
      }
      if (prev.includes(widgetId)) {
        return prev.filter((id) => id !== widgetId);
      }
      const updated = [...prev, widgetId];
      return sortDashboardPreferences(updated);
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    const profession = selected === 'Otra' ? custom.trim() : selected;

    if (!profession) {
      setError('Por favor, indica tu profesión.');
      return;
    }

    if (!formData.firstName.trim() || !formData.lastName.trim() || !formData.country.trim() || !formData.province.trim() || !formData.city.trim()) {
      setError('Completa todos los campos obligatorios.');
      return;
    }

    if (selected === 'Otra' && !custom.trim()) {
      setError('Describe tu profesión en el campo correspondiente.');
      return;
    }

    if (!Array.isArray(selectedWidgets) || selectedWidgets.length === 0) {
      setError(DASHBOARD_SELECTION_ERROR);
      return;
    }

    setIsSubmitting(true);

    try {
      const updatedUser = await userService.updateProfile({
        username: formData.username.trim(),
        email: formData.email.trim(),
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        profession,
        country: formData.country.trim(),
        province: formData.province.trim(),
        city: formData.city.trim(),
        dashboardPreferences: selectedWidgets,
      });

      if (onProfileUpdated) {
        onProfileUpdated(updatedUser);
      }

      navigate('/dashboard');
    } catch (submitError) {
      const message = submitError.response?.data?.message || 'No pudimos guardar tu información. Intenta nuevamente.';
      setError(message);
      console.error('Error al completar el perfil:', submitError);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '50vh' }}>
        <div className="spinner-border text-info" role="status">
          <span className="visually-hidden">Cargando...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mt-5">
      <div className="row justify-content-center">
        <div className="col-lg-8 col-xl-7">
          <div className="card shadow-sm">
            <div className="card-header bg-info text-white">
              <h4 className="mb-0">Completa tu Perfil Profesional</h4>
            </div>
            <div className="card-body">
              <p className="text-muted">
                Cuéntanos un poco más sobre ti para personalizar tu experiencia en GestioApp.
              </p>
              {error && <div className="alert alert-danger">{error}</div>}
              <form onSubmit={handleSubmit}>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label">Nombre</label>
                    <input
                      type="text"
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleChange}
                      className="form-control"
                      placeholder="Ej: María"
                      required
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Apellido</label>
                    <input
                      type="text"
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleChange}
                      className="form-control"
                      placeholder="Ej: Pérez"
                      required
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Nombre de Usuario</label>
                    <input
                      type="text"
                      name="username"
                      value={formData.username}
                      onChange={handleChange}
                      className="form-control"
                      placeholder="Tu nombre visible en la app"
                      required
                    />
                  </div>
                  <div className="col-md-6">
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
                  <div className="col-md-6">
                    <label className="form-label">Profesión</label>
                    <select
                      className="form-select"
                      value={selected}
                      onChange={handleProfessionChange}
                      required
                    >
                      <option value="" disabled>Selecciona una opción</option>
                      {professionOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  {selected === 'Otra' && (
                    <div className="col-md-6">
                      <label className="form-label">Describe tu profesión</label>
                      <input
                        type="text"
                        value={custom}
                        onChange={handleCustomProfessionChange}
                        className="form-control"
                        placeholder="Especifica tu rol profesional"
                        required
                      />
                    </div>
                  )}
                  <div className="col-md-6">
                    <label className="form-label">País</label>
                    <input
                      type="text"
                      name="country"
                      value={formData.country}
                      onChange={handleChange}
                      className="form-control"
                      placeholder="Ej: Argentina"
                      required
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Provincia / Estado</label>
                    <input
                      type="text"
                      name="province"
                      value={formData.province}
                      onChange={handleChange}
                      className="form-control"
                      placeholder="Ej: Buenos Aires"
                      required
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Localidad / Ciudad</label>
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      className="form-control"
                      placeholder="Ej: La Plata"
                      required
                    />
                  </div>
                  <div className="col-12">
                    <fieldset className="border rounded-3 p-3">
                      <legend className="float-none w-auto px-2">Panel principal</legend>
                      <p className="text-muted small mb-3">
                        Personaliza qué indicadores verás en tu inicio. Siempre puedes cambiar esta selección desde tu perfil.
                      </p>
                      <div className="row g-3">
                        {DASHBOARD_WIDGET_OPTIONS.map((option) => {
                          const checkboxId = `complete-dashboard-widget-${option.id}`;
                          const checked = Array.isArray(selectedWidgets) && selectedWidgets.includes(option.id);
                          return (
                            <div className="col-md-6 col-lg-4" key={option.id}>
                              <div className="form-check d-flex align-items-start gap-2">
                                <input
                                  className="form-check-input mt-1"
                                  type="checkbox"
                                  id={checkboxId}
                                  checked={checked}
                                  onChange={() => handleWidgetToggle(option.id)}
                                />
                                <label className="form-check-label" htmlFor={checkboxId}>
                                  <span className="d-block fw-semibold">{option.label}</span>
                                  <span className="d-block text-muted small">{option.description}</span>
                                </label>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {(!Array.isArray(selectedWidgets) || selectedWidgets.length === 0) && (
                        <p className="text-danger small mt-3 mb-0">{DASHBOARD_SELECTION_ERROR}</p>
                      )}
                    </fieldset>
                  </div>
                </div>
                <button type="submit" className="btn btn-info text-white w-100 mt-4" disabled={isSubmitting}>
                  {isSubmitting ? 'Guardando...' : 'Guardar y continuar'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CompleteProfilePage;


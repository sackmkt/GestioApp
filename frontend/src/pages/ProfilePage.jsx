import React, { useEffect, useMemo, useRef, useState } from 'react';
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

const AVATAR_OPTIONS = [
  {
    id: 'stethoscope',
    label: 'Profesional',
    gradient: 'linear-gradient(135deg, #38bdf8, #0ea5e9)',
    emoji: '🩺',
  },
  {
    id: 'heartbeat',
    label: 'Cuidado',
    gradient: 'linear-gradient(135deg, #f97316, #f43f5e)',
    emoji: '💗',
  },
  {
    id: 'medkit',
    label: 'Guardia',
    gradient: 'linear-gradient(135deg, #22c55e, #16a34a)',
    emoji: '🧰',
  },
  {
    id: 'compass',
    label: 'Bienestar',
    gradient: 'linear-gradient(135deg, #a855f7, #6366f1)',
    emoji: '🧭',
  },
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

function ProfilePage({ currentUser, onProfileUpdated }) {
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
  const [success, setSuccess] = useState('');
  const [profileImage, setProfileImage] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('');
  const [imageError, setImageError] = useState('');
  const fileInputRef = useRef(null);
  const [selectedWidgets, setSelectedWidgets] = useState(() => sortDashboardPreferences(resolveDashboardPreferences(currentUser?.dashboardPreferences)));

  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
      return;
    }

    if (!currentUser.profileCompleted) {
      navigate('/complete-profile');
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
        setProfileImage(profile.profileImage || '');
        setSelectedAvatar(profile.profileAvatar || '');
        setSelectedWidgets(sortDashboardPreferences(resolveDashboardPreferences(profile.dashboardPreferences)));
        setImageError('');
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

  const professionDisplay = useMemo(() => {
    return selected === 'Otra' ? custom : selected;
  }, [selected, custom]);

  const fullName = useMemo(() => {
    return `${formData.firstName} ${formData.lastName}`.trim();
  }, [formData.firstName, formData.lastName]);

  const initials = useMemo(() => {
    const base = fullName || formData.username || '';
    return base
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() || '')
      .join('');
  }, [fullName, formData.username]);

  const selectedAvatarOption = useMemo(() => {
    return AVATAR_OPTIONS.find((option) => option.id === selectedAvatar) || null;
  }, [selectedAvatar]);

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

  const handleAvatarSelect = (avatarId) => {
    setSelectedAvatar(avatarId);
    setProfileImage('');
    setImageError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImageUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setImageError('El formato de la imagen debe ser PNG, JPG o WEBP.');
      return;
    }

    const maxSizeBytes = 2 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      setImageError('La imagen de perfil no puede superar los 2 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setProfileImage(reader.result?.toString() || '');
      setSelectedAvatar('');
      setImageError('');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setProfileImage('');
    setImageError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleWidgetToggle = (widgetId) => {
    setSelectedWidgets((prev) => {
      if (!Array.isArray(prev)) {
        return sortDashboardPreferences([widgetId]);
      }
      const exists = prev.includes(widgetId);
      if (exists) {
        const next = prev.filter((id) => id !== widgetId);
        return next;
      }
      const updated = [...prev, widgetId];
      return sortDashboardPreferences(updated);
    });
  };

  const renderProfileVisual = () => {
    if (profileImage) {
      return <img src={profileImage} alt="Foto de perfil" className="rounded-circle shadow" style={{ width: '112px', height: '112px', objectFit: 'cover', border: '4px solid rgba(255, 255, 255, 0.8)' }} />;
    }

    if (selectedAvatarOption) {
      return (
        <div
          className="rounded-circle d-flex align-items-center justify-content-center shadow"
          style={{
            width: '112px',
            height: '112px',
            backgroundImage: selectedAvatarOption.gradient,
            color: '#fff',
            fontSize: '2.5rem',
            border: '4px solid rgba(255, 255, 255, 0.65)',
          }}
        >
          <span role="img" aria-label={selectedAvatarOption.label}>{selectedAvatarOption.emoji}</span>
        </div>
      );
    }

    return (
      <div
        className="rounded-circle d-flex align-items-center justify-content-center bg-white text-primary shadow"
        style={{ width: '112px', height: '112px', fontWeight: 600, fontSize: '2rem', border: '4px solid rgba(255, 255, 255, 0.65)' }}
      >
        {initials || '👤'}
      </div>
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

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
        profileImage,
        profileAvatar: selectedAvatar,
        dashboardPreferences: selectedWidgets,
      });

      if (onProfileUpdated) {
        onProfileUpdated(updatedUser);
      }

      setProfileImage(updatedUser.profileImage || '');
      setSelectedAvatar(updatedUser.profileAvatar || '');
      setSelectedWidgets(sortDashboardPreferences(resolveDashboardPreferences(updatedUser.dashboardPreferences)));

      setSuccess('Actualizamos tus datos correctamente.');
    } catch (submitError) {
      const message = submitError.response?.data?.message || 'No pudimos guardar tu información. Intenta nuevamente.';
      setError(message);
      console.error('Error al actualizar el perfil:', submitError);
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
    <div className="container py-4">
      <div className="row justify-content-center">
        <div className="col-xl-8 col-xxl-7">
          <div className="card shadow-sm border-0 overflow-hidden mb-4">
            <div
              className="p-4 text-white"
              style={{ background: 'linear-gradient(135deg, #0ea5e9, #312e81)' }}
            >
              <div className="d-flex flex-column flex-md-row align-items-md-center gap-4">
                <div className="position-relative d-inline-flex align-items-center justify-content-center">
                  {renderProfileVisual()}
                  {professionDisplay && (
                    <span className="badge bg-light text-dark position-absolute bottom-0 start-50 translate-middle-x shadow-sm">
                      {professionDisplay}
                    </span>
                  )}
                </div>
                <div>
                  <h2 className="h4 mb-1">{fullName || 'Tu perfil profesional'}</h2>
                  <p className="mb-3 text-white-50">
                    Personaliza tu espacio cargando tu información y una imagen o avatar que te represente.
                  </p>
                  <div className="d-flex flex-wrap gap-3 text-white-50 small">
                    <div>
                      <span className="text-white fw-semibold">Usuario:</span> {formData.username || '—'}
                    </div>
                    <div>
                      <span className="text-white fw-semibold">Ubicación:</span> {[formData.city, formData.province]
                        .filter(Boolean)
                        .join(', ') || '—'}
                    </div>
                    {formData.country && (
                      <div>
                        <span className="text-white fw-semibold">País:</span> {formData.country}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card shadow-sm border-0 mb-4">
            <div className="card-header bg-white">
              <h5 className="mb-0">Foto y avatar</h5>
            </div>
            <div className="card-body">
              {imageError && <div className="alert alert-warning">{imageError}</div>}
              <div className="row g-4 align-items-center">
                <div className="col-md-4 text-center">
                  <div className="d-inline-block position-relative">
                    {renderProfileVisual()}
                  </div>
                  {profileImage && (
                    <button type="button" className="btn btn-link text-danger mt-3" onClick={handleRemoveImage}>
                      Quitar imagen subida
                    </button>
                  )}
                </div>
                <div className="col-md-8">
                  <p className="text-muted small mb-2">
                    Subí una imagen nítida en formato PNG, JPG o WEBP de hasta 2 MB para que tus pacientes puedan reconocerte.
                  </p>
                  <div className="d-flex flex-column flex-sm-row gap-2 mb-3">
                    <label className="btn btn-outline-primary mb-0">
                      Cargar imagen
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="d-none"
                        accept="image/png,image/jpeg,image/jpg,image/webp"
                        onChange={handleImageUpload}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => handleAvatarSelect(selectedAvatar || AVATAR_OPTIONS[0].id)}
                    >
                      Usar avatar ilustrado
                    </button>
                  </div>
                  <p className="text-muted small mb-2">Elige un estilo rápido:</p>
                  <div className="d-flex flex-wrap gap-3">
                    {AVATAR_OPTIONS.map((option) => {
                      const isActive = selectedAvatar === option.id && !profileImage;
                      return (
                        <button
                          type="button"
                          key={option.id}
                          className="btn p-0 border-0 position-relative rounded-circle shadow-sm"
                          style={{
                            width: '64px',
                            height: '64px',
                            backgroundImage: option.gradient,
                            border: isActive ? '3px solid rgba(14, 165, 233, 0.85)' : '3px solid transparent',
                          }}
                          onClick={() => handleAvatarSelect(option.id)}
                          aria-pressed={isActive}
                          aria-label={`Avatar ${option.label}`}
                        >
                          <span className="d-flex align-items-center justify-content-center h-100 w-100 text-white fs-4">
                            {option.emoji}
                          </span>
                          {isActive && (
                            <span className="position-absolute top-0 end-0 translate-middle badge rounded-pill bg-success">
                              ✓
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card shadow-sm border-0">
            <div className="card-header bg-white">
              <h5 className="mb-0">Datos personales</h5>
            </div>
            <div className="card-body">
              <p className="text-muted">
                Revisa y actualiza tus datos personales cuando lo necesites.
              </p>
              {error && <div className="alert alert-danger">{error}</div>}
              {success && <div className="alert alert-success">{success}</div>}
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
                      required
                    />
                  </div>
                  <div className="col-12">
                    <fieldset className="border rounded-3 p-3">
                      <legend className="float-none w-auto px-2">Panel principal</legend>
                      <p className="text-muted small mb-3">
                        Activa o desactiva los bloques que quieres ver en tu dashboard de inicio. Tus preferencias se sincronizan en todos tus dispositivos.
                      </p>
                      <div className="row g-3">
                        {DASHBOARD_WIDGET_OPTIONS.map((option) => {
                          const checkboxId = `dashboard-widget-${option.id}`;
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
                <button type="submit" className="btn btn-dark w-100 mt-4" disabled={isSubmitting}>
                  {isSubmitting ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProfilePage;


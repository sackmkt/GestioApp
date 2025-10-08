import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import userService from '../services/UserService';

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
      } catch (fetchError) {
        console.error('Error al cargar el perfil:', fetchError);
        setError('No pudimos cargar tu perfil. Intenta nuevamente.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [currentUser, navigate]);

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
      });

      if (onProfileUpdated) {
        onProfileUpdated(updatedUser);
      }

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
    <div className="container mt-5">
      <div className="row justify-content-center">
        <div className="col-lg-8 col-xl-7">
          <div className="card gestio-card border-0">
            <div className="card-header gestio-card-header">
              <h4 className="mb-0">Mi Perfil</h4>
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


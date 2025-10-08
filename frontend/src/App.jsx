import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import PacientesPage from './pages/PacientesPage';
import ObrasSocialesPage from './pages/ObrasSocialesPage';
import FacturasPage from './pages/FacturasPage';
import DashboardPage from './pages/DashboardPage';
import TurnosPage from './pages/TurnosPage';
import CentrosSaludPage from './pages/CentrosSaludPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import CompleteProfilePage from './pages/CompleteProfilePage';
import ProfilePage from './pages/ProfilePage';
import GestioLogo from './assets/GestioLogo.png';
import authService from './services/authService';
import { useFeedback } from './context/FeedbackContext.jsx';

const APP_VERSION = import.meta.env.VITE_APP_VERSION || 'v1.0.0';
const INACTIVITY_TIMEOUT_MS = 20 * 60 * 1000;

const NAVIGATION_ITEMS = [
  { to: '/dashboard', label: 'Resumen' },
  { to: '/pacientes', label: 'Pacientes' },
  { to: '/centros-salud', label: 'Centros de Salud' },
  { to: '/turnos', label: 'Agenda' },
  { to: '/obras-sociales', label: 'Obras Sociales' },
  { to: '/facturas', label: 'Facturación' },
];

function App() {
  const navigate = useNavigate();
  const { showInfo, showSuccess } = useFeedback();
  const [currentUser, setCurrentUser] = useState(() => {
    const storedUser = localStorage.getItem('user');
    return storedUser ? JSON.parse(storedUser) : null;
  });
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const inactivityTimerRef = useRef(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
    }
  }, []);

  const handleAuthChange = useCallback((userData) => {
    if (userData) {
      localStorage.setItem('user', JSON.stringify(userData));
      setCurrentUser(userData);
    } else {
      localStorage.removeItem('user');
      setCurrentUser(null);
    }
  }, []);

  const handleLogout = useCallback(
    ({ reason } = {}) => {
      authService.logout();
      handleAuthChange(null);

      if (reason === 'timeout') {
        showInfo('Por seguridad, tu sesión se cerró tras 20 minutos sin actividad. Inicia sesión nuevamente para continuar.');
      } else {
        showSuccess('Sesión cerrada correctamente. ¡Hasta pronto!');
      }

      navigate('/login');
    },
    [handleAuthChange, navigate, showInfo, showSuccess],
  );

  const isAuthenticated = Boolean(currentUser?.token);
  const userDisplayName = useMemo(() => {
    if (!currentUser) {
      return 'Profesional';
    }
    const firstName = currentUser.firstName?.split(' ')[0];
    if (firstName) {
      return firstName;
    }
    return currentUser.username;
  }, [currentUser]);

  useEffect(() => {
    if (!isAuthenticated) {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      return undefined;
    }

    const resetTimer = () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      inactivityTimerRef.current = window.setTimeout(() => {
        handleLogout({ reason: 'timeout' });
      }, INACTIVITY_TIMEOUT_MS);
    };

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    activityEvents.forEach((event) => document.addEventListener(event, resetTimer));

    resetTimer();

    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      activityEvents.forEach((event) => document.removeEventListener(event, resetTimer));
    };
  }, [handleLogout, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsMenuOpen(false);
    }
  }, [isAuthenticated]);

  const navLinkClassName = ({ isActive }) => `nav-link ${isActive ? 'active' : ''}`;

  const NavContent = () => {
    const closeMenu = () => setIsMenuOpen(false);

    return (
      <nav className="navbar navbar-expand-lg gestio-navbar sticky-top py-3">
        <div className="container">
          <NavLink className="navbar-brand d-flex align-items-center" to={isAuthenticated ? '/dashboard' : '/'} onClick={closeMenu}>
            <img src={GestioLogo} alt="Gestio Logo" style={{ height: '40px', marginRight: '12px' }} />
            <span>GESTIO</span>
          </NavLink>
          <button
            className="navbar-toggler"
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-controls="navbarNav"
            aria-expanded={isMenuOpen}
            aria-label="Toggle navigation"
          >
            <span className="navbar-toggler-icon"></span>
          </button>
          <div className={`collapse navbar-collapse ${isMenuOpen ? 'show' : ''}`} id="navbarNav">
            <ul className="navbar-nav me-auto align-items-lg-center">
              {isAuthenticated && (
                NAVIGATION_ITEMS.map((item) => (
                  <li className="nav-item" key={item.to}>
                    <NavLink className={navLinkClassName} to={item.to} onClick={closeMenu}>
                      {item.label}
                    </NavLink>
                  </li>
                ))
              )}
            </ul>
            <ul className="navbar-nav ms-auto align-items-lg-center gap-lg-3">
              {isAuthenticated ? (
                <>
                  <li className="nav-item">
                    <NavLink className={navLinkClassName} to="/profile" onClick={closeMenu}>
                      Perfil
                    </NavLink>
                  </li>
                  <li className="nav-item mt-3 mt-lg-0">
                    <button onClick={() => { closeMenu(); handleLogout(); }} className="btn btn-primary px-4">
                      Cerrar sesión
                    </button>
                  </li>
                </>
              ) : (
                <>
                  <li className="nav-item">
                    <NavLink className={navLinkClassName} to="/login" onClick={closeMenu}>
                      Iniciar sesión
                    </NavLink>
                  </li>
                  <li className="nav-item">
                    <NavLink className={navLinkClassName} to="/register" onClick={closeMenu}>
                      Registrarse
                    </NavLink>
                  </li>
                </>
              )}
            </ul>
          </div>
        </div>
      </nav>
    );
  };

  return (
    <div className="d-flex flex-column min-vh-100">
      <NavContent />
      <main className="flex-grow-1 gestio-main py-5">
        <div className="container">
          {isAuthenticated && (
            <header className="mb-4 text-center text-lg-start">
              <p className="text-uppercase text-muted fw-semibold mb-1">Hola, {userDisplayName}</p>
              <h1 className="display-6 fw-semibold mb-3" style={{ color: '#0f172a' }}>
                Gestión clínica sin fricciones
              </h1>
              <p className="text-muted mb-0 col-lg-6 p-0">
                Visualiza tus pacientes, agenda y facturación desde un mismo panel. Actualizamos el diseño para que sea más simple
                y profesional.
              </p>
            </header>
          )}
          <div className="gestio-content">
            <Routes>
              {!isAuthenticated && (
                <>
                  <Route path="/login" element={<LoginPage onAuthChange={handleAuthChange} />} />
                  <Route path="/register" element={<RegisterPage onAuthChange={handleAuthChange} />} />
                  <Route path="*" element={<LoginPage onAuthChange={handleAuthChange} />} />
                </>
              )}

              {isAuthenticated && !currentUser.profileCompleted && (
                <>
                  <Route
                    path="/complete-profile"
                    element={<CompleteProfilePage currentUser={currentUser} onProfileUpdated={handleAuthChange} />}
                  />
                  <Route
                    path="*"
                    element={<CompleteProfilePage currentUser={currentUser} onProfileUpdated={handleAuthChange} />}
                  />
                </>
              )}

              {isAuthenticated && currentUser.profileCompleted && (
                <>
                  <Route
                    path="/complete-profile"
                    element={<CompleteProfilePage currentUser={currentUser} onProfileUpdated={handleAuthChange} />}
                  />
                  <Route
                    path="/profile"
                    element={<ProfilePage currentUser={currentUser} onProfileUpdated={handleAuthChange} />}
                  />
                  <Route path="/pacientes" element={<PacientesPage />} />
                  <Route path="/obras-sociales" element={<ObrasSocialesPage />} />
                  <Route path="/turnos" element={<TurnosPage />} />
                  <Route path="/centros-salud" element={<CentrosSaludPage />} />
                  <Route path="/facturas" element={<FacturasPage />} />
                  <Route path="/dashboard" element={<DashboardPage currentUser={currentUser} />} />
                  <Route path="/" element={<DashboardPage currentUser={currentUser} />} />
                  <Route path="*" element={<DashboardPage currentUser={currentUser} />} />
                </>
              )}
            </Routes>
          </div>
        </div>
      </main>
      <footer className="gestio-footer py-4 mt-auto">
        <div className="container d-flex flex-column flex-md-row align-items-center justify-content-between gap-2">
          <span>© {new Date().getFullYear()} Gestio. Todos los derechos reservados.</span>
          <span>Versión {APP_VERSION}</span>
        </div>
      </footer>
    </div>
  );
}

export default App;

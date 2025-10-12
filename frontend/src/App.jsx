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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
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
  const userProfessionLabel = (currentUser?.profession && currentUser.profession.trim()) || 'Profesional de la salud';

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
      setIsSidebarOpen(false);
    }
  }, [isAuthenticated]);

  const navLinkClassName = ({ isActive }) => `nav-link ${isActive ? 'active' : ''}`;

  const NavContent = () => {
    const closeMenu = () => setIsSidebarOpen(false);

    return (
      <>
        <header className="gestio-header sticky-top py-3">
          <div className="container-fluid d-flex align-items-center justify-content-between gap-3">
            <div className="d-flex align-items-center gap-3">
              {isAuthenticated && (
                <button
                  type="button"
                  className="btn btn-icon btn-outline-primary gestio-menu-toggle"
                  aria-label="Abrir menú"
                  onClick={() => setIsSidebarOpen((prev) => !prev)}
                >
                  <span className="navbar-toggler-icon" />
                </button>
              )}
              <NavLink className="navbar-brand d-flex align-items-center" to={isAuthenticated ? '/dashboard' : '/'} onClick={closeMenu}>
                <img src={GestioLogo} alt="Gestio Logo" className="gestio-logo" />
                <span className="gestio-brand-name">GESTIO</span>
              </NavLink>
            </div>
            <ul className="navbar-nav flex-row align-items-center gap-3">
              {isAuthenticated ? (
                <>
                  <li className="nav-item d-none d-sm-block">
                    <span className="text-muted small text-uppercase fw-semibold">{userDisplayName}</span>
                  </li>
                  <li className="nav-item">
                    <NavLink className={navLinkClassName} to="/profile" onClick={closeMenu}>
                      Ver perfil
                    </NavLink>
                  </li>
                  <li className="nav-item">
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
        </header>

        {isAuthenticated && (
          <>
            <div className={`gestio-sidebar-backdrop ${isSidebarOpen ? 'show' : ''}`} onClick={closeMenu} />
            <aside className={`gestio-sidebar ${isSidebarOpen ? 'open' : ''}`}>
              <nav className="nav flex-column">
                {NAVIGATION_ITEMS.map((item) => (
                  <NavLink key={item.to} className={navLinkClassName} to={item.to} onClick={closeMenu}>
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </aside>
          </>
        )}
      </>
    );
  };

  return (
    <div className={`gestio-app d-flex flex-column min-vh-100 ${isSidebarOpen ? 'sidebar-open' : ''}`}>
      <NavContent />
      <div className="gestio-app-body flex-grow-1 d-flex">
        <main className="flex-grow-1 gestio-main py-5">
          <div className="container">
            {isAuthenticated && (
              <header className="mb-4 text-center text-lg-start">
                <p className="text-uppercase text-muted fw-semibold mb-3 fs-5 d-flex flex-column flex-sm-row align-items-center gap-2 justify-content-center justify-content-lg-start">
                  <span>Hola, {userDisplayName}</span>
                  {userProfessionLabel ? (
                    <span className="badge rounded-pill bg-light text-primary border border-primary-subtle px-3 py-2 fw-semibold">
                      {userProfessionLabel}
                    </span>
                  ) : null}
                </p>
                <h1 className="display-5 fw-bold mb-3" style={{ color: '#0f172a' }}>
                  Gestión clínica sin fricciones
                </h1>
                <p className="text-muted mb-0 col-lg-6 p-0">
                  Visualiza tus pacientes, agenda y facturación desde un mismo panel.
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
      </div>
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

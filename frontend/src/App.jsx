import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom';
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
import userService from './services/UserService';
import { useFeedback } from './context/FeedbackContext.jsx';

const APP_VERSION = import.meta.env.VITE_APP_VERSION || 'v1.0.0';
const INACTIVITY_TIMEOUT_MS = 20 * 60 * 1000;
const SECTION_USAGE_STORAGE_KEY = 'gestio:section-usage';

const getStoredUser = () => {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (error) {
    console.warn('No se pudo recuperar la sesión almacenada.', error);
  }

  localStorage.removeItem('user');
  return null;
};

const resolveSectionFromPath = (pathname) => {
  if (typeof pathname !== 'string') {
    return null;
  }

  if (pathname.startsWith('/turnos')) {
    return 'turnos';
  }
  if (pathname.startsWith('/pacientes')) {
    return 'pacientes';
  }
  if (pathname.startsWith('/facturas')) {
    return 'facturas';
  }
  if (pathname.startsWith('/obras-sociales')) {
    return 'obrasSociales';
  }
  if (pathname.startsWith('/centros-salud')) {
    return 'centrosSalud';
  }
  if (pathname.startsWith('/dashboard') || pathname === '/') {
    return 'dashboard';
  }
  return null;
};

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
  const location = useLocation();
  const { showInfo, showSuccess } = useFeedback();
  const [currentUser, setCurrentUser] = useState(() => getStoredUser());
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const inactivityTimerRef = useRef(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);

  const handleAuthChange = useCallback((userData) => {
    if (userData) {
      try {
        localStorage.setItem('user', JSON.stringify(userData));
      } catch (error) {
        console.warn('No se pudo persistir la sesión en el almacenamiento local.', error);
      }
      setCurrentUser(userData);
    } else {
      try {
        localStorage.removeItem('user');
      } catch (error) {
        console.warn('No se pudo limpiar la sesión almacenada.', error);
      }
      setCurrentUser(null);
    }
  }, []);

  const handleLogout = useCallback(
    ({ reason } = {}) => {
      authService.logout();
      handleAuthChange(null);

      if (reason === 'timeout') {
        showInfo('Por seguridad, tu sesión se cerró tras 20 minutos sin actividad. Inicia sesión nuevamente para continuar.');
      } else if (reason === 'sessionExpired') {
        showInfo('Tu sesión expiró. Por favor, inicia sesión nuevamente para continuar.');
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
    const syncUserFromStorage = (event) => {
      if (event.key !== 'user') {
        return;
      }

      if (!event.newValue) {
        setCurrentUser(null);
        navigate('/login');
        return;
      }

      try {
        const parsed = JSON.parse(event.newValue);
        setCurrentUser(parsed);
      } catch (error) {
        console.warn('No se pudo sincronizar la sesión con otra pestaña.', error);
        setCurrentUser(null);
        navigate('/login');
      }
    };

    window.addEventListener('storage', syncUserFromStorage);
    return () => window.removeEventListener('storage', syncUserFromStorage);
  }, [navigate]);

  useEffect(() => {
    let isMounted = true;

    const restoreSession = async () => {
      const storedUser = getStoredUser();

      if (!storedUser || !storedUser.token) {
        if (isMounted) {
          setIsRestoringSession(false);
        }
        return;
      }

      if (isMounted) {
        setCurrentUser(storedUser);
      }

      try {
        const profile = await userService.getProfile();
        if (!isMounted) {
          return;
        }
        handleAuthChange({ ...profile, token: storedUser.token });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        if (error?.response?.status === 401) {
          handleLogout({ reason: 'sessionExpired' });
        } else {
          console.warn('No se pudo verificar la sesión con el servidor.', error);
          showInfo('Trabajamos sin conexión temporalmente. Tus datos locales siguen disponibles.');
          handleAuthChange(storedUser);
        }
      } finally {
        if (isMounted) {
          setIsRestoringSession(false);
        }
      }
    };

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, [handleAuthChange, handleLogout, showInfo]);

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

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const section = resolveSectionFromPath(location.pathname);
    if (!section) {
      return;
    }

    try {
      const raw = localStorage.getItem(SECTION_USAGE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const previousCount = Number(parsed[section]) || 0;
      parsed[section] = previousCount + 1;
      localStorage.setItem(SECTION_USAGE_STORAGE_KEY, JSON.stringify(parsed));
    } catch (error) {
      console.warn('No se pudieron registrar las estadísticas de navegación.', error);
    }
  }, [isAuthenticated, location.pathname]);

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

  if (isRestoringSession) {
    return (
      <div className="d-flex align-items-center justify-content-center min-vh-100">
        <div className="text-center">
          <div className="spinner-border text-primary mb-3" role="status" aria-hidden="true"></div>
          <p className="text-muted mb-0">Preparando tu sesión...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="d-flex flex-column min-vh-100">
      <NavContent />
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

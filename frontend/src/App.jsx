import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
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
import { useNavigate } from 'react-router-dom';

const APP_VERSION = import.meta.env.VITE_APP_VERSION || 'v1.0.0';
const INACTIVITY_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutos

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

  const NavContent = () => {
    const onLogoutClick = () => {
      setIsMenuOpen(false);
      handleLogout();
    };

    const closeMenu = () => {
      setIsMenuOpen(false);
    };

    return (
      <nav className="navbar navbar-expand-lg navbar-dark bg-dark">
        <div className="container">
          <NavLink className="navbar-brand d-flex align-items-center" to="/" onClick={closeMenu}>
            <img src={GestioLogo} alt="Gestio Logo" style={{ height: '40px', marginRight: '10px' }} />
            <span style={{ fontFamily: 'Barlow, sans-serif' }}>GESTIO</span>
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
            <ul className="navbar-nav me-auto">
              {isAuthenticated && (
                <>
                  <li className="nav-item">
                    <NavLink className="nav-link" to="/pacientes" onClick={closeMenu}>
                      Pacientes
                    </NavLink>
                  </li>
                  <li className="nav-item">
                    <NavLink className="nav-link" to="/centros-salud" onClick={closeMenu}>
                      Centros de Salud
                    </NavLink>
                  </li>
                  <li className="nav-item">
                    <NavLink className="nav-link" to="/turnos" onClick={closeMenu}>
                      Agenda
                    </NavLink>
                  </li>
                  <li className="nav-item">
                    <NavLink className="nav-link" to="/obras-sociales" onClick={closeMenu}>
                      Obras Sociales
                    </NavLink>
                  </li>
                  <li className="nav-item">
                    <NavLink className="nav-link" to="/facturas" onClick={closeMenu}>
                      Facturación
                    </NavLink>
                  </li>
                </>
              )}
            </ul>
            <ul className="navbar-nav ms-auto align-items-lg-center">
              {isAuthenticated ? (
                <>
                  {currentUser && (
                    <li className="nav-item me-lg-3">
                      <span className="navbar-text text-white-50">
                        Hola, {currentUser.firstName ? currentUser.firstName.split(' ')[0] : currentUser.username}
                      </span>
                    </li>
                  )}
                  <li className="nav-item">
                    <NavLink className="nav-link" to="/profile" onClick={closeMenu}>
                      Perfil
                    </NavLink>
                  </li>
                  <li className="nav-item ms-lg-3 mt-2 mt-lg-0">
                    <button onClick={onLogoutClick} className="btn btn-outline-light w-100">
                      Cerrar Sesión
                    </button>
                  </li>
                </>
              ) : (
                <>
                  <li className="nav-item">
                    <NavLink className="nav-link" to="/login" onClick={closeMenu}>
                      Iniciar Sesión
                    </NavLink>
                  </li>
                  <li className="nav-item">
                    <NavLink className="nav-link" to="/register" onClick={closeMenu}>
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
      <main className="flex-grow-1">
        <div className="container mt-4">
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
                <Route path="/profile" element={<ProfilePage currentUser={currentUser} onProfileUpdated={handleAuthChange} />} />
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
      </main>
      <footer className="bg-dark text-white py-3 mt-auto">
        <div className="container d-flex flex-column flex-md-row align-items-center justify-content-between">
          <span>© {new Date().getFullYear()} Gestio. Todos los derechos reservados.</span>
          <span>Versión {APP_VERSION}</span>
        </div>
      </footer>
    </div>
  );
}

export default App;

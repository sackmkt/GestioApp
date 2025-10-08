import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useNavigate } from 'react-router-dom';
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

function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    const storedUser = localStorage.getItem('user');
    return storedUser ? JSON.parse(storedUser) : null;
  });
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
    }
  }, []);

  const isAuthenticated = Boolean(currentUser?.token);

  const handleAuthChange = (userData) => {
    if (userData) {
      localStorage.setItem('user', JSON.stringify(userData));
      setCurrentUser(userData);
    } else {
      localStorage.removeItem('user');
      setCurrentUser(null);
    }
  };

  const handleLogout = () => {
    authService.logout();
    handleAuthChange(null);
  };

  const NavContent = () => {
    const navigate = useNavigate();
    const onLogout = () => {
      setIsMenuOpen(false);
      handleLogout();
      navigate('/login');
    };

    // Función para cerrar el menú en dispositivos móviles
    const closeMenu = () => {
      setIsMenuOpen(false);
    };

    return (
      <nav className="navbar navbar-expand-lg navbar-dark bg-dark">
        <div className="container">
          {/* Nombre de la aplicación y logo */}
          <NavLink className="navbar-brand d-flex align-items-center" to="/dashboard" onClick={closeMenu}>
            <img src={GestioLogo} alt="Gestio Logo" style={{ height: '40px', marginRight: '10px' }} />
            <span style={{ fontFamily: 'Barlow, sans-serif' }}>GESTIO</span>
          </NavLink>
          
          {/* Botón del menú hamburguesa, ahora controlado por el estado de React */}
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
          
          {/* Contenido del menú colapsable, ahora controlado por el estado de React */}
          <div className={`collapse navbar-collapse ${isMenuOpen ? 'show' : ''}`} id="navbarNav">
            <ul className="navbar-nav me-auto">
              {isAuthenticated && (
                <>
                  <li className="nav-item">
                    <NavLink className="nav-link" to="/pacientes" onClick={closeMenu}>Pacientes</NavLink>
                  </li>
                  <li className="nav-item">
                    <NavLink className="nav-link" to="/centros-salud" onClick={closeMenu}>Centros de Salud</NavLink>
                  </li>
                  <li className="nav-item">
                    <NavLink className="nav-link" to="/turnos" onClick={closeMenu}>Agenda</NavLink>
                  </li>
                  <li className="nav-item">
                    <NavLink className="nav-link" to="/obras-sociales" onClick={closeMenu}>Obras Sociales</NavLink>
                  </li>
                  <li className="nav-item">
                    <NavLink className="nav-link" to="/facturas" onClick={closeMenu}>Facturación</NavLink>
                  </li>
                  <li className="nav-item">
                    <NavLink className="nav-link" to="/dashboard" onClick={closeMenu}>Inicio</NavLink>
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
                    <NavLink className="nav-link" to="/profile" onClick={closeMenu}>Perfil</NavLink>
                  </li>
                  <li className="nav-item ms-lg-3 mt-2 mt-lg-0">
                    <button onClick={onLogout} className="btn btn-outline-light w-100">
                      Cerrar Sesión
                    </button>
                  </li>
                </>
              ) : (
                <>
                  <li className="nav-item">
                    <NavLink className="nav-link" to="/login" onClick={closeMenu}>Iniciar Sesión</NavLink>
                  </li>
                  <li className="nav-item">
                    <NavLink className="nav-link" to="/register" onClick={closeMenu}>Registrarse</NavLink>
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
    <BrowserRouter>
      <NavContent />
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
              <Route
                path="/profile"
                element={<ProfilePage currentUser={currentUser} onProfileUpdated={handleAuthChange} />}
              />
              <Route path="/pacientes" element={<PacientesPage />} />
              <Route path="/obras-sociales" element={<ObrasSocialesPage />} />
              <Route path="/centros-salud" element={<CentrosSaludPage />} />
              <Route path="/turnos" element={<TurnosPage />} />
              <Route path="/facturas" element={<FacturasPage />} />
              <Route path="/dashboard" element={<DashboardPage currentUser={currentUser} />} />
              <Route path="/" element={<DashboardPage currentUser={currentUser} />} />
              <Route path="*" element={<DashboardPage currentUser={currentUser} />} />
            </>
          )}
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;

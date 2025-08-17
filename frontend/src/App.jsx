import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import PacientesPage from './pages/PacientesPage';
import ObrasSocialesPage from './pages/ObrasSocialesPage';
import FacturasPage from './pages/FacturasPage';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import GestioLogo from './assets/GestioLogo.png';
import authService from './services/authService';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    // Revisa si hay un usuario en localStorage al cargar la app
    const user = localStorage.getItem('user');
    if (user) {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogout = () => {
    authService.logout();
    setIsAuthenticated(false);
  };

  const NavContent = () => {
    const navigate = useNavigate();
    const onLogout = () => {
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
                    <NavLink className="nav-link" to="/obras-sociales" onClick={closeMenu}>Obras Sociales</NavLink>
                  </li>
                  <li className="nav-item">
                    <NavLink className="nav-link" to="/facturas" onClick={closeMenu}>Facturación</NavLink>
                  </li>
                  <li className="nav-item">
                    <NavLink className="nav-link" to="/dashboard" onClick={closeMenu}>Dashboard</NavLink>
                  </li>
                </>
              )}
            </ul>
            <ul className="navbar-nav ms-auto">
              {isAuthenticated ? (
                <li className="nav-item">
                  <button onClick={onLogout} className="btn btn-outline-light">
                    Cerrar Sesión
                  </button>
                </li>
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
          <Route path="/login" element={<LoginPage setIsAuthenticated={setIsAuthenticated} />} />
          <Route path="/register" element={<RegisterPage setIsAuthenticated={setIsAuthenticated} />} />
          
          {isAuthenticated ? (
            <>
              <Route path="/pacientes" element={<PacientesPage />} />
              <Route path="/obras-sociales" element={<ObrasSocialesPage />} />
              <Route path="/facturas" element={<FacturasPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/" element={<DashboardPage />} />
            </>
          ) : (
            <Route path="*" element={<LoginPage setIsAuthenticated={setIsAuthenticated} />} />
          )}
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;

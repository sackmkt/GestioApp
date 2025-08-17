import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Collapse } from 'bootstrap';

function Navbar() {
    const location = useLocation();

    useEffect(() => {
        const navbarCollapse = document.getElementById('navbarNav');
        const bsCollapse = new Collapse(navbarCollapse, {
            toggle: false,
        });

        // Cierra el menú al cambiar de ruta
        if (navbarCollapse.classList.contains('show')) {
            bsCollapse.hide();
        }
    }, [location]);

    return (
        <nav className="navbar navbar-expand-lg navbar-dark bg-dark">
            <div className="container-fluid">
                <Link className="navbar-brand" to="/">Sistema de Facturación</Link>
                <button
                    className="navbar-toggler"
                    type="button"
                    data-bs-toggle="collapse"
                    data-bs-target="#navbarNav"
                    aria-controls="navbarNav"
                    aria-expanded="false"
                    aria-label="Toggle navigation"
                >
                    <span className="navbar-toggler-icon"></span>
                </button>
                <div className="collapse navbar-collapse" id="navbarNav">
                    <ul className="navbar-nav me-auto mb-2 mb-lg-0">
                        <li className="nav-item">
                            <Link className="nav-link" to="/">Dashboard</Link>
                        </li>
                        <li className="nav-item">
                            <Link className="nav-link" to="/obras-sociales">Obras Sociales</Link>
                        </li>
                        <li className="nav-item">
                            <Link className="nav-link" to="/pacientes">Pacientes</Link>
                        </li>
                        <li className="nav-item">
                            <Link className="nav-link" to="/facturas">Facturas</Link>
                        </li>
                    </ul>
                </div>
            </div>
        </nav>
    );
}

export default Navbar;
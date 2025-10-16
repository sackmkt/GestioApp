import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import './Navbar.css';

function Navbar({ brand, navItems, renderActions }) {
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);

  useEffect(() => {
    setIsMenuOpen(false);
    setOpenDropdown(null);
  }, [location.pathname]);

  const toggleDropdown = (key) => {
    setOpenDropdown((current) => (current === key ? null : key));
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
    setOpenDropdown(null);
  };

  return (
    <header className="app-navbar" role="banner">
      <div className="app-navbar__inner">
        <NavLink className="app-navbar__brand" to={brand?.to || '/'} onClick={closeMenu}>
          {brand?.logo?.src ? (
            <img
              src={brand.logo.src}
              alt={brand.logo.alt || brand?.text || 'Inicio'}
              className="app-navbar__brand-logo"
            />
          ) : null}
          {brand?.text || brand?.subtitle ? (
            <span className="app-navbar__brand-text">
              {brand?.text ? <span>{brand.text}</span> : null}
              {brand?.subtitle ? (
                <span className="app-navbar__brand-subtitle">{brand.subtitle}</span>
              ) : null}
            </span>
          ) : null}
          {brand?.content}
        </NavLink>
        <button
          className="app-navbar__menu-toggle"
          type="button"
          aria-expanded={isMenuOpen}
          aria-label={isMenuOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'}
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          <span className="app-navbar__menu-icon" aria-hidden="true"></span>
        </button>
        <nav
          className={`app-navbar__links ${isMenuOpen ? 'is-open' : ''}`}
          aria-label="Navegación principal"
        >
          <ul className="app-navbar__list">
            {navItems.map((item) => {
              if (item.children && item.children.length > 0) {
                const key = item.key || item.label;
                const isExpanded = openDropdown === key;
                const hasActiveChild = item.children.some((child) =>
                  location.pathname.startsWith(child.to),
                );

                return (
                  <li
                    key={key}
                    className={`app-navbar__item app-navbar__item--dropdown ${
                      isExpanded ? 'is-expanded' : ''
                    }`.trim()}
                  >
                    <button
                      type="button"
                      className={`app-navbar__link-button ${hasActiveChild ? 'is-active' : ''}`.trim()}
                      aria-expanded={isExpanded}
                      onClick={() => toggleDropdown(key)}
                    >
                      {item.label}
                    </button>
                    <div className="app-navbar__subnav" role="menu">
                      {item.children.map((child) => (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          className={({ isActive }) =>
                            `app-navbar__subnav-link ${isActive ? 'is-active' : ''}`
                          }
                          onClick={closeMenu}
                          role="menuitem"
                        >
                          {child.label}
                        </NavLink>
                      ))}
                    </div>
                  </li>
                );
              }

              if (!item.to) {
                return null;
              }

              return (
                <li key={item.to} className="app-navbar__item">
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      [
                        'app-navbar__link',
                        item.icon ? 'app-navbar__link--icon' : '',
                        isActive ? 'is-active' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')
                    }
                    onClick={closeMenu}
                    aria-label={item.icon ? item.ariaLabel || item.label : undefined}
                  >
                    {item.icon ? (
                      <item.icon className="app-navbar__icon" aria-hidden="true" focusable="false" />
                    ) : null}
                    <span>{item.label}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
          {typeof renderActions === 'function' ? (
            <div className="app-navbar__actions">{renderActions({ closeMenu })}</div>
          ) : null}
        </nav>
      </div>
    </header>
  );
}

export default Navbar;

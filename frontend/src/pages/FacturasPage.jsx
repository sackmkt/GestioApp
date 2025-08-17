import React, { useState, useEffect } from 'react';
import facturasService from '../services/FacturasService';
import pacientesService from '../services/PacientesService';
import obrasSocialesService from '../services/ObrasSocialesService';

function FacturasPage() {
  const [facturas, setFacturas] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [obrasSociales, setObrasSociales] = useState([]);
  const [formData, setFormData] = useState({
    paciente: '',
    obraSocial: '',
    numeroFactura: '',
    montoTotal: '',
    fechaEmision: '',
  });

  const [activeTab, setActiveTab] = useState('all');
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSearchTerm, setFilterSearchTerm] = useState('');
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    fetchFacturas();
    fetchPacientes();
    fetchObrasSociales();
  }, []);

  const fetchFacturas = async () => {
    try {
      const data = await facturasService.getFacturas();
      setFacturas(data);
    } catch (error) {
      console.error('Error fetching facturas:', error);
    }
  };

  const fetchPacientes = async () => {
    try {
      const data = await pacientesService.getPacientes();
      setPacientes(data);
    } catch (error) {
      console.error('Error fetching pacientes:', error);
    }
  };

  const fetchObrasSociales = async () => {
    try {
      const data = await obrasSocialesService.getObrasSociales();
      setObrasSociales(data);
    } catch (error) {
      console.error('Error fetching obras sociales:', error);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handlePacienteChange = (e) => {
    const pacienteId = e.target.value;
    const pacienteSeleccionado = pacientes.find(p => p._id === pacienteId);

    if (pacienteSeleccionado && pacienteSeleccionado.obraSocial) {
      setFormData({
        ...formData,
        paciente: pacienteId,
        obraSocial: pacienteSeleccionado.obraSocial._id,
      });
    } else {
      setFormData({
        ...formData,
        paciente: pacienteId,
        obraSocial: ''
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const facturaConNumero = {
        ...formData,
        numeroFactura: Number(formData.numeroFactura),
      };

      if (editingId) {
        await facturasService.updateFactura(editingId, facturaConNumero);
        setEditingId(null);
      } else {
        await facturasService.createFactura(facturaConNumero);
      }

      setFormData({ paciente: '', obraSocial: '', numeroFactura: '', montoTotal: '', fechaEmision: '' });
      fetchFacturas();
    } catch (error) {
      if (error.response && error.response.status === 400) {
        setError('El número de factura ya existe. Por favor, elige uno diferente.');
      } else {
        setError('Ocurrió un error al intentar crear/actualizar la factura.');
        console.error('Error al procesar la factura:', error);
      }
    }
  };

  const handleDelete = async (id) => {
    try {
      await facturasService.deleteFactura(id);
      fetchFacturas();
    } catch (error) {
      console.error('Error deleting factura:', error);
    }
  };

  const handleMarkAsPaid = async (id) => {
    try {
      await facturasService.markAsPaid(id);
      fetchFacturas();
    } catch (error) {
      console.error('Error al marcar factura como pagada:', error);
    }
  };
  
  const handleInputChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleSearchClick = () => {
    setFilterSearchTerm(searchTerm);
  };

  const handleEdit = (factura) => {
    setEditingId(factura._id);
    setFormData({
      paciente: factura.paciente?._id || '',
      obraSocial: factura.obraSocial?._id || '',
      numeroFactura: factura.numeroFactura,
      montoTotal: factura.montoTotal,
      fechaEmision: new Date(factura.fechaEmision).toISOString().substring(0, 10),
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormData({ paciente: '', obraSocial: '', numeroFactura: '', montoTotal: '', fechaEmision: '' });
  };
  
  const filteredFacturas = facturas.filter(factura => {
    const isPaid = activeTab === 'paid' ? factura.pagado : true;
    const isUnpaid = activeTab === 'unpaid' ? !factura.pagado : true;
    
    const facturaNumeroStr = factura.numeroFactura !== null && factura.numeroFactura !== undefined
      ? String(factura.numeroFactura)
      : '';

    const matchesSearch = filterSearchTerm === '' ||
        (facturaNumeroStr.toLowerCase().includes(filterSearchTerm.toLowerCase()) ||
        factura.paciente?.nombre?.toLowerCase().includes(filterSearchTerm.toLowerCase()) ||
        factura.paciente?.apellido?.toLowerCase().includes(filterSearchTerm.toLowerCase()) ||
        factura.obraSocial?.nombre?.toLowerCase().includes(filterSearchTerm.toLowerCase()));

    return (isPaid && isUnpaid && matchesSearch);
  });

  return (
    <div className="container mt-4">
      <div className="card shadow-sm mb-4">
        <div className="card-header bg-success text-white">
          <h2 className="mb-0">Gestión de Facturación</h2>
        </div>
        <div className="card-body">
          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <div className="row g-3">
              <div className="col-md-6 col-lg-4">
                <label htmlFor="paciente" className="form-label">Paciente</label>
                <select
                  id="paciente"
                  name="paciente"
                  className="form-select"
                  value={formData.paciente}
                  onChange={handlePacienteChange}
                  required
                >
                  <option value="">Seleccione Paciente</option>
                  {pacientes.map((p) => (
                    <option key={p._id} value={p._id}>{p.nombre} {p.apellido}</option>
                  ))}
                </select>
              </div>
              <div className="col-md-6 col-lg-4">
                <label htmlFor="obraSocial" className="form-label">Obra Social</label>
                <select
                  id="obraSocial"
                  name="obraSocial"
                  className="form-select"
                  value={formData.obraSocial}
                  onChange={handleChange}
                  required
                >
                  <option value="">Seleccione Obra Social</option>
                  {obrasSociales.map((os) => (
                    <option key={os._id} value={os._id}>{os.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="col-md-6 col-lg-4">
                <label htmlFor="numeroFactura" className="form-label">Número de Factura</label>
                <input
                  type="text"
                  id="numeroFactura"
                  name="numeroFactura"
                  className="form-control"
                  placeholder="Ej. 12345"
                  value={formData.numeroFactura}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="col-md-6 col-lg-4">
                <label htmlFor="montoTotal" className="form-label">Monto Total</label>
                <input
                  type="number"
                  id="montoTotal"
                  name="montoTotal"
                  className="form-control"
                  placeholder="Ej. 500.50"
                  value={formData.montoTotal}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="col-md-6 col-lg-4">
                <label htmlFor="fechaEmision" className="form-label">Fecha de Emisión</label>
                <input
                  type="date"
                  id="fechaEmision"
                  name="fechaEmision"
                  className="form-control"
                  value={formData.fechaEmision}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="col-12 mt-3 d-flex justify-content-end">
                {editingId && (
                  <button type="button" className="btn btn-secondary me-2" onClick={handleCancelEdit}>
                    Cancelar
                  </button>
                )}
                <button type="submit" className="btn btn-success">
                  {editingId ? 'Actualizar Factura' : 'Agregar Factura'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <div className="card shadow-sm mb-4">
        <div className="card-header">
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-center">
            <h4 className="mb-2 mb-md-0">Listado de Facturas</h4>
            <div className="input-group" style={{ maxWidth: '300px' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Buscar..."
                value={searchTerm}
                onChange={handleInputChange}
              />
              <button className="btn btn-outline-secondary" type="button" onClick={handleSearchClick}>
                Buscar
              </button>
            </div>
          </div>
          <ul className="nav nav-tabs card-header-tabs mt-3">
            <li className="nav-item">
              <a
                className={`nav-link ${activeTab === 'all' ? 'active' : ''}`}
                href="#"
                onClick={() => setActiveTab('all')}
              >
                Todas ({facturas.length})
              </a>
            </li>
            <li className="nav-item">
              <a
                className={`nav-link ${activeTab === 'unpaid' ? 'active' : ''}`}
                href="#"
                onClick={() => setActiveTab('unpaid')}
              >
                Pendientes ({facturas.filter(f => !f.pagado).length})
              </a>
            </li>
            <li className="nav-item">
              <a
                className={`nav-link ${activeTab === 'paid' ? 'active' : ''}`}
                href="#"
                onClick={() => setActiveTab('paid')}
              >
                Pagadas ({facturas.filter(f => f.pagado).length})
              </a>
            </li>
          </ul>
        </div>
        <div className="card-body">
          {/* Tabla para dispositivos grandes (desktop) */}
          <div className="table-responsive d-none d-md-block">
            <table className="table table-striped table-hover mb-0">
              <thead className="table-dark">
                <tr>
                  <th>N° Factura</th>
                  <th>Paciente</th>
                  <th>Obra Social</th>
                  <th>Monto</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredFacturas.map((factura) => (
                  <tr key={factura._id} className={factura.pagado ? 'table-success' : ''}>
                    <td>{factura.numeroFactura}</td>
                    <td>{factura.paciente ? `${factura.paciente.nombre} ${factura.paciente.apellido}` : 'N/A'}</td>
                    <td>{factura.obraSocial ? factura.obraSocial.nombre : 'N/A'}</td>
                    <td>${factura.montoTotal}</td>
                    <td>{new Date(factura.fechaEmision).toLocaleDateString()}</td>
                    <td>
                      <span className={`badge rounded-pill ${factura.pagado ? 'bg-success' : 'bg-warning text-dark'}`}>
                        {factura.pagado ? 'Pagada' : 'Pendiente'}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-primary btn-sm me-2"
                        onClick={() => handleMarkAsPaid(factura._id)}
                        disabled={factura.pagado}
                      >
                        Pagar
                      </button>
                      <button
                        className="btn btn-warning btn-sm me-2"
                        onClick={() => handleEdit(factura)}
                        disabled={factura.pagado}
                      >
                        Editar
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(factura._id)}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards para dispositivos pequeños (móvil) */}
          <div className="d-md-none">
            <div className="row g-3">
              {filteredFacturas.map((factura) => (
                <div className="col-12" key={factura._id}>
                  <div className="card shadow-sm">
                    <div className="card-body">
                      <h5 className="card-title">Factura N° {factura.numeroFactura}</h5>
                      <p className="card-text mb-1">
                        <strong>Paciente:</strong> {factura.paciente ? `${factura.paciente.nombre} ${factura.paciente.apellido}` : 'N/A'}
                      </p>
                      <p className="card-text mb-1">
                        <strong>Monto:</strong> ${factura.montoTotal}
                      </p>
                      <p className="card-text mb-1">
                        <strong>Estado:</strong>
                        <span
                          className={`badge ms-2 rounded-pill ${factura.pagado ? 'bg-success' : 'bg-warning text-dark'}`}
                        >
                          {factura.pagado ? 'Pagada' : 'Pendiente'}
                        </span>
                      </p>
                      <div className="d-flex justify-content-between mt-3">
                        <button
                          className="btn btn-primary btn-sm me-2"
                          onClick={() => handleMarkAsPaid(factura._id)}
                          disabled={factura.pagado}
                        >
                          Pagar
                        </button>
                        <button
                          className="btn btn-warning btn-sm me-2"
                          onClick={() => handleEdit(factura)}
                          disabled={factura.pagado}
                        >
                          Editar
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(factura._id)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FacturasPage;
let ultimaCarreraEnviada = null;
let ultimoEstudianteEnviado = null;
let ultimoCodigoEnviado = null;
let observer = null;
let retryTimeout = null;

async function comprobarYActualizarDatos() {
  // Obtener nombre de usuario visible en la página actual
  const userNameElement = document.querySelector('.m-topbar__name');
  const userName = userNameElement ? userNameElement.textContent.trim() : 'USUARIO NO IDENTIFICADO';

  // Leer datos almacenados en chrome.storage.local
  const datosAlmacenados = await new Promise(resolve => {
    chrome.storage.local.get(['estudiante', 'carreraUns', 'codigo'], (result) => {
      resolve(result);
    });
  });

  const estudianteAlmacenado = datosAlmacenados.estudiante || null;

  if (estudianteAlmacenado === userName) {
    // console.log('El estudiante es el mismo, no se realiza ninguna acción.');
    // Puedes continuar con otras tareas si quieres
    return;
  } else {
    // console.log('Estudiante diferente, limpiando datos y abriendo página de notas para actualización.');

    // Limpiar datos almacenados
    await new Promise(resolve => {
      chrome.storage.local.remove(['estudiante', 'carreraUns', 'codigo'], () => {
        resolve();
      });
    });

    // Abrir la página de notas en una nueva pestaña para actualizar datos
    chrome.runtime.sendMessage({
      action: 'abrir_pagina_notas'
    });
  }
}

// Llama a esta función solo si estás en la página tickets-comedor
if (window.location.href.startsWith('https://intranet.unsch.edu.pe/alumno/tickets-comedor')) {
  // console.log("hola")
  comprobarYActualizarDatos();
}


// Función para extraer datos de la página con manejo de errores y comparación menos estricta
function extraerDatos() {
  try {
    const container = document.querySelector('.m-portlet__body');
    if (!container) {
      console.warn('.m-portlet__body no encontrado');
      return null;
    }

    function obtenerValorPorEtiqueta(etiquetaTexto) {
      const labels = container.querySelectorAll('label > b');
      for (let b of labels) {
        if (
          b.textContent &&
          b.textContent.trim().toLowerCase().startsWith(etiquetaTexto.toLowerCase())
        ) {
          const labelPadre = b.parentElement;
          const divPadre = labelPadre.parentElement;
          const siguienteDiv = divPadre.nextElementSibling;
          if (siguienteDiv) {
            const labelValor = siguienteDiv.querySelector('label');
            if (labelValor) {
              return labelValor.textContent.trim();
            }
          }
        }
      }
      return null;
    }

    const estudiante = obtenerValorPorEtiqueta('Estudiante:');
    const codigo = obtenerValorPorEtiqueta('Código:');
    const escuela = obtenerValorPorEtiqueta('Escuela:');

    if (codigo == null || escuela == null || estudiante == null) {
      return null;
    }

    return { estudiante, codigo, escuela };
  } catch (error) {
    console.error('Error en extraerDatos:', error);
    return null;
  }
}

// Función para enviar datos solo si hay cambios, con manejo básico de respuesta
function enviarSiCambio() {
  const datos = extraerDatos();
  if (!datos) {
    return;
  }

  if (
    datos.escuela !== ultimaCarreraEnviada ||
    datos.estudiante !== ultimoEstudianteEnviado ||
    datos.codigo !== ultimoCodigoEnviado
  ) {
    ultimaCarreraEnviada = datos.escuela;
    ultimoEstudianteEnviado = datos.estudiante;
    ultimoCodigoEnviado = datos.codigo;
    // console.log('Datos cambiaron, enviando:', datos);
    chrome.runtime.sendMessage(
      {
        action: 'carrera_obtenida',
        carrera: datos.escuela,
        estudiante: datos.estudiante,
        codigo: datos.codigo
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn('Error enviando mensaje:', chrome.runtime.lastError.message);
        } else {
          // console.log('Respuesta recibida:', response);
        }
      }
    );
  } 
  // else {
  //   // console.log('Datos no cambiaron, no se envía');
  // }
}

// Observador para detectar cambios dinámicos con límite de reintentos y desconexión
function observarCambios(reintentos = 20) {
  const contenedor = document.querySelector('.m-portlet__body');
  if (!contenedor) {
    if (reintentos <= 0) {
      console.warn('Contenedor .m-portlet__body no encontrado después de varios reintentos, deteniendo.');
      return;
    }
    // console.log(`Contenedor no encontrado, reintentando en 500ms (${reintentos} intentos restantes)`);
    retryTimeout = setTimeout(() => observarCambios(reintentos - 1), 500);
    return;
  }

  if (observer) {
    observer.disconnect(); // Desconectar observador anterior para evitar fugas
  }

  observer = new MutationObserver(() => {
    enviarSiCambio();
  });

  observer.observe(contenedor, { childList: true, subtree: true });

  enviarSiCambio();
}

// Llamar a observarCambios cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    observarCambios();
  });
} else {
  observarCambios();
}


// --- Manejo del modal y botones de impresión y descarga ---

(() => {
  'use strict';

  if (!window.location.href.includes('intranet.unsch.edu.pe/alumno/tickets-comedor')) return;

  let printButtonAdded = false;

  function detectTicketModal() {
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.type === 'attributes' && mutation.target.id === 'ticket-modal') {
          const modal = mutation.target;
          if (modal.classList.contains('show') && !printButtonAdded) {
            setTimeout(() => addPrintButtonToModal(modal), 100);
          }
        }
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const modal = node.id === 'ticket-modal' ? node : node.querySelector('#ticket-modal');
            if (modal && modal.classList.contains('show') && !printButtonAdded) {
              setTimeout(() => addPrintButtonToModal(modal), 100);
            }
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  }

  function addPrintButtonToModal(modal) {
    if (printButtonAdded || modal.querySelector('.ticket-print-btn')) return;

    const modalBody = modal.querySelector('.modal-body');
    const table = modalBody?.querySelector('table');
    if (!modalBody || !table) return;

    const printButton = document.createElement('button');
    printButton.className = 'ticket-print-btn btn btn-primary';
    printButton.type = 'button';
    printButton.setAttribute('aria-label', 'Opciones ticket de comedor');
    printButton.textContent = 'Opciones Ticket';
    printButton.style.cssText = `
      width: 100%; margin-top: 15px; padding: 10px;
      background-color: #5d0104; color: white;
      font-size: 14px; font-weight: bold;
      border-radius: 5px; cursor: pointer;
      text-align: center; user-select: none;
    `;

    printButton.addEventListener('mouseenter', () => { printButton.style.backgroundColor = '#8f0206'; });
    printButton.addEventListener('mouseleave', () => { printButton.style.backgroundColor = '#5d0104'; });

    printButton.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      openPrintOrDownloadWindow();
    });

    table.insertAdjacentElement('afterend', printButton);
    printButtonAdded = true;
  }

  async function openPrintOrDownloadWindow() {
    const modal = document.getElementById('ticket-modal');
    if (!modal || !modal.classList.contains('show')) {
      alert('El modal del ticket no está visible.');
      return;
    }

    const ticketDate = document.getElementById('ticket_date')?.textContent || 'N/A';
    const ticketType = document.getElementById('ticket_type')?.textContent || 'N/A';
    const ticketTime = document.getElementById('ticket_time')?.textContent || 'N/A';
    const qrImageSrc = document.getElementById('ticket_qr')?.src || '';

    const datosUsuario = await new Promise(resolve => {
      chrome.storage.local.get(['estudiante', 'carreraUns', 'codigo'], result => {
        resolve(result);
      });
    });

    const userName = datosUsuario.estudiante || 'USUARIO NO IDENTIFICADO';
    const userCarrera = datosUsuario.carreraUns || 'CARRERA NO IDENTIFICADA';
    const userCodigo = datosUsuario.codigo || 'SIN CÓDIGO';

    if (!qrImageSrc) {
      alert('No se pudo obtener el código QR del ticket.');
      return;
    }

    let qrBase64;
    if (qrImageSrc.startsWith('data:image')) {
      qrBase64 = qrImageSrc;
    } else {
      try {
        qrBase64 = await getBase64ImageFromUrl(qrImageSrc);
      } catch {
        alert('Error al convertir el código QR a base64.');
        return;
      }
    }

    const printWindow = window.open('', '_blank', 'width=800,height=700');
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Ticket POS - UNSCH</title>
        <style>
          *{margin:0;padding:0;box-sizing:border-box;}
          body{font-family:'Courier New', Consolas, monospace;font-size:12px;line-height:1.2;width:58mm;margin:0 auto;padding:2mm;background:#fff;color:#000;}
          .ticket{width:100%;text-align:center;}
          .header{border-bottom:1px dashed #000;padding-bottom:3mm;margin-bottom:3mm;}
          .university{font-weight:bold;font-size:12px;margin-bottom:1mm;letter-spacing:0.5px;}
          .title{font-weight:bold;font-size:12px;margin-bottom:1mm;}
          .qr-section{margin:3mm 0;text-align:center;}
          .qr-code{width:48mm;height:48mm;margin:2mm auto;display:block;border:1.55px dashed #000;}
          .user-section{margin:3mm 0;padding:2mm 0;border-top:1px dashed #000;border-bottom:1px dashed #000;}
          .user-label{font-size:12px;font-weight:bold;margin-bottom:1mm;}
          .user-name{font-size:11px;font-weight:bold;word-wrap:break-word;line-height:1.1;}
          .info-section{text-align:left;margin:2mm 0;}
          .info-line{display:flex;justify-content:space-between;margin:1mm 0;font-size:11px;border-bottom:1px dotted #ccc;padding-bottom:0.5mm;}
          .info-label{font-weight:bold;width:40%;text-transform:uppercase;}
          .info-value{width:60%;text-align:right;font-weight:bold;}
          .footer{margin-top:3mm;padding-top:2mm;border-top:1px dashed #000;font-size:12px;text-align:center;line-height:1.3;}
          .timestamp{margin:1mm 0;font-size:11px;}
          .instructions{font-size:12px;margin-top:2mm;text-align:center;font-style:italic;}
          .dev{font-size:10px;margin-top:2mm;text-align:center;font-weight:bold;}
          .separator{text-align:center;margin:2mm 0;font-size:8px;}
          .button-container{display:flex;gap:10px;margin:10px 0;}
          button{flex:1;padding:10px;font-weight:bold;border:none;color:#fff;border-radius:5px;cursor:pointer;user-select:none;}
          #print-btn{background-color:#28a745;}
          #print-btn:hover{background-color:#218838;}
          #download-btn{background-color:#007bff;}
          #download-btn:hover{background-color:#0056b3;}
          @media print{@page{size:58mm auto;margin:0;}body{print-color-adjust:exact !important;-webkit-print-color-adjust:exact !important;margin:0;padding:2mm;font-size:10px;}.qr-code{width:48mm !important;height:48mm !important;}.button-container{display:none !important;}}</style>
      </head>
      <body>
        <div class="ticket">
          <div class="header">
            <div class="university">..........................</div>
            <div class="university">UNIV. NAC. SAN CRISTOBAL</div>
            <div class="university">DE HUAMANGA</div>
            <div class="title">TICKET COMEDOR</div>
          </div>
          <div class="qr-section"><img src="${qrBase64}" alt="QR" class="qr-code" /></div>
          <div class="user-section">
            <div class="user-label">CARRERA:</div><div class="user-name">${userCarrera}</div>
            <div class="user-label">ESTUDIANTE:</div><div class="user-name">${userName}</div>
            <div class="user-label">CÓDIGO:</div><div class="user-name">${userCodigo}</div>
          </div>
          <div class="info-section">
            <div class="info-line"><span class="info-label">FECHA:</span><span class="info-value">${ticketDate}</span></div>
            <div class="info-line"><span class="info-label">TURNO:</span><span class="info-value">${ticketType}</span></div>
            <div class="info-line"><span class="info-label">HORARIO:</span><span class="info-value">${ticketTime}</span></div>
          </div>
          <div class="separator">========</div>
          <div class="footer">
            <div class="timestamp">${new Date().toLocaleDateString('es-PE')} - ${new Date().toLocaleTimeString('es-PE')}</div>
            <div class="instructions">CONSERVE ESTE TICKET</div>
            <div class="separator">========</div>
          </div>
        </div>
        <div class="button-container">
          <button id="print-btn" type="button">Imprimir Ticket</button>
          <button id="download-btn" type="button">Descargar Imagen</button>
        </div>
      </body>
      </html>`;

    printWindow.document.write(htmlContent);
    printWindow.document.close();

    // Cargar scripts externamente para cumplir CSP
    const scriptHtml2canvas = printWindow.document.createElement('script');
    scriptHtml2canvas.src = chrome.runtime.getURL('libs/html2canvas.min.js');
    printWindow.document.head.appendChild(scriptHtml2canvas);

    scriptHtml2canvas.onload = () => {
      const scriptTicketActions = printWindow.document.createElement('script');
      scriptTicketActions.src = chrome.runtime.getURL('scripts/ticketActions.js');
      printWindow.document.head.appendChild(scriptTicketActions);
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(detectTicketModal, 1000);
    });
  } else {
    setTimeout(detectTicketModal, 1000);
  }

  setTimeout(() => {
    const existingModal = document.getElementById('ticket-modal');
    if (existingModal && existingModal.classList.contains('show')) {
      addPrintButtonToModal(existingModal);
    }
  }, 2000);

})();

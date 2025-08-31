let tabIdNotas = null;
let tabIdTickets = null;

async function existePestanaNotas() {
  return new Promise((resolve) => {
    chrome.tabs.query({ url: 'https://intranet.unsch.edu.pe/alumno/notas*' }, (tabs) => {
      if (tabs.length > 0) {
        tabIdNotas = tabs[0].id;
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

async function checkCarrera() {
  const datos = await new Promise((resolve) => {
    chrome.storage.local.get('carreraUns', (result) => {
      resolve(result.carreraUns || null);
    });
  });

  if (datos) {
    // console.log('Carrera ya almacenada:', datos);
    return;
  }

  const tabNotasAbierta = await existePestanaNotas();
  if (!tabNotasAbierta) {
    chrome.tabs.create({ url: 'https://intranet.unsch.edu.pe/alumno/notas', active: false }, (tab) => {
      // console.log('Pestaña notas abierta para extracción de carrera, tabId:', tab.id);
      tabIdNotas = tab.id;
    });
  } else {
    // console.log('Ya existe una pestaña notas abierta, no se abre otra');
  }
}


function esUrlValida(url) {
  return url && (
    url.startsWith('https://intranet.unsch.edu.pe/alumno/tickets-comedor') ||
    url.startsWith('https://intranet.unsch.edu.pe/alumno/notas')
  );
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'carrera_obtenida') {
    // console.log("Mensaje recibido: carrera_obtenida, guardando datos...");
    chrome.storage.local.set(
      { carreraUns: request.carrera, estudiante: request.estudiante, codigo: request.codigo },
      () => {
        // console.log("Datos guardados en storage.");

        if (tabIdNotas !== null) {
          // console.log("Intentando cerrar pestaña con tabIdNotas:", tabIdNotas);
          chrome.tabs.remove(tabIdNotas, () => {
            if (chrome.runtime.lastError) {
              console.error("Error cerrando pestaña:", chrome.runtime.lastError.message);
            } else {
              // console.log("Pestaña notas cerrada correctamente.");
              tabIdNotas = null;
            }
            sendResponse({ result: 'Datos guardados y pestaña cerrada' });
          });
        } else {
          // console.log("tabIdNotas es null, no se cerrará pestaña.");
          sendResponse({ result: 'Datos guardados, sin pestaña para cerrar' });
        }
      }
    );

    return true; // Mantener canal asíncrono abierto para sendResponse
  } else if (request.action === 'abrir_pagina_notas') {
    console.log("Mensaje recibido: abrir_pagina_notas");
    if (tabIdNotas !== null) {
      chrome.tabs.reload(tabIdNotas, {}, () => {
        if (chrome.runtime.lastError) {
          console.error('Error recargando pestaña:', chrome.runtime.lastError.message);
        } else {
          console.log('Pestaña recargada sin activar');
        }
      });
    }
  } else {
    console.log("Mensaje recibido desconocido, ejecutando checkCarrera");
    checkCarrera();
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab && tab.url && tab.url.startsWith('https://intranet.unsch.edu.pe/alumno/tickets-comedor')) {
      tabIdTickets = tab.id;
      // console.log('Pestaña tickets-comedor activa, tabId guardado:', tabIdTickets);
      checkCarrera();
    }
  } catch (error) {
    console.error('Error obteniendo pestaña activa:', error);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // console.log("xd")
  if ((changeInfo.url && esUrlValida(changeInfo.url)) ||
      (changeInfo.status === 'complete' && esUrlValida(tab.url))) {
    if (tab.url.startsWith('https://intranet.unsch.edu.pe/alumno/tickets-comedor')) {
      tabIdTickets = tab.id;
      // console.log('Navegó o recargó tickets-comedor, tabId guardado:', tabIdTickets);
    }
    checkCarrera();
  }
});
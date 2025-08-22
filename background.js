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

  const userNameElement = document.querySelector('.m-topbar__name');
  const userName = userNameElement ? userNameElement.textContent.trim() : 'USUARIO NO IDENTIFICADO';

  // console.log(userName);

  if (datos && datos.estudiante === userName) {
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
    // Guardar carrera y estudiante
    chrome.storage.local.set({ carreraUns: request.carrera, estudiante: request.estudiante, codigo: request.codigo }, () => {
      // console.log('Datos guardados en storage desde background');
      sendResponse({ result: 'Datos guardados' });

      if (tabIdNotas !== null) {
        chrome.tabs.remove(tabIdNotas, () => {
          tabIdNotas = null;
        });
      }
    });
    return true; // Mantener canal asíncrono abierto para sendResponse
  } else if (request.action === 'abrir_pagina_notas') {
    chrome.tabs.query({ url: 'https://intranet.unsch.edu.pe/alumno/notas*' }, (tabs) => {
      if (tabs.length === 0) {
        chrome.tabs.create({ url: 'https://intranet.unsch.edu.pe/alumno/notas', active: false });
        // console.log('Pestaña de notas abierta desde background');
      } else {
        // console.log('Pestaña de notas ya existe, activando...');
        chrome.tabs.update(tabs[0].id, { active: true });
      }
    });
  }else{
    // console.log("here!!")
    checkCarrera()
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

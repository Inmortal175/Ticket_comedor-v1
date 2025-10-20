//content.js
let ultimaCarreraEnviada = null;
let ultimoEstudianteEnviado = null;
let ultimoCodigoEnviado = null;
let observer = null;
let retryTimeout = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extraer_datos') {
    // Extraer datos del DOM
    const datos = extraerDatos();
    if (datos) {
      // Enviar datos al background
      chrome.runtime.sendMessage({ action: 'carrera_obtenida', ...datos });
      sendResponse({ status: 'datos enviados' });
    } else {
      sendResponse({ status: 'no se pudo extraer datos' });
    }
    return true; // Mantener canal abierto para sendResponse
  }
});

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

// manejo de Qr
async function procesarQRdesdeImgBase64(qrImageSrc) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = qrImageSrc;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);

      if (code) {
        resolve(code.data);
      } else {
        reject("Decodificación fallida");
      }
    };
    img.onerror = () => reject("Error al cargar la imagen QR");
    alert("Error al cargar la imagen QR")
  });
}
// --- Manejo del modal y botones de impresión y descarga ---

(() => {
  'use strict';

  if (!window.location.href.includes('intranet.unsch.edu.pe/alumno/tickets-comedor')) return;

  let printButtonAdded = false;

  // ============================================
  let qrReplacementDone = false
  // Función para leer el contenido del QR desde la imagen base64
  async function leerContenidoQR(imgElement) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = imgElement.src;
      
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code) {
          resolve(code.data);
        } else {
          reject("No se pudo leer el código QR");
        }
      };
      
      img.onerror = () => reject("Error al cargar la imagen del QR");
    });
  }

  // Función principal para reemplazar el QR
  async function reemplazarQREnModal(modalBody) {
    if (qrReplacementDone) return;

    const qrOriginal = modalBody.querySelector('#ticket_qr');
    if (!qrOriginal) {
      console.warn('No se encontró el QR original');
      return;
    }

    try {
      // Leer el contenido del QR original
      const dataQR = await leerContenidoQR(qrOriginal);
      console.log('Contenido del QR leído:', dataQR);

      // Crear un contenedor temporal oculto para generar el QR
      const contenedorTemporal = document.createElement('div');
      contenedorTemporal.style.cssText = `
        position: absolute;
        left: -9999px;
        width: 600px;
        height: 600px;
      `;
      document.body.appendChild(contenedorTemporal);

      // Generar el QR estilizado en el contenedor temporal
      const logoBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAACXBIWXMAAC4jAAAuIwF4pT92AAAYOklEQVR4nO1de3BU5dn/nbO7yWY3Vy7JJpAYEiRCLEi1JLQ2IuClg3wVp4NT01IHkVho+41Up3ZEp1hbRxgG60yZaf+wY4uttRSF2irUC+2Uz0msGijVKF5yscQSciFhs5dzeb4/wtns7rm95+w5u4nym3lmkn3v7/O8z/uc571xRIRPEdxsDCXl73GxnKyCz3UFMsQ4JhnjtiRzmOgv/kJZ8gWSXC7XVXDTUAOMAQhg6gmvIoTTSjtMFwE4B6AIE6NwOmDaCMNUG0XJOI0J9UoAijF9mA9MThfKVDFlp4mpqAEETIyc6cRwVhCm2KDz5roCSZDgcOdEo1G89dZb+N3vfoeXXnoJkUgEHGcsV0SEgoICrF69GrfddhuWLl2K/Px8p6rEYdJYnRoCTkS5JomIZMoQZ86coQ0bNlAwGEz+KnCUgsEgfetb36Lh4eFMq5uMnPZ/rplvm/GCINC2bdvI6/W6xnAz8nq99IMf/IAkSbLbDAWfOQGw1WOSJNHGjRtzxnAzamtrI1nOSJllnRe5MAJlWJz/3nrrLSxfvhyxWMylKjmL/Px8nDhxAgsWLLCTPLu2QRalzfKof+SRR3I+qjOlPXv2WG22gk/VFGCJ+T/84Q9zzjin6YEHHrDSBQqmvQCIZMHQO3z4cM4Z5Ta9+OKLFvifgGs8ctMGYJ7rRVFEXl4eXKzLlIMgCPB6LblhXLEN3PJKERgr3NTUBJ/P95liPgD4fD40NTVZSeJKB7mhAZgyjMfjTnrYpjXGx8dRUFDAGt1RTeC0BmBi/tatWy8yPwmBQACbN29mje7oiHVSAzBlVFhYiHA47FSZnyoEg0GcP3+eNbojmsApATDNhIjA81NqISxr8Hq9eO6558DzPEZHR8HzPH7605+is7NTM74kSax9lbEQOCEAphmMjo6ipKQk03KmLTweD0RRVP1utDLZ39+PUCjEkn1GQpDpkDRl/vHjx1XMLy4uRklJCUKhEKqqqj61msHj8aChoQH33XefZviNN96IlpYWzbDKykr87W9/YykmsxGcgRPBFH/+859VjpDa2lpVvAcffDDnDho3aP369WxeHoM8nnrqKaY8THilS64Nveeffx5r1qxR/R6Px1W/nT171q1qTHu0trZi37597hVgU3IM8cYbb6gkeffu3aYiLAhCzketk7R27VpVG8PhMK1atYpaWlqopaWFDhw4oIqjpRFffvll0/7T4JMrawGGGBsb0+yM3/zmNywNyDnTnKSysjJV+3bu3JkSp7CwUBXn8ccf18zvk08+YepCK+T4vJ9e6cOHD+tukhBFkYaGhlJ+kySJxsfHHWFAQ0ODqsw9e/a4xvCuri6SJIlEUSRRFFPKFQSBhoaGqK6uLiXNunXrdPuys7NTVQbj7qPcCIBWp7DEj8fjTHlZpeXLl6vyjUajrgmA1b4BQI888oijfaokYyUrRiAZBfp8PgtZTaC4uNh2Wi2sX78enZ2dOHbsGE6ePIljx46p4uTn5+Phhx/G7t278cwzz+DJJ5+0uiqnwquvvor//ve/hnH8fj8AYPfu3Whvb0dtbS2Aid1ORnjvvfewa9eulN8Y+suQV6kxHRj5t956q6VRwRKHc3gEGmH27Nm2R/2cOXMM89arY39/PwGgK664gqmO6fkYTR3Jycwo43MBsVgMv//971W/FxUVZeTgSRfhGTNmIBQKYWxsDIODgylhnEZ8K1iyZAn+79gxIMkzx/M8RFFENBo1TMuqPebNm5cSt7S0NFGOHTz77LOIRCJWVhE1weIKNoyg587UyldpbHqYVtz0fBnq6QrMDpJ4vV4IgpDyGxHB6/UmRhnHcZBlWTNvnufxta99DV6vF5FIBABw4MAB5now9IthA8wEwDBwwYIFOHXqFHPFrDRiuggAoK6bIAjIy8tL/F9QUIDx8XHmvGVZVoXpxb300kvx3nvvmVVRtxG2pwBBEFTMX7hwId5+++2U30RRRFtbG6tfOwEWhm/duhXRaDRjIy5RJoDw+fPYt29fosOtCN7wyAju+f73ceTIkZTft23blvhbkiRs3rwZf//733XzmT9/PlasWIFf/vKX8Hg8KfWoq6vDRx99lIh76tQpCIJg35A2MBAsGSUA6LHHHlPF27Jli2vGm1m+dqmzs9NWfVauXKmZ35IlSxJx/vKXvzDXY+fOnaoybvzKVxz9NLRlgfz2t7/V/F1rlK9fv95OEZoQRRGxWAyxWExlCDqJtrY2CILAPPolSdLUiI2NjSCilHV/ZaSyTC1r165V/Tak02676wV6AmDY8tbWVs3fe3p6VL9JkjNH40dGRuDz+eD3++H3+zFr1ixH8tVCe3s78vLymC10r9eLvLw89PX1pfze0NCginv06FEAbFOL2RdIMr75zW+aRdEs0LIGuPPOO3XDkg2fRAEOrfWbOVrcQFFREVO8dBukvr4ehw4dwv79+1VxZ8+ezVy+he1hAIx5owuNecF4IjGYs5qbm1Xxjx49assGMEuTa7rlllsSdfX5fClhRgdEX3zxReYyjh49qkrf1NSUqT1l3wbYvn27leim8Pl8mlpjOkBx5ABqda71za+A4ZMtI1jmUbpEGIqOicRa1QBaCAQClJ+fn/MRbkYcx1FZWZnmhRTRaDTRnqKiIgoGg+Tz+SgvL89SGXY0gF6/smoAgg7effddvSBHMT4+Pi2OgRMRhoeHNbe4J3sGx8bGEA6HIQiC5m4oq2D5ejDRMik8Zp4CLr/8ctaohqipqZlci1ZqRITHHnsMn//85x0pI1eIx+MgIhQWFua0HlZ4xexC09rWbAdandPV1YW7777bkfxzCaeWtTNF+tqEEZI1gK76v+uuu2xXRhnpLS0tICL8+9//TgmXZTnFVXoRzsCEZ6nqN1PjTyGtTZDf/e53CQCdPn1aFVZcXJxzY85JyqTvtGjjxo2q/FiMQKP6JFeN0raEaUKWZeYC58+fr5leb9vT+vXrc860qSgAX/3qV3WvomtqbmbOx+TCqhQB0MWjjz7qWGekY+3atTln2lQUACO0tLQw5/Poo4+ascBcANK9XE4KgBV1Nh1Iu4ed7Tsrfebz+cxYYP4VYMWiVMBqDY+NjVnO+7OKhoYGDA0NWVoFZeGdoQBo7WJhAat718hlehGpsOtCHh8fRyAQ0A1XrjTXxJ49e2wVygoWr9ZFTMCIiUYw4aHx/F9RUWFrDvN4PGZzDxERLVy4MOfztpOkOck6lE8gELCVV0VFhSEPDF3BdtfgJUlCa2ur46uHF2EdZjzkLkipdqADKlprh6uCRYsW4Z133sm4jKkCra6004cyyeDSNvIGg0HbNpkBi/WNQKe2cl2c59lRV1cHn8+nYn6mkCQpsbs4HboC0Nvb62glLsIcH3zwgW5YJgOpt7cX8+bN0wzTtQGUzYsXMTVgZYNoOl555RXdMF0BSD/c4AacmmamM2pra1X7I5JRUVGBGTNmZNRXhw8f1g3TnQJOnDhhu0BW9FycZkyt9DNnzmRcRvoSfDJ0NcDIyEjGBQPAli1bcPz4cc2waCQCIsL3vvc9R8qaTti8eTOISNeyD4fD+MlPfuJIWYa81HMQlJaWOuokMboJIxwO59yJ4wRZcQQdP35ctz+cvjavtLRUtyxdP0BBQUFGhkc6BgcHMWPGDM2w7u7uFCuV53m0t7eD53msXLkS586dc6weCsrKytDT06O6ql6SJAwODiIej6O7uxvXX389c55aXTk4OIiCggJwHAdBECDLMnieT9yOooUTJ05gyZIl1hpkAL/fnzh6roKeZNhdBtYjo8uNXn/99ZS4PM8nwpYuXerKaF20aJFufZJhJU+n0NPT42hbjZaFs3ZHq64EYsIS9ng8CAQCqKqqSrlgctu2bQiFQpgzZw5CoZDtjZd5eXkoLi7GzJkzMXfuXNx///228skG3n//fUfzM/Ih6E4BmbgetcDzfOKiJKVIu/nbcYroNDMFY2NjmDVrFjiOgyRJICJLn18sZRjhuuuuwz/+8Q/EYjFHL8QIBAK6V/Trfgbq3WphF7IsO5qfGzh79qwjhzfs4uTJk47aXQqM7hHSFYDCwkJXz+Cb4aGHHkI8HsfDDz+sCnNqdGzfvh15eXnweDyIx+P4xS9+AQC49dZb8fTTTwOY0FxG5eldBa9g27ZtCc2XrE04joMoipg1axauvPJKcByHoaEhJ5qlguFBFT3jYNmyZa4YXwpxHGdoCCnx3IRe3QYGBkzjJJOdMrJJV111lW79dDXAsmXL0NHRoS85GYKIEIlEEiMwUwiCAI7jQEQZn9BZvXo13nzzTXAch5GREcTj8cTo5Xk+YYPIsqy7UycWixl64LIJw6NiepLxwgsvZE1CtfavK2EsaGxsTMkv+ey+EVjqZgdTzbH15JNP6tZV9zPQ4pt2GSHTPQPpN3Q4ZciVl5fbSvevf/3LkfKdwpe//GX9QD3JsHIiKFNiGZ2CIKjiLGpc5EjeehQKhcwGewoaGhpyPtq1SOsybgW6GiAbO3lKSkowc+ZMprhalvZlDZcBAN58803mLwPWeHplGiHTa1vdgpFNZHguQDGq3ILWKlVhYaFmmSUlJZg3bx6CwSDC4TB4nse7776LnTt3YunSpQCQMACTGRcMBuHz+eD1euH1ejE6Ospcv7NnzyIvzwdZliGKaofQzJkzE0ahLMuufcZlAtOBbKTS0o0rpykT9axQJBJJSV9YWDhl65oLamxsNGKx8clgt59zv+mmm+iee+6x1Kmtra2JuDzPEzD5FaEsHK1cuVLVlquvvvozKQD79u0z5L+hAEiSlJVKJht4ZnE/+ugj07hbtmxRtaWrq+szKQDJF1ZpNUGxAQgaN0pn60HH5M84URRx/vz5lGvYkrFmzRqcPHkSwMR2qnPnzmF0dBS9vb1obGxELBZTOT6ICDfffLOtev3zn/+0nG4qweyRbuW6eBGApjuuuroaH3/8sfM1SwLZPFChlc5OPkZpjQ6wTvUzD3PnzlVdX5sGThl6XkxoARUOHDiAZcuWOV23FGhdd37bbbehqqoqcV2rx+OBx+PBr3/9a7zzzjuGO2qSUVJSgnPnzqGurg4rVqzAwMBAYv89x3GaDz4oWL16dQatmgTP82hubgYwef3r6dOnXX8w84knnjAKnrwP/wLp3ieCLM1XjO/ipaRJXlSKx+M0e/Zs8ng8THO4HUQiEfL7/cRxHHO7ysvLVflk45FMs26ktIsidXVdthwcrN/RXq9X9ZACMHGZ5cDAQMqyq8/ns320Wgs9PT2IRqOm0w/HcfD5fOB5HmVlZZrhilZzA8w8o0kNoPa1XsCf/vSnrGgAj8dDVVVVtGzZMqbR6PV6CZhw2dbV1amumC0oKGDKxwg1NTU0Z84cuuSSS6i2tpb8fr/dEacLK9qElQ4dOmRWLIhI9WaQDJ33ZbJt8BCDgef3+w2vlS0rK8vYO2el3Sx11oLZphM7MMkv0ah0V7AMna+B+fPnO75ZUQ8cx+GPf/wjKioqwPM8ZFmGx+NBJBLBihUrdF8f+/GPH8L27Q9gfHwcwWAQIyMjOHLkCIqKihKaTpIkxGKxxJ6/dIyNjaW8cuKUO7yrqwv9/f2orKzE2bNn8aUvfSllXwEw8ZaAE4bh/Pnz2SMTEdM0MDo6mpVpwIxqa2sndVhamBWHkhElv+htRT0b6tu0uN/5zndM49glE+cPJfM8XQP4AEjQODJWVFQEj8eT8wOd69atS/zd29uLgYEBzJw5M+WbnWXBx+/34+WXXwYArFq1KmUzppXPXo7j8NRTT6GioiLl93T/QXt7O8LhMC655BLwPJ848JlsBI6MjKCjowNtbW0pL4NZgcfjMXP+qN/jSyNRT2xeeeWVnGsALTevAiuu6+QnW6+44oqUsL6+vkQYiwbQHGImceLxOAHaeyNPnTplu3/ef/993f5RqkYGGgCYsAs0jcFrr71WI3p2YeQAIgtzdfIW9fTt6iw7irxeL+bMmaP7BlBNTQ3Onz+va4R6vV5UVlaira1NFfbhhx+alq+H+vp6o2C1RZsuEWSiBay8eeMGab2iocCKc6W+vj6RLv3x6D/84Q+Tw0Un/a9+9StV+a2trQSk7nFU4lvBwYMHbfVNV1eXWdYqXuut9ui6hm+44YasLRJpIRQK6YZZuXgyuQ1VVVXgOC5hlSdrmdLSUk1njZuPQsQF63saeZ7XfKYuCZrfs0ac1O1NuwaKE1i+fDnuvffejC+xTL6ToLOzE7IsQ5ZlEFHKieDh4WGIooi5c+empE9+DPLBBx/Exo0bcfDgQQDWn3tLh6Sx+8gMtsvUUgtJpLs+UF1dndOpABpqNRaLMac9ceKEJbWcflr629/+9qReTctba8+CFbz22muW+qG6utosS10em10WresY6u7uds2PzQKtB6OteO3WrFmDI0eOQBAEfO5znzONH4/HIcsy7r77bjz++OMIBoOJsIKCgpTTz8kPTsbj8ZTpRpIkdLzeAa9HXX9BECAIAjZt2sTcDiDDG92MpINMtMDPfvazKaUB+vv7HcnHCJ988gkBoGuuuWZyeKXlNzIyopv++htucLQP9u/fb1ZlQ/6yCMCYUe4lJSVZZXp1dTV1dXWlfKsnY+/evbRp0ybm/PTuNZYkSffFjf3796c8gdPR0UEvvfQS7du3j/bu3Zs4WyjLcgoREX3hC19wrC9KSkqMWKMgYwEAEemKdLb2DSr0ox/9iKXRGWsAK3HS0dfXl5W+YOkGM2L9nisFoHlwned5Vw+RKiguLsaCBQuwYcMGR/LjOA7l5eW6Cyfl5eW6+xKToeUI0rsLyUn85z//MYvCZhCxSMkF+rqRqLn9AFQsFmOR+EnRN8mvoaHBUj56YXPnzlX9Ho1GXe2L22+/nanqLGRFAEBEu41KDIVCrjU6/QCIaetN8lu8eLGlfPTCsi0AjOcVmXnK/HLoBXwfwLUAlmoF9vf3O75xROu6+aamJt3zbhzHJW7f5HletXo5ODiIWbNm4eTJk7j66qtV6QVBQHl5OSorK3HZZZdNjJK0+jQ3N2NgYABA9l8L7e/vN4tijQFWpOUCzSaDfQOiKDoq8Xojz256q6ee06F1iWOmZWTSF1rdY4XsCACI6DqjGkQikZwKwMKFC0kURd27CQVBoPb2dtN8Ksq1n1sRBCFB6Z+KsizTjh07HGe+ySOQia6xSnYFAER0r1FNhoeHcyYAd7W1sXSWk6OOiIiCwaArI18UdRdnU5pjh6zaAMnYBeAyABu1AktLS9HX14fq6mpbmW/YsAG1tbWaYTt27ADP85qrkoIo4r777mMqQysf5Y7AWDSKVRYPhhQXF+vex2cXoiiyuNxtG17pu4Lt4AUAN+oF9vX1oaamxnKmDtQra3Brx7TRe0vJxWdShhML+18B8JpeYHV1NYaGhhJ35V2EOfx+P4jIdeYDzmgAYEKQOgBcqRchHo/jqquuYr5AKZebTlihbER1UlstXrxY930FrSpkXKBd40GDvETUYWapbN++3RVD6dNAe/fuZTH2MjL60skpDZCMVwGsMIrw4Ycfmm1e/MwhHA6znmE0fO7XKtzQs9cCeMYoQl1dHSRJcv3Y+XRAc3MziIiV+RwcZD4AR6eAdNrFoseOHTuWc9WbK/r444+zrvLTyU0BABFtYmmZLMv0jW98I+cMyRZt3brVCuNdY342BABE1EREPSytHBsbo8svvzznDHKLFi9ebPh0TraZT1kSABBRkIieZm3x6dOnqb6+PucMc4rq6+s1r7plgOu8yZYAKHQnEY2ztv7MmTPU1NSUcwbapZaWFtZFnHRkjSfZFgAQUQ0RHbTSG7FYjO6///7ExZBTmXiep6efZlZ2WsgqP3IhAAp9nRhtg2R0d3fTunXrcs7odLrjjjtYV+30kBM+5FIAQET5RLSDiPTvMzdANBqlXbt2UXl5edYZXl5eTk888YQdo04LOeNBrgVAoRoi+nmmvTg+Pk6HDh2i5cuXUyAQcIzZgUCAvvjFL9Jf//rXTEd5OnLd7664gjPBpQD+F8AdABxbPpRlGaOjo+ju7sbbb7+NDz74AL29vYkDlYWFhaipqUF9fT0WLVqE2tpaFBcXu7UgRXDHA2sLU00AFFQCuBPA7QDmGUedNphSjFcwVQVAAQfgFgCtAP4HOgdVpzgcXbxxGlNdAJJRDWDtBboWgPE12LnFlBztWphOApCMEICVAG4CcD0AtoeH3IPSidOC6cmYrgKQjjcALMHElKGQm5i2DE/Hp0UAtCBALQzpgqElKFodQpie9ocp/h80Up3h2S86dgAAAABJRU5ErkJggg==";
      
      const qrCodeStyling = new QRCodeStyling({
        width: 300,
        height: 300,
        data: dataQR,
        margin: 11,
        dotsOptions: {
          color: "#000000ff",
          type: "dots"
        },
        cornersSquareOptions: {
          type: "extra-rounded",
          color: "#000000ff"
        },
        cornersDotOptions: {
          type: "dot",
          color: "#000000ff"
        },
        backgroundOptions: {
          color: "#fff"
        },
        image: logoBase64,
        imageOptions: {
          crossOrigin: "anonymous",
          margin: 10,
          imageSize: 0.7,
          hideBackgroundDots: false
        }
      });

      // Agregar el QR al contenedor temporal
      qrCodeStyling.append(contenedorTemporal);

      // Esperar a que el QR se renderice completamente
      await new Promise(resolve => setTimeout(resolve, 500));

      // Obtener el canvas generado
      const canvas = contenedorTemporal.querySelector('canvas');
      
      if (!canvas) {
        throw new Error('No se pudo generar el canvas del QR');
      }

      // Convertir el canvas a base64
      const qrBase64 = canvas.toDataURL('image/png', 1.0);

      // Reemplazar solo el src de la imagen original
      qrOriginal.src = qrBase64;
      
      // Ajustar el tamaño de la imagen para que se vea bien
      qrOriginal.style.maxWidth = 'calc(100% - 45px)';
      qrOriginal.style.maxHeight = 'calc(100% - 45px)';
      qrOriginal.style.objectFit = 'contain';

      // Eliminar el contenedor temporal
      document.body.removeChild(contenedorTemporal);

      qrReplacementDone = true;
      // console.log('QR reemplazado exitosamente en el src de la imagen');     

    } catch (error) {
      console.error('Error al reemplazar el QR:', error);
      
      // Limpiar contenedor temporal si existe
      const temp = document.body.querySelector('[style*="-9999px"]');
      if (temp) {
        document.body.removeChild(temp);
      }
    } finally{
      // Espera adicional para asegurar que cambios se visualicen
      await sleep(150);

      const modalBodyFinal = document.querySelector('#ticket-modal > div > div > div.modal-body');
      if (!modalBodyFinal) return;

      const qrContainer = modalBodyFinal.querySelector('.text-center');
      const imgQr = qrContainer?.querySelector('#ticket_qr');
      if (!imgQr) return;

      // Aplicar estilos al QR
      imgQr.style.cssText = `
        border-radius: 20px 20px 0 0;
        border: var(--primary) solid 5px;
      `;
      imgQr.style.maxWidth = 'calc(100% - 45px)';
      imgQr.style.maxHeight = 'calc(100% - 45px)';
      imgQr.style.objectFit = 'contain';

      const ancho = imgQr.offsetWidth;
      imgQr.parentNode.style.justifyItems = 'center';

      await sleep(200);

      console.log('Ancho del QR:', ancho);

      let ScanMe = document.getElementById('scan-me');
      if (!ScanMe) {
        const spanScanMe = document.createElement('span');
        spanScanMe.style.cssText = `
          display: block;
          color: white;
          background: var(--primary);
          width: ${ancho}px;
          font-size: large;
          font-weight: bold;
          padding: 7px 5px;
          border-radius: 0 0 20px 20px;
          position: relative;
        `;
        spanScanMe.textContent = 'ESCANÉAME!';
        spanScanMe.setAttribute('id', 'scan-me');
        imgQr.insertAdjacentElement('afterend', spanScanMe);
        ScanMe = spanScanMe;

        const css = `
          #scan-me::after {
            content: "";
            position: absolute;
            top: -6px;
            left: 50%;
            transform: translateX(-50%);
            border-left: 15px solid transparent;
            border-right: 15px solid transparent;
            border-top: 10px solid white;
            width: 0;
            height: 0;
          }
        `;

        // Crear el elemento <style>
        const style = document.createElement('style');
        style.type = 'text/css';

        if (style.styleSheet) {
          style.styleSheet.cssText = css; // Para IE
        } else {
          style.appendChild(document.createTextNode(css));
        }

        // Insertar en <head>
        document.head.appendChild(style);


      } else {
        ScanMe.style.width = `${ancho}px`;
      }
    }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }


  // Observador para detectar cuando se muestra el modal
  function observarModal() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // Verificar si se agregaron nodos
        if (mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Buscar el modal del ticket
              const modal = node.id === 'ticket-modal' ? node : node.querySelector('#ticket-modal');
              if (modal && modal.classList.contains('show')) {
                const modalBody = modal.querySelector('.modal-body');
                if (modalBody) {
                  // Esperar un momento para que la imagen del QR se cargue
                  setTimeout(() => {
                    reemplazarQREnModal(modalBody);
                  }, 300);
                }
              }
            }
          });
        }

        // Verificar cambios de atributos (cuando el modal se muestra)
        if (mutation.type === 'attributes' && mutation.target.id === 'ticket-modal') {
          const modal = mutation.target;
          if (modal.classList.contains('show') && !qrReplacementDone) {
            const modalBody = modal.querySelector('.modal-body');
            if (modalBody) {
              setTimeout(() => {
                reemplazarQREnModal(modalBody);
              }, 300);
            }
          }
        }
      }
    });

    // Iniciar observación
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });

    // También verificar si el modal ya existe en la página
    const modalExistente = document.getElementById('ticket-modal');
    if (modalExistente && modalExistente.classList.contains('show')) {
      const modalBody = modalExistente.querySelector('.modal-body');
      if (modalBody) {
        setTimeout(() => {
          reemplazarQREnModal(modalBody);
        }, 300);
      }
    }
  }

  // Reiniciar el flag cuando se cierra el modal
  document.addEventListener('click', (e) => {
    const modal = document.getElementById('ticket-modal');
    if (modal && !modal.classList.contains('show')) {
      qrReplacementDone = false;
    }
  });

  // Inicializar el observador cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observarModal);
  } else {
    observarModal();
  }


  //===============================================================================================================

  function detectTicketModal() {
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        // Detectar cambios en atributos de nodos existentes
        if (mutation.type === 'attributes' && mutation.target.id === 'ticket-modal') {
          const modal = mutation.target;
          if (modal.classList.contains('show') && !printButtonAdded) {
            setTimeout(() => addPrintButtonToModal(modal), 100);
          }
        }
        // Detectar nodos nuevos añadidos al DOM
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

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
  }


  async function addPrintButtonToModal(modal) {
    if (printButtonAdded || modal.querySelector('.ticket-print-btn')) return;

    const modalBody = modal.querySelector('.modal-body');
    const table = modalBody?.querySelector('table');
    if (!modalBody || !table) return;

    // =============
    const qrCode = modalBody?.querySelector('.text-center')

    // const imgQr = qrCode?.querySelector('#ticket_qr');
    // //cofig. el qr para que se muestre con bordes
    // imgQr.style.cssText = `
    //   border-radius: 10px 10px 0 0;
    //   border: var(--primary) solid 5px;
    // `

    // let width = imgQr?.width
    // alert(width)
    // const spanScanMe = document.createElement('span');

    // spanScanMe.style.cssText = `
    //   display: block;
    //   color: white;
    //   background: var(--primary);
    //   width: ${width + 10}px;
    //   font-size: large;
    //   font-weight: bold;
    //   padding: 7px 5px;
    //   border-radius: 0 0 7px 7px;
    // `

    // spanScanMe.textContent = 'SCAN ME'

    // imgQr.insertAdjacentElement('afterend', spanScanMe); //se pone el texto

    const h3 = document.createElement('h3');
    h3.textContent = 'TICKET COMEDOR UNSCH';
    h3.style.cssText = `
      background: var(--primary);
      color: white;
      text-align: center;
      padding: 20px 5px;
      border-radius: 12px 12px 0 0;
    `
    h3.setAttribute('id', 'title-h3')
    qrCode.insertAdjacentElement('beforebegin', h3);
    h3.style.display = 'none'

    // texto del desarrollador
    const devText = document.createElement('span');
    devText.innerHTML = `
    <div style="font-size: 10px;  text-align: center; margin-top: 5px;">
  <span>Desarrollado por: FIGUEROA PEREZ, Franklin</span><br><span>${new Date().toLocaleDateString('es-PE')} - ${new Date().toLocaleTimeString('es-PE')}</span>
</div>
    `
    devText.style.cssText = `
      display: block;
      background: var(--primary);
      color: white;
      text-align: center;
      padding: 20px 5px;
      border-radius: 0 0 12px 12px;
    `
    devText.setAttribute('id', 'dev-text')

    table.insertAdjacentElement('afterend', devText);
    devText.style.display = 'none'

    // crearemos un boton de compartir
    const share_btn = document.createElement('button');
    share_btn.className = 'ticket-print-btn btn btn-primary';
    share_btn.type = 'button';
    share_btn.setAttribute('id', 'share-btn');
    // share_btn.textContent = 'Compartir en WhatsApp'

    share_btn.style.cssText = `
      width: 100%; margin-top: 15px; padding: 10px;
      background-color: #5d0104; color: white;
      font-size: 14px; font-weight: bold;
      border-radius: 5px; cursor: pointer;
      text-align: center; user-select: none;
    `;
    share_btn.style.display = 'none'

    // Crear el icono <i> y agregar la clase
    const icon = document.createElement('i');
    icon.className = 'la la-whatsapp';

    // Agregar icono al botón
    share_btn.appendChild(icon);

    // Agregar un espacio y luego el texto
    share_btn.appendChild(document.createTextNode('Compartir en WhatsApp'));

    table.insertAdjacentElement('afterend', share_btn);

    // ============
    // const printButton = document.createElement('button');
    // printButton.className = 'ticket-print-btn btn btn-primary';
    // printButton.type = 'button';
    // printButton.setAttribute('aria-label', 'Opciones ticket de comedor');
    // printButton.textContent = 'Opciones Ticket';

    // printButton.style.cssText = `
    //   width: 100%; margin-top: 15px; padding: 10px;
    //   background-color: #5d0104; color: white;
    //   font-size: 14px; font-weight: bold;
    //   border-radius: 5px; cursor: pointer;
    //   text-align: center; user-select: none;
    // `;

    // printButton.addEventListener('mouseenter', () => { printButton.style.backgroundColor = '#8f0206'; });
    // printButton.addEventListener('mouseleave', () => { printButton.style.backgroundColor = '#5d0104'; });

    // printButton.addEventListener('click', e => {
    //   e.preventDefault();
    //   e.stopPropagation();
    //   openPrintOrDownloadWindow();
    // });

    // table.insertAdjacentElement('afterend', printButton);
    printButtonAdded = true;

    //=====
    const datosUsuario = await new Promise(resolve => {
      chrome.storage.local.get(['estudiante', 'carreraUns', 'codigo'], result => {
        resolve(result);
      });
    });

    const userName = datosUsuario.estudiante || 'USUARIO NO IDENTIFICADO';
    const userCarrera = datosUsuario.carreraUns || 'CARRERA NO IDENTIFICADA';
    const userCodigo = datosUsuario.codigo || 'SIN CÓDIGO';
    
    const htmlContent = `
    <table class=" w-100" style="margin-bottom: 3px">
        <tbody>
        <tr>
            <td ><strong>ESCUELA</strong></td>
            <td align="right" >${userCarrera}</td>
        </tr>
        <tr>
            <td ><strong>EST.</strong></td>
            <td align="right" >${userName}</td>
        </tr>
        <tr>
            <td  ><strong>CÓD.</strong></td>
            <td align="right" >${userCodigo}</td>
        </tr>
    </tbody></table>
    `
    const div = document.createElement('div');
    div.innerHTML = htmlContent

    table.insertAdjacentElement('afterend', div);

    if (navigator.share && navigator.canShare) {
      const shareBtn = document.getElementById('share-btn');
      if (shareBtn) {
        shareBtn.style.display = 'block';
      }
    }

    // Botón de compartir en WhatsApp (solo en móviles)
    const shareBtn = document.getElementById('share-btn');
    if (shareBtn) {
      shareBtn.addEventListener('click', shareTicketToWhatsApp);
    }
  }
  // ========= inicializar botones para compartir =================
  // Convertir el ticket a imagen y compartir
  async function shareTicketToWhatsApp() {
    // config. los decoradores
      const h3 = document.getElementById('title-h3');
      const devText = document.getElementById('dev-text');
      
    try {
      const modalBody = document.querySelector('#ticket-modal > div > div > div.modal-body');
      if (!modalBody) {
        alert('No se encontró el ticket para compartir');
        return;
      }

      // Mostrar indicador de carga
      const shareBtn = document.getElementById('share-btn');
      const originalText = shareBtn.textContent;
      shareBtn.textContent = 'Generando...';
      shareBtn.disabled = true;
      shareBtn.style.display = 'none';

      //mostramos los decoradores
      h3.style.display = 'block';
      devText.style.display = 'block';

      // Convertir el ticket a canvas usando html2canvas
      const canvas = await html2canvas(modalBody, {
        scale: 3,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true
      });

      // Convertir canvas a blob
      const blob = await new Promise(resolve => {
        canvas.toBlob(resolve, 'image/png', 1.0);
      });

      // Crear un archivo con el blob
      const fileName = `ticket-comedor-${new Date().getTime()}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      // Verificar si podemos compartir este archivo
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Ticket Comedor UNSCH',
          text: 'Mi ticket del comedor universitario'
        });
        console.log('Imagen compartida exitosamente');
      } else {
        // Fallback: descargar la imagen si no se puede compartir
        downloadImage(canvas, fileName);
        alert('Tu dispositivo no soporta compartir archivos. La imagen se descargará.');
      }

      // Restaurar botón
      shareBtn.textContent = originalText;
      shareBtn.disabled = false;

      shareBtn.style.display = 'block';

      //ocultamos los decoradores
      h3.style.display = 'none';
      devText.style.display = 'none';

    } catch (error) {
      console.error('Error al compartir:', error);
      
      // Restaurar botón en caso de error
      const shareBtn = document.getElementById('share-btn');
      if (shareBtn) {
        shareBtn.textContent = "Compartir en WhatsApp"
        shareBtn.disabled = false;
      }

      // Si el error es porque el usuario canceló, no mostrar alerta
      if (error.name !== 'AbortError') {
        alert('Hubo un error al intentar compartir. Por favor, intenta nuevamente.');
      }
    }
  }
  // Función para descargar imagen (fallback)
  function downloadImage(canvas, fileName) {
    const link = document.createElement('a');
    link.download = fileName;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  

  // Inicializar eventos cuando el DOM esté listo
  function initializeEventListeners() {
    // Mostrar botón de compartir solo si el dispositivo lo soporta
    if (navigator.share && navigator.canShare) {
      const shareBtn = document.getElementById('share-btn');
      if (shareBtn) {
        shareBtn.style.display = 'block';
      }
    }

    // Botón de compartir en WhatsApp (solo en móviles)
    const shareBtn = document.getElementById('share-btn');
    if (shareBtn) {
      shareBtn.addEventListener('click', shareTicketToWhatsApp);
    }
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    alert('init')
  })
  // ========= inicializar botones compartir =================

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

    let dataQR = '';
    try {
      dataQR = await procesarQRdesdeImgBase64(qrImageSrc);
    } catch (err) {
      console.error(err);
      alert('No se pudo decodificar el código QR. '+ qrImageSrc);
      return;
    }

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

    const printWindow = window.open('', '_blank', 'width=800,height=850');
    // En tu content.js, dentro de la función openPrintOrDownloadWindow()
// Reemplaza completamente la variable htmlContent con esto:

const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Ticket Download - UNSCH by Franklin F.P</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;user-select: none;}
    body {
      width: 58mm;
      margin: 0 auto;
      box-sizing: border-box;
    }

    body.moderno {
      width: 95mm;
    }

    .ticket.moderno {
      text-align: center;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #dae7f0;
      color: #2d3748;
      border-radius: 12px;
      box-shadow: 0 4px 8px rgba(0,0,0,0.1);
      width: 71mm;
      padding: 15px 25px;
    }

    .moderno .header {
      border-bottom: 2px solid #cbd5e0;
      padding-bottom: 8px;
      margin-bottom: 12px;
    }

    .moderno .university {
      font-weight: 700;
      font-size: 14px;
      margin-bottom: 4px;
      letter-spacing: 0.1em;
      color: #4a5568;
    }

    .moderno .title {
      font-weight: 700;
      font-size: 16px;
      color: #2b6cb0;
      margin-bottom: 16px;
    }

    .moderno .qr-code {
        background: white;
        color: #333;
        text-align: center;
        font-weight: bold;
        cursor: pointer;
        transition: background 0.3s, box-shadow 0.3s;
        width: 52mm;
        height: 52mm;
        margin: 0 auto 20px auto;
        border-radius: 12px;
        padding: 4mm;
    }
    
    .ticket.moderno .qr-code canvas {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: contain;
    }

    .moderno .user-section {
      display: grid;
      grid-template-columns: 30% 70%;
      gap: 1px;
      margin-bottom: 12px;
      justify-content: space-between;
      align-content: center;
      align-items: center;
    }

    .moderno .user-label {
      font-weight: 600;
      font-size: 12px;
      color: #718096;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      text-align: start;
    }

    .moderno .user-name {
      font-weight: 500;
      font-size: 13px;
      color: #2d3748;
      word-wrap: break-word;
      text-align: end;
      padding: 3mm;
    }

    .moderno .info-section {
      font-size: 13px;
      color: #4a5568;
      margin-top: 8px;
    }

    .moderno .info-line {
      display: flex;
      justify-content: space-between;
      border-bottom: 1px solid #e2e8f0;
      padding: 4px 0;
      font-weight: 600;
    }

    .moderno .footer {
      margin-top: 24px;
      font-size: 11px;
      color: #a0aec0;
      text-align: center;
      font-style: italic;
    }

    .wrapper:has(.ticket.moderno) + .button-container #print-btn {
      display: none;
    }

    .wrapper:has(.ticket.moderno){
      display: flex;
      justify-content: center;
      background: white;
      padding: 20px 14px;
      width: 95mm;
    }

    .ticket.moderno .separator{
      display: none;
    }

    body{font-family:'Courier New', Consolas, monospace;font-size:12px;line-height:1.2;width:58mm;margin:0 auto;padding:2mm;background:#fff;color:#000;}
    .ticket.clasico {
      width: 54mm;
      text-align: center;
      font-family: 'Courier New', Consolas, monospace;
      font-size: 12px;
      line-height: 1.2;
      margin: 0 auto;
      padding: 2mm;
      background: #fff;
      color: #000;
    }

    .ticket.clasico .header {
      border-bottom: 1px dashed #000;
      padding-bottom: 3mm;
      margin-bottom: 3mm;
    }

    .ticket.clasico .university {
      font-weight: bold;
      font-size: 12px;
      margin-bottom: 1mm;
      letter-spacing: 0.5px;
    }

    .ticket.clasico .title {
      font-weight: bold;
      font-size: 12px;
      margin-bottom: 1mm;
    }

    .ticket.clasico .qr-section {
      margin: 3mm 0;
      text-align: center;
    }

    .ticket.clasico .qr-code {
      width: 48mm;
      height: 48mm;
      margin: 2mm auto;
      display: block;
      padding: 2mm;
    }

    .ticket.clasico .qr-code canvas {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: contain;
    }

    .ticket.clasico .user-section {
      margin: 3mm 0;
      padding: 2mm 0;
      border-top: 1px dashed #000;
      border-bottom: 1px dashed #000;
    }

    .ticket.clasico .user-label {
      font-size: 13px;
      font-weight: bold;
      margin-bottom: 1mm;
    }

    .ticket.clasico .user-name {
      font-size: 11px;
      font-weight: bold;
      word-wrap: break-word;
      margin-bottom: 1.5mm;
    }

    .ticket.clasico .info-section {
      text-align: left;
      margin: 2mm 0;
    }

    .ticket.clasico .info-line {
      display: flex;
      justify-content: space-between;
      margin: 1mm 0;
      font-size: 11px;
      border-bottom: 1px dotted #ccc;
      padding-bottom: 0.5mm;
    }

    .ticket.clasico .info-label {
      font-weight: bold;
      width: 40%;
      text-transform: uppercase;
    }

    .ticket.clasico .info-value {
      width: 60%;
      text-align: right;
      font-weight: bold;
    }

    .ticket.clasico .footer {
      margin-top: 3mm;
      padding-top: 2mm;
      border-top: 1px dashed #000;
      font-size: 12px;
      text-align: center;
      line-height: 1.3;
    }

    .ticket.clasico .timestamp {
      margin: 1mm 0;
      font-size: 11px;
    }

    .ticket.clasico .instructions {
      font-size: 12px;
      margin-top: 2mm;
      text-align: center;
      font-style: italic;
    }

    .ticket.clasico .dev {
      font-size: 10px;
      margin-top: 2mm;
      text-align: center;
      font-weight: bold;
    }

    .ticket.clasico .separator {
      text-align: center;
      margin: 2mm 0;
      font-size: 8px;
    }

    .button-container {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin: 10px 0;
      justify-content: center;
    }

    .button-container button {
      flex: 1;
      padding: 10px;
      font-weight: bold;
      border: none;
      color: #fff;
      border-radius: 5px;
      cursor: pointer;
      user-select: none;
    }

    #share-whatsapp-btn {
      background-color: #25D366;
      display: None
    }

    #share-whatsapp-btn:hover {
      background-color: #1da851;
    }

    #share-whatsapp-btn:disabled {
      background-color: #86e6ab;
      cursor: not-allowed;
    }

    #print-btn {
      background-color: #28a745;
    }

    #print-btn:hover {
      background-color: #218838;
    }

    #download-btn {
      background-color: #007bff;
    }

    #download-btn:hover {
      background-color: #0056b3;
    }

    @media print {
      @page {
        size: 58mm auto;
        margin: 0;
      }
      .clasico .qr-code {
        width: 48mm !important;
        height: 48mm !important;
      }
      .moderno .qr-code {
          background: white;
          transition: background 0.3s, box-shadow 0.3s;
          width: 52mm;
          height: 52mm;
          margin: 0 auto 20px auto;
          border-radius: 12px;
          padding: 4mm;
      }
      .button-container {
        display: none !important;
      }
      #toggle-style-btn, #autor-btn{
        display: none !important;
      }
      #current-style-label{
        display: none;
      }
    }
  .dev{font-size:10px;margin-top:2mm;text-align:center;font-weight:bold; margin-bottom: 4mm}
    
  /* botón cambio estilo */
  #toggle-style-btn {
    display: block;
    margin: 10px auto;
    padding: 8px 14px;
    font-weight: bold;
    background-color: #5d0104;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    user-select: none;
  }
  #toggle-style-btn:hover {
    background-color: #8f0206;
  }
  /* Etiqueta estilo actual */
  #current-style-label {
    text-align: center;
    font-size: 12px;
    font-weight: bold;
    color: #5d0104;
    user-select: none;
    margin-bottom: 10px;
  }

  /* Botón autor */
  #autor-btn {
    display: block;
    margin: 10px auto 10px auto;
    padding: 8px 14px;
    font-weight: bold;
    background-color: #444;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    user-select: none;
  }
  #autor-btn:hover {
    background-color: #222;
  }

  /* Modal */
  #modal-autor {
    display: none;
    position: fixed;
    z-index: 10000;
    top: 0; left: 0;
    width: 100vw;
    height: 100vh;
    background-color: rgba(0,0,0,0.6);
    justify-content: center;
    align-items: center;
    animation: fadeIn 0.3s ease forwards;
  }
  #modal-autor.active {
    display: flex;
  }
  #modal-autor .modal-content {
    background: #fff;
    border-radius: 12px;
    padding: 24px 30px;
    max-width: 400px;
    width: 90%;
    box-shadow: 0 10px 25px rgba(0,0,0,0.3);
    text-align: center;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    color: #333;
    position: relative;
  }
  #modal-autor h2 {
    margin-bottom: 18px;
    font-weight: 700;
    font-size: 24px;
    color: #2b6cb0;
  }
  #modal-autor .close-btn {
    position: absolute;
    top: 18px;
    right: 22px;
    background: transparent;
    border: none;
    font-size: 26px;
    cursor: pointer;
    color: #666;
    transition: color 0.2s ease;
  }
  #modal-autor .close-btn:hover {
    color: #2b6cb0;
  }
  #modal-autor .autor-foto {
    border-radius: 50%;
    width: 120px;
    height: 120px;
    margin: 0 auto 16px;
    object-fit: cover;
    border: 4px solid #2b6cb0;
  }
  #modal-autor p {
    font-size: 16px;
    margin: 12px 0;
  }
  #modal-autor .social-links {
    display: flex;
    justify-content: center;
    gap: 20px;
    margin-top: 18px;
  }
  #modal-autor .social-links a img {
    width: 36px;
    height: 36px;
    filter: grayscale(100%);
    transition: filter 0.3s ease;
    cursor: pointer;
  }
  #modal-autor .social-links a:hover img {
    filter: none;
  }
  @keyframes fadeIn {
    from {opacity: 0;}
    to {opacity: 1;}
  }

  .moderno .footer {
    background-color: #fff3cd;
    color: #856404;
    padding: 14px 18px;
    border-radius: 14px;
    box-shadow: 0 4px 12px rgba(217, 119, 6, 0.25);
    text-align: center;
    font-size: 13px;
    font-weight: 700;
    user-select: none;
    margin-top: 24px;
    width: calc(100% - 40px);
    max-width: 320px;
    margin-left: auto;
    margin-right: auto;
    border: 1.5px solid #e6d49a;
  }

  .moderno .footer .timestamp {
    margin-bottom: 6px;
    font-style: italic;
    font-weight: 600;
    font-size: 12px;
    color: #b45309;
  }

  .moderno .footer .instructions {
    margin-bottom: 8px;
    font-size: 14px;
  }

  .moderno .footer .separator {
    color: #f59e0b80;
    letter-spacing: 0.15em;
  }

    </style>
</head>
<body>
  <button id="autor-btn" type="button">Sobre el Desarrollador</button>
  <button id="toggle-style-btn" type="button">Cambiar estilo</button>
  <div id="current-style-label">Estilo actual: Clásico</div>

  <div class="wrapper" id="ticket-wrapper">
    <div class="ticket clasico" id="ticket-container">
      <div class="header">
        <div class="separator">..........................</div>
        <div class="university">UNIV. NAC. SAN CRISTOBAL</div>
        <div class="university">DE HUAMANGA</div>
        <div class="title">TICKET COMEDOR</div>
      </div>
      <div class="qr-section"><div id="qr-stylized-container" class="qr-code"></div></div>
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
  </div>

  <div class="button-container">
    <button id="share-whatsapp-btn" type="button">
      📱 Compartir en WhatsApp
    </button>
    
    <button id="print-btn" type="button">
      🖨️ Imprimir Ticket
    </button>
    
    <button id="download-btn" type="button">
      💾 Descargar Imagen
    </button>
  </div>

  <!-- Modal autor -->
  <div id="modal-autor" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1">
    <div class="modal-content">
      <button class="close-btn" aria-label="Cerrar">&times;</button>
      <h2 id="modal-title">Sobre el Desarrollador</h2>
      <img src="https://scontent.fjau2-1.fna.fbcdn.net/v/t1.6435-9/190482940_328082622263108_3758047804536742904_n.jpg?_nc_cat=103&ccb=1-7&_nc_sid=6ee11a&_nc_eui2=AeFXXRhL5Xf836MqIxIZ-gkznFw5ERa8rUacXDkRFrytRvJwcCoyRQ77cEzhVCLR6FeoHhKbal8aK222zb-GImAs&_nc_ohc=llnxDh1xvmUQ7kNvwFXVPaz&_nc_oc=AdmGO9t4dl4O4kbbaiVzKFSKI5j6yTCM6872VPC9oeXrz7xKOcVg2vERj7Ecml6Jtw9INrGPacMPRVtjzoXKE-_M&_nc_zt=23&_nc_ht=scontent.fjau2-1.fna&_nc_gid=mYXIhxxm4gkd5FE1SERYzQ&oh=00_AfWogSwP2cmlvkoFcvdH1SFc9Qqa7jc0hWXcg0WS3esfgA&oe=68DBC069" alt="Foto de Franklin F.P." class="autor-foto" />
      <p>Hola, soy Franklin F.P., desarrollador web con pasión por crear soluciones elegantes y funcionales.</p>
      <p>Este proyecto fue desarrollado con tecnologías modernas para ofrecer la mejor experiencia.</p>
      <p>Conéctate conmigo para colaborar o saber más:</p>
      <div class="social-links">
        <a href="https://www.facebook.com/franklin175" target="_blank" rel="noopener" aria-label="Facebook de Franklin">
          <img src="https://upload.wikimedia.org/wikipedia/commons/0/05/Facebook_Logo_%282019%29.png" alt="Facebook" />
        </a>
        <a href="https://web.whatsapp.com/send/?phone=51940447433&text=Hola%20me%20interesa%20tu%20trabajo" target="_blank" rel="noopener" aria-label="WhatsApp de Franklin">
          <img src="https://www.svgrepo.com/show/134581/whatsapp.svg" alt="WhatsApp" />
        </a>
        <a href="mailto:franklin.figueroa.27@unsch.edu.pe" target="_blank" aria-label="Correo Electrónico de Franklin">
          <img src="https://www.google.com/a/cpanel/unsch.edu.pe/images/favicon.ico" alt="Correo" />
        </a>
      </div>
      <p style="margin-top: 20px; font-size: 13px; color: gray;">Gracias por usar esta extensión.</p>
    </div>
  </div>
</body>
</html>
`;

    printWindow.document.write(htmlContent);
    printWindow.document.close();

    printWindow.onload = () => {
      const logoBase64 = "data:image/png;base64,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";
      const qrCodeStyling = new QRCodeStyling({
        width: 600,
        height: 600,
        data: dataQR,
        dotsOptions: {
          color: "#000000ff",
          type: "dots"
        },
        cornersSquareOptions: {
          type: "extra-rounded",
          color: "#000000ff"
        },
        cornersDotOptions: {
          type: "dot",
          color: "#000000ff"
        },
        backgroundOptions: {
          color: "#fff"
        },
        image: logoBase64,
        imageOptions: {
          crossOrigin: "anonymous",
          margin: 10,
          imageSize: 0.3,
          hideBackgroundDots: false
        }
      });

      const container = printWindow.document.getElementById('qr-stylized-container');
      if (container) {
        container.innerHTML = '';
        qrCodeStyling.append(container);
      }
    };

    const scriptHtml2canvas = printWindow.document.createElement('script');
    scriptHtml2canvas.src = chrome.runtime.getURL('libs/html2canvas.min.js');
    printWindow.document.head.appendChild(scriptHtml2canvas);

    scriptHtml2canvas.onload = () => {
      const scriptTicketActions = printWindow.document.createElement('script');
      scriptTicketActions.src = chrome.runtime.getURL('scripts/ticketActions.js');
      printWindow.document.head.appendChild(scriptTicketActions);
    };

    const scriptjsQR = printWindow.document.createElement('script');
    scriptjsQR.src = chrome.runtime.getURL('libs/jsqr-1.0.3-min.js');
    printWindow.document.head.appendChild(scriptjsQR);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(detectTicketModal, 1000);
      setTimeout(initializeEventListeners, 1000);
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

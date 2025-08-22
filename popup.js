document.addEventListener('DOMContentLoaded', function() {
    const printButton = document.getElementById('printPopup');
    const findButton = document.getElementById('findAndPrint');
    const status = document.getElementById('status');

    function showStatus(message, type = 'success') {
        status.innerHTML = `<div class="${type}">${message}</div>`;
        setTimeout(() => {
            status.innerHTML = '';
        }, 3000);
    }

    // Función principal para imprimir popup
    printButton.addEventListener('click', async function() {
        try {
            const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
            
            chrome.scripting.executeScript({
                target: {tabId: tab.id},
                function: printPopupContent
            });
            
            showStatus('🖨️ Imprimiendo popup...', 'success');
        } catch (error) {
            showStatus('❌ Error al imprimir', 'error');
            console.error('Error:', error);
        }
    });

    // Función para buscar y imprimir
    findButton.addEventListener('click', async function() {
        try {
            const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
            
            const result = await chrome.scripting.executeScript({
                target: {tabId: tab.id},
                function: findAndPrintPopup
            });
            
            if (result[0].result) {
                showStatus('✅ Popup encontrado e impreso', 'success');
            } else {
                showStatus('⚠️ No se encontró ningún popup', 'error');
            }
        } catch (error) {
            showStatus('❌ Error en la búsqueda', 'error');
            console.error('Error:', error);
        }
    });
});

// Función que se ejecuta en la página para imprimir el popup
function printPopupContent() {
    // Buscar específicamente el modal del ticket
    const ticketModal = document.getElementById('ticket-modal');
    
    if (!ticketModal) {
        alert('No se encontró el modal de ticket. Asegúrate de que esté abierto.');
        return;
    }

    // Verificar si el modal está visible
    const isVisible = ticketModal.classList.contains('show') && 
                     ticketModal.style.display !== 'none';
    
    if (!isVisible) {
        alert('El modal de ticket no está visible. Por favor ábrelo primero.');
        return;
    }

    // Función unificada para imprimir el ticket
function printTicket() {
    // Obtener datos del ticket
    const ticketDate = document.getElementById('ticket_date')?.textContent || 'N/A';
    const ticketType = document.getElementById('ticket_type')?.textContent || 'N/A';
    const ticketTime = document.getElementById('ticket_time')?.textContent || 'N/A';
    const qrImage = document.getElementById('ticket_qr')?.src || '';
    
    // Obtener nombre del usuario
    const userNameElement = document.querySelector('.m-topbar__name');
    const userName = userNameElement ? userNameElement.textContent.trim() : 'USUARIO NO IDENTIFICADO';

    if (!qrImage) {
        alert('No se pudo obtener el código QR del ticket.');
        return;
    }

    // Crear ventana de impresión optimizada para POS 58mm
    const printWindow = window.open('', '_blank', 'width=220,height=800');
    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Ticket POS - UNSCH</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body { 
                    font-family: 'Courier New', Consolas, monospace; 
                    font-size: 12px;
                    line-height: 1.2;
                    width: 58mm;
                    margin: 0 auto;
                    padding: 2mm;
                    background: white;
                    color: #000;
                }
                
                .ticket {
                    width: 100%;
                    text-align: center;
                }
                
                .header {
                    border-bottom: 1px dashed #000;
                    padding-bottom: 3mm;
                    margin-bottom: 3mm;
                }
                
                .university {
                    font-weight: bold;
                    font-size: 12px;
                    margin-bottom: 1mm;
                    letter-spacing: 0.5px;
                }
                
                .title {
                    font-weight: bold;
                    font-size: 12px;
                    margin-bottom: 1mm;
                }
                
                .qr-section {
                    margin: 3mm 0;
                    text-align: center;
                }
                
                .qr-code {
                    width: 48mm;
                    height: 48mm;
                    margin: 2mm auto;
                    display: block;
                    border: 1.5px dashed #000000ff;
                }
                
                .user-section {
                    margin: 3mm 0;
                    padding: 2mm 0;
                    border-top: 1px dashed #000;
                    border-bottom: 1px dashed #000;
                }
                
                .user-label {
                    font-size: 12px;
                    font-weight: bold;
                    margin-bottom: 1mm;
                }
                
                .user-name {
                    font-size: 11px;
                    font-weight: bold;
                    word-wrap: break-word;
                    line-height: 1.1;
                }
                
                .info-section {
                    text-align: left;
                    margin: 2mm 0;
                }
                
                .info-line {
                    display: flex;
                    justify-content: space-between;
                    margin: 1mm 0;
                    font-size: 11px;
                    border-bottom: 1px dotted #ccc;
                    padding-bottom: 0.5mm;
                }
                
                .info-label {
                    font-weight: bold;
                    width: 40%;
                    text-transform: uppercase;
                }
                
                .info-value {
                    width: 60%;
                    text-align: right;
                    font-weight: bold;
                }
                
                .footer {
                    margin-top: 3mm;
                    padding-top: 2mm;
                    border-top: 1px dashed #000;
                    font-size: 12px;
                    text-align: center;
                    line-height: 1.3;
                }
                
                .timestamp {
                    margin: 1mm 0;
                    font-size: 11px;
                }
                
                .instructions {
                    font-size: 12px;
                    margin-top: 2mm;
                    text-align: center;
                    font-style: italic;
                }
                
                .separator {
                    text-align: center;
                    margin: 2mm 0;
                    font-size: 8px;
                }
                
                @media print {
                    @page { 
                        size: 58mm auto;
                        margin: 0;
                    }
                    body { 
                        print-color-adjust: exact !important; 
                        -webkit-print-color-adjust: exact !important;
                        margin: 0;
                        padding: 2mm;
                        font-size: 10px;
                    }
                    .qr-code {
                        width: 48mm !important;
                        height: 48mm !important;
                    }
                }
            </style>
        </head>
        <body>
            <div class="ticket">
                <!-- Header -->
                <div class="header">
                
                    <div class="university">..........................</div>
                    <div class="university">UNIV. NAC. SAN CRISTOBAL</div>
                    <div class="university">DE HUAMANGA</div>
                    <div class="title">TICKET COMEDOR</div>
                </div>
                
                <!-- QR Code -->
                <div class="qr-section">
                    <img src="${qrImage}" alt="QR" class="qr-code">
                </div>
                
                <!-- User Info -->
                <div class="user-section">
                    <div class="user-label">ESTUDIANTE:</div>
                    <div class="user-name">${userName}</div>
                </div>
                
                <!-- Ticket Info -->
                <div class="info-section">
                    <div class="info-line">
                        <span class="info-label">FECHA:</span>
                        <span class="info-value">${ticketDate}</span>
                    </div>
                    <div class="info-line">
                        <span class="info-label">TURNO:</span>
                        <span class="info-value">${ticketType}</span>
                    </div>
                    <div class="info-line">
                        <span class="info-label">HORARIO:</span>
                        <span class="info-value">${ticketTime}</span>
                    </div>
                </div>
                
                <div class="separator">================================</div>
                
                <!-- Footer -->
                <div class="footer">
                    <div class="timestamp">
                        ${new Date().toLocaleDateString('es-PE', {
                            day: '2-digit',
                            month: '2-digit', 
                            year: 'numeric'
                        })} - ${new Date().toLocaleTimeString('es-PE', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false
                        })}
                    </div>
                    <div class="instructions">
                        CONSERVE ESTE TICKET<br>
                    </div>
                    <div class="separator">================================</div>
                </div>
            </div>
            
            <script>
                window.addEventListener('load', function() {
                    // Dar tiempo para cargar la imagen QR
                    setTimeout(function() {
                        window.print();
                        
                        // Cerrar después de imprimir
                        window.addEventListener('afterprint', function() {
                            setTimeout(function() {
                                window.close();
                            }, 300);
                        });
                        
                        // Fallback para cerrar si no detecta afterprint
                        setTimeout(function() {
                            window.close();
                        }, 3000);
                    }, 1000);
                });
            </script>
        </body>
        </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
}

    printTicket();
}

// Función para buscar el modal específicamente
function findAndPrintPopup() {
    const ticketModal = document.getElementById('ticket-modal');
    
    if (!ticketModal) {
        alert('No se encontró el modal de ticket en esta página.');
        return false;
    }

    const isVisible = ticketModal.classList.contains('show') && 
                     ticketModal.style.display !== 'none';
    
    if (!isVisible) {
        alert('El modal de ticket existe pero no está visible. Por favor ábrelo primero.');
        return false;
    }

    printTicket();
    return true;
}


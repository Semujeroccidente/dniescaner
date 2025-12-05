class CameraManager {
    constructor() {
        this.stream = null;
        this.videoElement = null;
        this.canvasElement = null;
        this.modal = null;
        this.activeSide = null; // 'front' or 'back'
        this.onCapture = null; // Callback function
        this._videoReady = false;
    }

    _initElements() {
        // Initialize DOM elements only when needed
        if (!this.videoElement) {
            this.videoElement = document.getElementById('camera-video');
            this.canvasElement = document.getElementById('camera-canvas');
            this.modal = document.getElementById('camera-modal');

            if (!this.videoElement || !this.canvasElement || !this.modal) {
                console.error('CameraManager: Required DOM elements not found');
                return false;
            }

            // Add metadata listener
            this.videoElement.addEventListener('loadedmetadata', () => {
                this._videoReady = true;
                console.log('Camera: Video metadata loaded');
            });
        }
        return true;
    }

    async startCamera(side, callback) {
        console.log(`CameraManager: Starting camera for ${side}`);

        // Initialize DOM elements
        if (!this._initElements()) {
            alert('Error: No se pudieron inicializar los elementos de la cámara.');
            return;
        }

        this.activeSide = side;
        this.onCapture = callback;
        this.modal.classList.remove('hidden');

        // Check if we're in a secure context
        if (!window.isSecureContext) {
            if (typeof UIHelpers !== 'undefined' && UIHelpers.showNotification) {
                UIHelpers.showNotification('Cámara requiere HTTPS. Use Subir', 'error');
            } else {
                alert('La cámara requiere HTTPS.');
            }
            this.closeCamera();
            return;
        }

        // Check if getUserMedia is available
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            if (typeof UIHelpers !== 'undefined' && UIHelpers.showNotification) {
                UIHelpers.showNotification('Navegador no soporta cámara. Use Subir', 'error');
            } else {
                alert('Navegador no soporta cámara.');
            }
            this.closeCamera();
            return;
        }

        try {
            // Try multiple constraint strategies for better mobile compatibility
            // Prioritizing COMPATIBILITY over resolution to ensure it opens
            const constraintStrategies = [
                // Strategy 1: Simple environment camera (Most compatible)
                {
                    video: {
                        facingMode: 'environment'
                    }
                },
                // Strategy 2: Ideal 720p (Good balance)
                {
                    video: {
                        facingMode: 'environment',
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    }
                },
                // Strategy 3: Ideal 1080p (High quality, might fail on some older devices)
                {
                    video: {
                        facingMode: 'environment',
                        width: { ideal: 1920 },
                        height: { ideal: 1080 }
                    }
                },
                // Strategy 4: Any camera available (Fallback for desktop/weird devices)
                {
                    video: true
                }
            ];

            let streamObtained = false;
            let lastError = null;

            for (let i = 0; i < constraintStrategies.length && !streamObtained; i++) {
                try {
                    console.log(`CameraManager: Trying strategy ${i + 1}`, constraintStrategies[i]);
                    this.stream = await navigator.mediaDevices.getUserMedia(constraintStrategies[i]);
                    streamObtained = true;
                    console.log(`CameraManager: Stream obtained with strategy ${i + 1}`, this.stream.id);
                } catch (err) {
                    console.warn(`CameraManager: Strategy ${i + 1} failed:`, err.name, err.message);
                    lastError = err;
                }
            }

            if (!streamObtained) {
                throw lastError || new Error('No se pudo acceder a la cámara con ninguna configuración.');
            }

            // Set video source
            this.videoElement.srcObject = this.stream;

            // Ensure video plays (autoplay + playsinline)
            try {
                await this.videoElement.play();
                console.log("CameraManager: Video playing");
            } catch (playError) {
                console.error("CameraManager: Error playing video:", playError);
                // Sometimes play() fails but the stream is active. We'll try to continue.
                // If it really failed, the metadata load might timeout.
            }

            // Wait until metadata arrives
            if (!this._videoReady) {
                console.log("CameraManager: Waiting for metadata...");
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        // Don't reject, just warn. Some browsers are slow.
                        console.warn('Timeout waiting for video metadata, proceeding anyway...');
                        resolve();
                    }, 5000);

                    this.videoElement.onloadedmetadata = () => {
                        clearTimeout(timeout);
                        this._videoReady = true;
                        console.log("CameraManager: Metadata loaded");
                        resolve();
                    };
                });
            }

            console.log('CameraManager: Camera ready');
        } catch (err) {
            console.error("CameraManager: Error accessing camera:", err);

            let errorMessage = "No se pudo acceder a la cámara.\n\n";

            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                errorMessage += "Permiso denegado. Por favor permita el acceso a la cámara en la configuración de su navegador.";
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                errorMessage += "No se encontró ninguna cámara.";
            } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
                errorMessage += "La cámara está en uso por otra aplicación o hubo un error de hardware.";
            } else if (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError') {
                errorMessage += "La configuración solicitada no es compatible con su cámara.";
            } else {
                errorMessage += `Error: ${err.message || err.name}`;
            }

            errorMessage += "\n\nIntente usar la opción 'Subir' o recargue la página.";

            alert(errorMessage);
            this.closeCamera();
        }
    }

    /**
     * Captura la imagen desde el video, recorta según el recuadro #crop-frame
     * y devuelve la imagen recortada en dataURL.
     */
    capture() {
        if (!this.stream || !this._videoReady) {
            console.error('CameraManager: Cannot capture - stream or video not ready');
            alert('La cámara no está lista. Por favor intente de nuevo.');
            return;
        }

        try {
            // 1) Dibujar frame completo a canvas temporal
            const videoW = this.videoElement.videoWidth;
            const videoH = this.videoElement.videoHeight;

            if (!videoW || !videoH) {
                throw new Error('Dimensiones de video inválidas');
            }

            console.log(`CameraManager: Capturing ${videoW}x${videoH}`);

            // Set canvas to video resolution (real pixels)
            this.canvasElement.width = videoW;
            this.canvasElement.height = videoH;
            const ctx = this.canvasElement.getContext('2d');

            // Draw the current video frame full size
            ctx.drawImage(this.videoElement, 0, 0, videoW, videoH);

            // 2) Determinar área de recorte basado en overlay #crop-frame
            const cropFrame = document.getElementById('crop-frame');

            if (!cropFrame) {
                // Fallback: si no hay overlay, enviamos la imagen completa
                const fullData = this.canvasElement.toDataURL('image/jpeg', 0.9);
                this._finalizeCapture(fullData);
                return;
            }

            // overlay rect en píxeles en viewport
            const overlayRect = cropFrame.getBoundingClientRect();
            const videoRect = this.videoElement.getBoundingClientRect();

            // Si el video se escala en la UI, hay que mapear coordenadas del overlay
            // a la resolución real del video (video.videoWidth / video.clientWidth)
            const scaleX = videoW / videoRect.width;
            const scaleY = videoH / videoRect.height;

            // Coordenadas del recorte en la imagen real
            // calcular offset del overlay relativo al video en la página
            const offsetX = Math.max(0, overlayRect.left - videoRect.left);
            const offsetY = Math.max(0, overlayRect.top - videoRect.top);

            const sx = Math.round(offsetX * scaleX);
            const sy = Math.round(offsetY * scaleY);
            const sw = Math.round(overlayRect.width * scaleX);
            const sh = Math.round(overlayRect.height * scaleY);

            // Seguridad: limites
            const safeSx = Math.max(0, Math.min(videoW - 1, sx));
            const safeSy = Math.max(0, Math.min(videoH - 1, sy));
            const safeSw = Math.max(1, Math.min(videoW - safeSx, sw));
            const safeSh = Math.max(1, Math.min(videoH - safeSy, sh));

            // 3) Crear canvas con tamaño del recorte y copiar
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = safeSw;
            cropCanvas.height = safeSh;
            const cropCtx = cropCanvas.getContext('2d');

            // Extraer la porción del frame
            cropCtx.drawImage(this.canvasElement, safeSx, safeSy, safeSw, safeSh, 0, 0, safeSw, safeSh);

            // 4) Convertir a dataURL y retornar
            const croppedData = cropCanvas.toDataURL('image/jpeg', 0.92);

            console.log('CameraManager: Image captured successfully');

            // detener la cámara y cerrar modal
            this.closeCamera();

            this._finalizeCapture(croppedData);
        } catch (err) {
            console.error('CameraManager: Error capturing image:', err);
            alert('Error al capturar la imagen. Por favor intente de nuevo.');
        }
    }

    /**
     * Llamar callback de captura con la imagen y el side.
     */
    _finalizeCapture(dataUrl) {
        if (this.onCapture) {
            try {
                // Devolver (dataUrl, side)
                this.onCapture(dataUrl, this.activeSide);
            } catch (e) {
                console.error("Error en onCapture callback:", e);
            }
        }
    }

    closeCamera() {
        console.log('CameraManager: Closing camera');
        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                track.stop();
                console.log('CameraManager: Track stopped:', track.kind);
            });
            this.stream = null;
        }
        if (this.videoElement) {
            try {
                this.videoElement.pause();
                this.videoElement.srcObject = null;
            } catch (e) {
                console.warn('CameraManager: Error pausing video:', e);
            }
        }
        if (this.modal) {
            this.modal.classList.add('hidden');
        }
        this._videoReady = false;
    }
}

const cameraManager = new CameraManager();

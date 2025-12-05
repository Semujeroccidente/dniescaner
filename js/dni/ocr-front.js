/* ocr-front.js
   OCR para la parte frontal del DNI (Tesseract.js)
   - preprocesamiento (resize, grayscale, contrast, binarize)
   - autocrop/guía opcional
   - parseo heurístico para nombre, dni, fecha, sexo
*/

class FrontOCR {
    constructor() {
        this.options = {
            maxDim: 1600,
            debug: false
        };
    }

    async init(opts = {}) {
        this.options = { ...this.options, ...opts };
    }

    async scanFront(imageData, opts = {}) {
        const cfg = { ...this.options, ...opts };
        if (!imageData) return this._result(null, "no_image");

        try {
            const resized = await this._resizeIfNeeded(imageData, cfg.maxDim);
            // Try targeted crop heuristics: center-top area for name, center-left for dni etc.
            // We'll perform two crops: one for NAME (upper area) and one full frontal for fallback.
            const nameCrop = await this._cropRelative(resized, { x: 0.05, y: 0.10, width: 0.90, height: 0.28 });
            const fullCrop = await this._resizeIfNeeded(resized, cfg.maxDim);

            // Preprocess both
            const pName = await this._preprocessImage(nameCrop);
            const pFull = await this._preprocessImage(fullCrop);

            // OCR both
            const nameText = await this._ocr(pName, cfg);
            const fullText = await this._ocr(pFull, cfg);

            if (cfg.debug) {
                console.log("Front OCR nameText:", nameText);
                console.log("Front OCR fullText:", fullText);
            }

            // Parse heuristically
            const parsedName = this._parseNameBlock(nameText);
            const parsedFull = this._parseFullBlock(fullText);

            // Merge heuristics: prefer parsedName for name, parsedFull for DNI/date
            const resultData = {
                names: parsedName.names || parsedFull.names || null,
                surnames: parsedName.surnames || parsedFull.surnames || null,
                full_name: this._joinName(parsedName, parsedFull),
                document_number: parsedFull.document_number || parsedName.document_number || null,
                birth_date: parsedFull.birth_date || null,
                sex: parsedFull.sex || null,
                raw: { nameText, fullText }
            };

            // Quick quality heuristics
            let score = 0;
            if (resultData.full_name) score += 40;
            if (resultData.document_number && resultData.document_number.match(/\d{4}-?\d{4}-?\d{5}/)) score += 40;
            if (resultData.birth_date) score += 20;
            const quality = score >= 70 ? 'high' : score >= 30 ? 'medium' : 'low';

            return this._result(resultData, 'ok', { quality, parsedName, parsedFull });

        } catch (err) {
            console.error("FrontOCR.scanFront error:", err);
            return this._result(null, "exception", { error: String(err) });
        }
    }

    // -----------------------
    // helpers: resize/crop/preprocess/ocr
    // -----------------------
    _createImage(dataUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = (e) => reject(e);
            img.src = dataUrl;
        });
    }

    async _resizeIfNeeded(dataUrl, maxDim) {
        const img = await this._createImage(dataUrl);
        let w = img.width, h = img.height;
        if (Math.max(w, h) <= maxDim) return dataUrl;
        const ratio = maxDim / Math.max(w, h);
        w = Math.round(w * ratio); h = Math.round(h * ratio);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        return c.toDataURL('image/jpeg', 0.92);
    }

    async _cropRelative(dataUrl, area) {
        const img = await this._createImage(dataUrl);
        const w = img.width, h = img.height;
        const sx = Math.round(area.x * w), sy = Math.round(area.y * h);
        const sw = Math.round(area.width * w), sh = Math.round(area.height * h);
        const c = document.createElement('canvas');
        c.width = sw; c.height = sh;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        return c.toDataURL('image/jpeg', 0.92);
    }

    async _preprocessImage(dataUrl) {
        const img = await this._createImage(dataUrl);
        const w = img.width, h = img.height;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        const im = ctx.getImageData(0, 0, w, h);
        const d = im.data;

        // grayscale
        for (let i = 0; i < d.length; i += 4) {
            const lum = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
            d[i] = d[i + 1] = d[i + 2] = lum;
        }

        // simple contrast stretch (min/max)
        let min = 255, max = 0;
        for (let i = 0; i < d.length; i += 4) { min = Math.min(min, d[i]); max = Math.max(max, d[i]); }
        const scale = max === min ? 1 : 255 / (max - min);
        for (let i = 0; i < d.length; i += 4) { let v = Math.round((d[i] - min) * scale); d[i] = d[i + 1] = d[i + 2] = v; }

        // simple adaptive thresholding by small blocks
        const block = 24;
        for (let by = 0; by < h; by += block) {
            for (let bx = 0; bx < w; bx += block) {
                let sum = 0, cnt = 0;
                for (let y = by; y < Math.min(h, by + block); y++) {
                    for (let x = bx; x < Math.min(w, bx + block); x++) {
                        const idx = (y * w + x) * 4; sum += d[idx]; cnt++;
                    }
                }
                const thr = (cnt ? sum / cnt : 128) * 0.95;
                for (let y = by; y < Math.min(h, by + block); y++) {
                    for (let x = bx; x < Math.min(w, bx + block); x++) {
                        const idx = (y * w + x) * 4; const v = d[idx] < thr ? 0 : 255; d[idx] = d[idx + 1] = d[idx + 2] = v;
                    }
                }
            }
        }

        ctx.putImageData(im, 0, 0);
        return c.toDataURL('image/jpeg', 0.92);
    }

    async _ocr(dataUrl, cfg) {
        const params = { tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789- ' };
        return await workerManager.recognize(dataUrl, 'eng', params);
    }

    // -----------------------
    // parsing heuristics
    // -----------------------
    _parseNameBlock(text) {
        if (!text) return {};
        // Normalize
        let t = text.toUpperCase().replace(/[^A-ZÑÁÉÍÓÚÜ\s]/g, ' ');
        t = t.replace(/\s+/g, ' ').trim();
        // try to split by common labels "NOMBRE", "NOMBRES", "APELLIDO", etc
        // if labels present, extract following tokens
        let names = null, surnames = null;
        const labelMatch = text.match(/NOMBRE[S]?:?\s*([A-Z\s]+)/i);
        if (labelMatch) {
            names = this._cleanName(labelMatch[1]);
        }
        // Fixed regex: APELLIDOS? matches both 'APELLIDO' and 'APELLIDOS'
        const apMatch = text.match(/APELLIDOS?:?\s*([A-Z\s]+)/i);
        if (apMatch) surnames = this._cleanName(apMatch[1]);

        // fallback heuristics: tokens separated by newline or double spaces
        if (!names) {
            const lines = t.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length >= 1) {
                const candidates = lines[0].split(' ').filter(Boolean);
                if (candidates.length >= 2) {
                    names = candidates.slice(1).join(' ');
                    surnames = candidates.slice(0, 1).join(' ');
                } else {
                    names = lines[0];
                }
            }
        }
        return { names, surnames, raw: text };
    }

    _parseFullBlock(text) {
        if (!text) return {};
        // normalize keep digits and dates
        const t = text.replace(/\r/g, '\n');
        // extract date patterns (DD/MM/YYYY or DD-MM-YYYY or YYYY-MM-DD or YYMMDD)
        let birth = null;
        const d1 = t.match(/([0-3]\d[\/\-][01]\d[\/\-](?:19|20)\d{2})/);
        const d2 = t.match(/((?:19|20)\d{2}[\/\-][01]\d[\/\-][0-3]\d)/);
        const d3 = t.match(/\b(\d{2}[0-1]\d[0-3]\d)\b/); // YYMMDD
        if (d1) birth = this._normalizeDate(d1[1]);
        else if (d2) birth = this._normalizeDate(d2[1]);
        else if (d3) {
            // interpret YYMMDD
            const s = d3[1]; const yy = s.substring(0, 2), mm = s.substring(2, 4), dd = s.substring(4, 6);
            const curYY = new Date().getFullYear() % 100; const year = (Number(yy) > curYY ? 1900 + Number(yy) : 2000 + Number(yy));
            birth = `${year}-${mm}-${dd}`;
        }

        // extract DNI pattern possible on front: 13 digits or with hyphens
        const dniMatch = t.match(/(\d{4}[-\s]?\d{4}[-\s]?\d{5})/) || t.match(/(\d{13})/);
        const dni = dniMatch ? dniMatch[1].replace(/\s/g, '').replace(/(.{4})(.{4})(.{5})/, '$1-$2-$3') : null;

        // Gender detection (M / F or MASCULINO / FEMENINO)
        let sex = null;
        if (/MASCULINO/i.test(t) || /\bM\b/.test(t)) sex = 'M';
        if (/FEMENINO/i.test(t) || /\bF\b/.test(t)) sex = 'F';

        // Names fallback: try to find lines with uppercase words and 2+ tokens
        let names = null, surnames = null;
        const lines = t.split('\n').map(l => l.replace(/[^A-ZÑÁÉÍÓÚÜ0-9\/\-\s]/g, ' ').trim()).filter(Boolean);
        for (let i = 0; i < Math.min(4, lines.length); i++) {
            const tokens = lines[i].split(/\s+/).filter(Boolean);
            if (tokens.length >= 3 && !/\d/.test(lines[i])) {
                // assume first tokens are names or surnames; heuristic
                surnames = tokens.slice(0, 2).join(' ');
                names = tokens.slice(2).join(' ');
                break;
            }
        }

        return { names, surnames, full_name: (surnames && names) ? `${surnames} ${names}` : null, document_number: dni, birth_date: birth, sex, raw: text };
    }

    _cleanName(s) { return s.replace(/\s+/g, ' ').trim(); }

    _normalizeDate(s) {
        // accepts dd/mm/yyyy or yyyy-mm-dd etc -> returns yyyy-mm-dd
        if (!s) return null;
        let t = s.replace(/\./g, '/').replace(/\s+/g, '');
        if (t.includes('/')) {
            const parts = t.split('/');
            if (parts.length === 3) {
                const [d, m, y] = parts; const yy = y.length === 2 ? ('19' + y) : y;
                return `${yy.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            }
        }
        if (t.includes('-')) {
            const parts = t.split('-');
            if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        }
        return null;
    }

    _joinName(parsedName, parsedFull) {
        const n = parsedName.names || parsedFull.names || null;
        const s = parsedName.surnames || parsedFull.surnames || null;
        if (!n && !s) return null;
        if (!s) return n;
        if (!n) return s;
        return `${s} ${n}`.trim();
    }

    _isDateLike(s) { return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s); }

    _result(data, code = 'ok', extra = {}) {
        return { code, timestamp: (new Date()).toISOString(), ...extra, data };
    }
}

const frontOCR = new FrontOCR();

// app.js - Main Application Logic

class BBQApp {
    constructor() {
        this.bluetooth = new BBQBluetooth();
        this.tempHistory = {
            pit: [],
            food1: [],
            food2: [],
            timestamps: []
        };
        this.graphRange = 60; // minutes
        this.maxDataPoints = 720; // 2 hours at 10-second intervals
        this.chart = null;
        this.currentData = null;
        
        // Fuel monitoring
        this.fuelMonitor = {
            fanDutyHistory: [],
            tempDropHistory: [],
            lastPitTemp: null,
            lastCheckTime: null,
            lowFuelAlerted: false
        };

        // Notification permission
        this.notificationsEnabled = false;

        this.init();
    }

    init() {
        // Check Web Bluetooth support
        if (!BBQBluetooth.isSupported()) {
            this.showToast('Web Bluetooth not supported. Please use Chrome or Edge on Android.', 'error', 10000);
            document.getElementById('connectBtn').disabled = true;
            return;
        }

        // Setup Bluetooth callbacks
        this.bluetooth.onDataCallback = (data) => this.handleTelemetryData(data);
        this.bluetooth.onStatusCallback = (state, message) => this.updateConnectionStatus(state, message);
        this.bluetooth.onWriteEchoCallback = (cmd, arg) => this.handleWriteEcho(cmd, arg);

        // Setup UI event listeners
        this.setupEventListeners();

        // Setup programming card listeners
        this.setupProgrammingListeners();

        // Setup Chart.js
        this.setupChart();

        // Request notification permission
        this.requestNotificationPermission();

        // Register service worker
        this.registerServiceWorker();

        // Setup modal
        this.setupModal();
    }

    setupModal() {
        // Modal supports two modes: slider and pill-picker
        this.modalCallback = null;
        this.currentModalType = 'temp';
        this.modalPillValue = null;
    }

    // Show modal in pill-picker mode (for fan, lid, units, sound, display)
    showPillModal(title, options, currentValue) {
        return new Promise((resolve) => {
            this.currentModalType = 'pill';
            this.modalCallback = resolve;
            this.modalPillValue = currentValue;

            document.getElementById('modalTitle').textContent = title;

            // Hide slider, show pills
            document.getElementById('modalSliderSection').classList.add('hidden');
            document.getElementById('modalPillsSection').classList.remove('hidden');

            // Hide readout for pill mode
            const readout = document.querySelector('.modal-readout');
            readout.style.display = 'none';

            // Build pill buttons
            const container = document.getElementById('modalPills');
            container.innerHTML = '';
            options.forEach(opt => {
                const btn = document.createElement('button');
                btn.className = 'modal-pill' + (opt.value === currentValue ? ' selected' : '');
                btn.textContent = opt.label;
                btn.addEventListener('click', () => {
                    this.modalPillValue = opt.value;
                    container.querySelectorAll('.modal-pill').forEach(b => b.classList.remove('selected'));
                    btn.classList.add('selected');
                });
                container.appendChild(btn);
            });

            document.getElementById('modal').classList.add('show');
        });
    }

    // Handle write errors with helpful messages
    handleWriteError(err, actionName) {
        let msg = `Failed to ${actionName}`;
        if (err && err.message) {
            if (err.message.includes('GATT') || err.message.includes('disconnect')) {
                msg = `${actionName} failed - device disconnected. Will auto-reconnect...`;
            } else if (err.message.includes('auth') || err.message.includes('Security') || err.message.includes('not paired')) {
                msg = `${actionName} failed - device needs pairing. Accept the Windows pairing dialog and try again.`;
            }
        }
        this.showToast(msg, 'error', 5000);
    }

    // Called by inline oninput on slider
    updateModalValue(value) {
        let val = parseInt(value);
        const display = document.getElementById('modalValueDisplay');
        const unit = document.getElementById('modalValueUnit');
        const slider = document.getElementById('modalSlider');
        
        if (!display) {
            return;
        }

        // For alarm-type sliders with 0=Off and a valid range starting above 0,
        // snap values in the dead zone to either 0 or the range start
        if (this.currentModalType === 'alarm' && slider) {
            const min = parseInt(slider.min);
            const max = parseInt(slider.max);
            // Detect dead zone: if min=0 and max >= 150, values 1-149 are invalid
            if (min === 0 && max >= 150 && val > 0 && val < 150) {
                val = val < 75 ? 0 : 150;
                slider.value = val;
            }
        }
        
        if (val === 0 && this.currentModalType === 'alarm') {
            display.textContent = 'Off';
            if (unit) unit.style.display = 'none';
        } else {
            display.textContent = val;
            if (unit) unit.style.display = 'inline';
        }
    }

    // Called by inline onclick on Cancel/Close/backdrop
    cancelModal() {
        const modal = document.getElementById('modal');
        
        if (this.modalCallback) {
            this.modalCallback(null);
            this.modalCallback = null;
        }
        
        if (modal) {
            modal.classList.remove('show');
        }
    }

    // Called by inline onclick on Set button
    confirmModal() {
        const modal = document.getElementById('modal');
        let value;

        if (this.currentModalType === 'pill') {
            value = this.modalPillValue;
        } else {
            const slider = document.getElementById('modalSlider');
            if (!slider) return;
            value = parseInt(slider.value);
        }
        
        if (this.modalCallback) {
            this.modalCallback(value);
            this.modalCallback = null;
        }
        
        if (modal) {
            modal.classList.remove('show');
        }
    }

    showModal(title, min, max, value, step, type = 'temp') {
        return new Promise((resolve) => {
            this.currentModalType = type;
            this.modalCallback = resolve;
            
            document.getElementById('modalTitle').textContent = title;

            // Show slider, hide pills
            document.getElementById('modalSliderSection').classList.remove('hidden');
            document.getElementById('modalPillsSection').classList.add('hidden');

            // Show readout
            const readout = document.querySelector('.modal-readout');
            readout.style.display = '';
            
            const slider = document.getElementById('modalSlider');
            slider.min = min;
            slider.max = max;
            slider.value = value;
            slider.step = step;
            
            const display = document.getElementById('modalValueDisplay');
            const unit = document.getElementById('modalValueUnit');
            
            if (value === 0 && type === 'alarm') {
                display.textContent = 'Off';
                unit.style.display = 'none';
            } else {
                display.textContent = value;
                unit.style.display = 'inline';
            }
            
            document.getElementById('modalMinLabel').textContent = min === 0 ? 'Off' : `${min}°F`;
            document.getElementById('modalMaxLabel').textContent = `${max}°F`;
            
            document.getElementById('modal').classList.add('show');
        });
    }

    hideModal() {
        document.getElementById('modal').classList.remove('show');
        this.modalCallback = null;
    }

    updateProgrammingCard(data) {
        // Pit Alarm: direct °F, 0 = off
        const pa = document.getElementById('progPitAlarm');
        if (pa) pa.textContent = data.pitAlarm === 0 ? 'Off' : `±${data.pitAlarm}°F`;

        // Delay Time: raw value × 15 min
        const dt = document.getElementById('progDelayTime');
        if (dt) {
            if (data.delayTime === 0) {
                dt.textContent = 'Off';
            } else {
                const totalMin = data.delayTime * 15;
                const h = Math.floor(totalMin / 60);
                const m = totalMin % 60;
                dt.textContent = h > 0 ? `${h}h ${m}m` : `${m}m`;
            }
        }

        // Delay Pit Set: raw + 145 = °F, raw 0 = off
        const dps = document.getElementById('progDelayPitSet');
        if (dps) dps.textContent = data.delayPitSet === 0 ? 'Off' : `${data.delayPitSet + 145}°F`;

        // Food 1 Trigger: direct °F, 0 = off
        const f1t = document.getElementById('progFood1Trigger');
        if (f1t) f1t.textContent = data.food1TempTrigger === 0 ? 'Off' : `${data.food1TempTrigger}°F`;

        // Food 1 Pit Set: raw + 145, 0 = off
        const f1p = document.getElementById('progFood1PitSet');
        if (f1p) f1p.textContent = data.food1PitSet === 0 ? 'Off' : `${data.food1PitSet + 145}°F`;

        // Food 2 Trigger: direct °F, 0 = off
        const f2t = document.getElementById('progFood2Trigger');
        if (f2t) f2t.textContent = data.food2TempTrigger === 0 ? 'Off' : `${data.food2TempTrigger}°F`;

        // Food 2 Pit Set: raw + 145, 0 = off
        const f2p = document.getElementById('progFood2PitSet');
        if (f2p) f2p.textContent = data.food2PitSet === 0 ? 'Off' : `${data.food2PitSet + 145}°F`;
    }

    setupProgrammingListeners() {
        document.querySelectorAll('.prog-row[data-prog]').forEach(row => {
            row.addEventListener('click', async () => {
                if (!this.bluetooth.connected) {
                    this.showToast('Connect to BBQ first', 'warning');
                    return;
                }
                const action = row.dataset.prog;

                if (action === 'pit-alarm') {
                    const current = this.currentData?.pitAlarm || 0;
                    const v = await this.showModal('Pit Alarm (±°F deviation)', 0, 100, current, 5, 'alarm');
                    if (v !== null && v !== undefined) {
                        this.bluetooth.setPitAlarm(v).catch(e => this.handleWriteError(e, 'set pit alarm'));
                    }
                } else if (action === 'delay-time') {
                    // Show pill modal with time options (15-min increments, grouped for usability)
                    const current = this.currentData?.delayTime || 0;
                    const options = [{ label: 'Off', value: 0 }];
                    // Every 15 min up to 2h
                    for (let i = 1; i <= 8; i++) {
                        const totalMin = i * 15;
                        const h = Math.floor(totalMin / 60);
                        const m = totalMin % 60;
                        options.push({ label: h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`, value: i });
                    }
                    // Every 30 min from 2.5h to 6h
                    for (let i = 10; i <= 24; i += 2) {
                        const totalMin = i * 15;
                        const h = Math.floor(totalMin / 60);
                        const m = totalMin % 60;
                        options.push({ label: m > 0 ? `${h}h ${m}m` : `${h}h`, value: i });
                    }
                    // Every hour from 7h to 24h
                    for (let i = 28; i <= 96; i += 4) {
                        const totalMin = i * 15;
                        const h = Math.floor(totalMin / 60);
                        options.push({ label: `${h}h`, value: i });
                    }
                    const v = await this.showPillModal('Delay Timer', options, current);
                    if (v !== null && v !== undefined) {
                        this.bluetooth.setDelayTime(v).catch(e => this.handleWriteError(e, 'set delay timer'));
                    }
                } else if (action === 'delay-pit-set') {
                    const raw = this.currentData?.delayPitSet || 0;
                    const current = raw === 0 ? 0 : raw + 145;
                    const v = await this.showModal('Pit Temp After Timer', 0, 400, current, 5, 'alarm');
                    if (v !== null && v !== undefined) {
                        this.bluetooth.setDelayPitSet(v).catch(e => this.handleWriteError(e, 'set delay pit temp'));
                    }
                } else if (action === 'food1-trigger') {
                    const current = this.currentData?.food1TempTrigger || 0;
                    const v = await this.showModal('Food 1 Temp Trigger', 0, 250, current, 5, 'alarm');
                    if (v !== null && v !== undefined) {
                        this.bluetooth.setFood1TempTrigger(v).catch(e => this.handleWriteError(e, 'set food 1 trigger'));
                    }
                } else if (action === 'food1-pit-set') {
                    const raw = this.currentData?.food1PitSet || 0;
                    const current = raw === 0 ? 0 : raw + 145;
                    const v = await this.showModal('Pit Temp When Food 1 Reaches Trigger', 0, 400, current, 5, 'alarm');
                    if (v !== null && v !== undefined) {
                        this.bluetooth.setFood1PitSet(v).catch(e => this.handleWriteError(e, 'set food 1 pit'));
                    }
                } else if (action === 'food2-trigger') {
                    const current = this.currentData?.food2TempTrigger || 0;
                    const v = await this.showModal('Food 2 Temp Trigger', 0, 250, current, 5, 'alarm');
                    if (v !== null && v !== undefined) {
                        this.bluetooth.setFood2TempTrigger(v).catch(e => this.handleWriteError(e, 'set food 2 trigger'));
                    }
                } else if (action === 'food2-pit-set') {
                    const raw = this.currentData?.food2PitSet || 0;
                    const current = raw === 0 ? 0 : raw + 145;
                    const v = await this.showModal('Pit Temp When Food 2 Reaches Trigger', 0, 400, current, 5, 'alarm');
                    if (v !== null && v !== undefined) {
                        this.bluetooth.setFood2PitSet(v).catch(e => this.handleWriteError(e, 'set food 2 pit'));
                    }
                }
            });
        });
    }

    setupEventListeners() {
        // Connect button
        document.getElementById('connectBtn').addEventListener('click', () => {
            if (this.bluetooth.connected) {
                this.bluetooth.disconnect();
            } else {
                this.bluetooth.connect();
            }
        });

        // Temperature cards: click to set targets/alarms via modal
        document.querySelectorAll('.temp-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                if (!this.bluetooth.connected) {
                    this.showToast('Connect to BBQ first', 'warning');
                    return;
                }
                
                const id = item.querySelector('.temp-value').id; // pitTemp, food1Temp, food2Temp
                
                if (id === 'pitTemp') {
                    const currentValue = this.currentData?.pitSet ? this.currentData.pitSet + 145 : 225;
                    const t = await this.showModal('Set Pit Temperature', 150, 400, currentValue, 5, 'temp');
                    if (t !== null && t !== undefined) {
                        this.bluetooth.setPitTemp(t).catch(err => this.handleWriteError(err, 'set pit temp'));
                    }
                } else if (id === 'food1Temp') {
                    const currentValue = this.currentData?.food1Alarm || 0;
                    const t = await this.showModal('Set Food 1 Alarm', 0, 250, currentValue, 5, 'alarm');
                    if (t !== null && t !== undefined) {
                        this.bluetooth.setFood1Alarm(t).catch(err => this.handleWriteError(err, 'set Food 1 alarm'));
                    }
                } else if (id === 'food2Temp') {
                    const currentValue = this.currentData?.food2Alarm || 0;
                    const t = await this.showModal('Set Food 2 Alarm', 0, 250, currentValue, 5, 'alarm');
                    if (t !== null && t !== undefined) {
                        this.bluetooth.setFood2Alarm(t).catch(err => this.handleWriteError(err, 'set Food 2 alarm'));
                    }
                }
            });
        });

        // Stats strip: pretty modals instead of ugly prompts
        document.querySelectorAll('.stat[data-action]').forEach(item => {
            item.addEventListener('click', async () => {
                const action = item.dataset.action;
                if (!this.bluetooth.connected) { this.showToast('Connect first to change settings', 'warning'); return; }

                if (action === 'set-fan') {
                    const current = this.currentData?.fanSpeed ?? 0;
                    const v = await this.showPillModal('Fan Speed', [
                        { label: 'Auto', value: 0 },
                        { label: '1', value: 1 },
                        { label: '2', value: 2 },
                        { label: '3', value: 3 },
                        { label: '4', value: 4 },
                        { label: '5', value: 5 }
                    ], current);
                    if (v !== null && v !== undefined) {
                        this.bluetooth.setFanSpeed(v).then(() => {
                            document.getElementById('fanSpeed').textContent = v === 0 ? 'Auto' : v;
                        }).catch(() => this.showToast('Failed to set fan speed', 'error'));
                    }
                } else if (action === 'set-lid') {
                    const current = this.currentData?.lidDetect ?? 1;
                    const v = await this.showPillModal('Lid Detect', [
                        { label: 'On', value: 1 },
                        { label: 'Off', value: 0 }
                    ], current);
                    if (v !== null && v !== undefined) {
                        this.bluetooth.setLidDetect(v === 1).then(() => {
                            document.getElementById('lidDetect').textContent = v === 1 ? 'On' : 'Off';
                        }).catch(() => this.showToast('Failed to set lid detect', 'error'));
                    }
                } else if (action === 'set-sound') {
                    const curText = document.getElementById('soundLevel').textContent;
                    const current = curText === 'Off' ? 0 : parseInt(curText) || 3;
                    const v = await this.showPillModal('Sound Level', [
                        { label: 'Off', value: 0 },
                        { label: '1', value: 1 },
                        { label: '2', value: 2 },
                        { label: '3', value: 3 },
                        { label: '4', value: 4 },
                        { label: '5', value: 5 }
                    ], current);
                    if (v !== null && v !== undefined) {
                        this.bluetooth.setSoundLevel(v).then(() => {
                            document.getElementById('soundLevel').textContent = v === 0 ? 'Off' : v;
                        }).catch(() => this.showToast('Failed to set sound', 'error'));
                    }
                } else if (action === 'set-display') {
                    const current = parseInt(document.getElementById('displayLevel').textContent) || 3;
                    const v = await this.showPillModal('Screen Brightness', [
                        { label: '1', value: 1 },
                        { label: '2', value: 2 },
                        { label: '3', value: 3 }
                    ], current);
                    if (v !== null && v !== undefined) {
                        this.bluetooth.setDisplayBrightness(v).then(() => {
                            document.getElementById('displayLevel').textContent = v;
                        }).catch(() => this.showToast('Failed to set display', 'error'));
                    }
                } else if (action === 'set-units') {
                    const curText = document.getElementById('tempUnits').textContent;
                    const current = curText === '°C' ? 1 : 0;
                    const v = await this.showPillModal('Temperature Units', [
                        { label: '°F', value: 0 },
                        { label: '°C', value: 1 }
                    ], current);
                    if (v !== null && v !== undefined) {
                        this.bluetooth.setTempUnits(v === 0).then(() => {
                            document.getElementById('tempUnits').textContent = v === 0 ? '°F' : '°C';
                        }).catch(() => this.showToast('Failed to set temp units', 'error'));
                    }
                }
            });
        });
    }

    handleTelemetryData(data) {
        this.currentData = data;

        // Update temperature displays
        this.updateTemperature('pit', data.pitTemp, data.pitSet);
        this.updateTemperature('food1', data.food1Temp, data.food1Alarm);
        this.updateTemperature('food2', data.food2Temp, data.food2Alarm);

        // Update status indicators (stat strip)
        document.getElementById('fanSpeed').textContent = data.fanSpeed === 0 ? 'Auto' : data.fanSpeed;
        document.getElementById('lidDetect').textContent = data.lidDetect ? 'On' : 'Off';
        document.getElementById('uptime').textContent = `${data.uptimeMin}m`;

        // Update programming card
        this.updateProgrammingCard(data);

        // Update temperature history and chart
        this.addToHistory(data);
        this.updateChart();

        // Update fuel monitor
        this.updateFuelMonitor(data);

        // Check for alarms
        this.checkAlarms(data);
    }

    handleWriteEcho(cmd, arg) {
        const hex = `0x${cmd.toString(16).padStart(2, '0')}`;
        const text = `${hex} = ${arg}`;
        const el = document.getElementById('lastEchoText');
        const verifyEl = document.getElementById('lastEchoVerify');
        if (el) el.textContent = text;
        // Attempt verification against latest telemetry
        const verified = this.verifyCommand(cmd, arg);
        if (verifyEl) {
            if (verified === true) {
                verifyEl.textContent = '(verified)';
                verifyEl.style.color = '#26de81';
            } else if (verified === false) {
                verifyEl.textContent = '(not verified)';
                verifyEl.style.color = '#ff4757';
            } else {
                verifyEl.textContent = '(not verifiable)';
                verifyEl.style.color = '';
            }
        }
        this.showToast(`Cmd ${text} sent${verified === true ? ' (verified)' : ''}`, 'info', 2500);
    }

    verifyCommand(cmd, arg) {
        // Return true = verified, false = not verified, null = not verifiable / unknown
        if (!this.currentData) return null;
        switch (cmd) {
            case 0x01: // Pit set (telemetry.pitSet == value)
                return (this.currentData.pitSet === arg) ? true : false;
            case 0x02: // Food1 alarm (byte 11)
                return (this.currentData.food1Alarm === arg) ? true : false;
            case 0x03: // Food2 alarm (byte 12)
                return (this.currentData.food2Alarm === arg) ? true : false;
            case 0x04: // Pit alarm (byte 0)
                return (this.currentData.pitAlarm === arg) ? true : false;
            case 0x05: // Lid detect (bit)
                return (this.currentData.lidDetect === arg) ? true : false;
            case 0x06: // Fan speed
                return (this.currentData.fanSpeed === arg) ? true : false;
            case 0x07: // Temp units - non-volatile, not reliably visible
            case 0x08: // Sound - non-volatile, not visible in telemetry
            case 0x09: // Display - non-volatile, not visible in telemetry
                return null;
            default:
                // For other commands (0x0A-0x0F) some map to bytes we can check
                if (cmd === 0x0A) return (this.currentData.delayTime === arg) ? true : false;
                if (cmd === 0x0B) return (this.currentData.delayPitSet === arg) ? true : false;
                if (cmd === 0x0C) return (this.currentData.food1TempTrigger === arg) ? true : false;
                if (cmd === 0x0D) return (this.currentData.food1PitSet === arg) ? true : false;
                if (cmd === 0x0E) return (this.currentData.food2TempTrigger === arg) ? true : false;
                if (cmd === 0x0F) return (this.currentData.food2PitSet === arg) ? true : false;
                return null;
        }
    }

    updateTemperature(probe, temp, target) {
        const tempElement = document.getElementById(`${probe}Temp`);
        const targetElement = document.getElementById(probe === 'pit' ? 'pitTarget' : `${probe}Alarm`);

        if (temp === 999) {
            tempElement.textContent = '--°F';
            tempElement.classList.add('disconnected');
        } else {
            tempElement.textContent = `${temp}°F`;
            tempElement.classList.remove('disconnected');
            
            // Color coding
            if (probe === 'pit' && target > 0) {
                const diff = Math.abs(temp - (target + 145));
                if (diff <= 5) {
                    tempElement.classList.add('temp-good');
                    tempElement.classList.remove('temp-warn');
                } else if (diff <= 15) {
                    tempElement.classList.add('temp-warn');
                    tempElement.classList.remove('temp-good');
                } else {
                    tempElement.classList.remove('temp-good', 'temp-warn');
                }
            }
        }

        if (probe === 'pit') {
            const targetTemp = target > 0 ? target + 145 : 0;
            targetElement.textContent = targetTemp > 0 ? `→ ${targetTemp}°F` : 'No target';
        } else {
            targetElement.textContent = target === 0 ? 'No alarm' : `⏰ ${target}°F`;
        }
    }

    addToHistory(data) {
        const now = Date.now();
        
        // Add data points
        this.tempHistory.timestamps.push(now);
        this.tempHistory.pit.push(data.pitTemp === 999 ? null : data.pitTemp);
        this.tempHistory.food1.push(data.food1Temp === 999 ? null : data.food1Temp);
        this.tempHistory.food2.push(data.food2Temp === 999 ? null : data.food2Temp);

        // Trim old data
        if (this.tempHistory.timestamps.length > this.maxDataPoints) {
            this.tempHistory.timestamps.shift();
            this.tempHistory.pit.shift();
            this.tempHistory.food1.shift();
            this.tempHistory.food2.shift();
        }
    }

    setupChart() {
        this.chartCanvas = document.getElementById('tempChart');
        if (!this.chartCanvas) { this.chart = null; return; }
        this.chartCtx = this.chartCanvas.getContext('2d');
        this.chart = true; // flag that chart is active
        // Set canvas resolution
        this.resizeChart();
        window.addEventListener('resize', () => this.resizeChart());
    }

    resizeChart() {
        if (!this.chartCanvas) return;
        const wrap = this.chartCanvas.parentElement;
        const dpr = window.devicePixelRatio || 1;
        this.chartCanvas.width = wrap.clientWidth * dpr;
        this.chartCanvas.height = wrap.clientHeight * dpr;
        this.chartCtx.scale(dpr, dpr);
        this.chartCanvas.style.width = wrap.clientWidth + 'px';
        this.chartCanvas.style.height = wrap.clientHeight + 'px';
        this.drawChart();
    }

    drawChart() {
        if (!this.chartCtx) return;
        const ctx = this.chartCtx;
        const w = this.chartCanvas.clientWidth;
        const h = this.chartCanvas.clientHeight;
        const pad = { top: 12, right: 12, bottom: 28, left: 40 };

        // Clear
        ctx.clearRect(0, 0, w, h);

        // Filter data by time range
        const now = Date.now();
        const cutoff = now - (this.graphRange * 60 * 1000);
        const ts = [], pit = [], f1 = [], f2 = [];
        for (let i = 0; i < this.tempHistory.timestamps.length; i++) {
            if (this.tempHistory.timestamps[i] >= cutoff) {
                ts.push(this.tempHistory.timestamps[i]);
                pit.push(this.tempHistory.pit[i]);
                f1.push(this.tempHistory.food1[i]);
                f2.push(this.tempHistory.food2[i]);
            }
        }

        if (ts.length < 2) {
            // Draw placeholder
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-2').trim() || '#666';
            ctx.font = '12px -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Waiting for data...', w / 2, h / 2);
            return;
        }

        // Find min/max temps
        const all = [...pit, ...f1, ...f2].filter(v => v !== null && v !== undefined);
        let minT = Math.min(...all);
        let maxT = Math.max(...all);
        if (maxT === minT) { maxT += 10; minT -= 10; }
        const tempRange = maxT - minT;
        minT -= tempRange * 0.1;
        maxT += tempRange * 0.1;

        const timeMin = ts[0];
        const timeMax = ts[ts.length - 1];
        const timeRange = timeMax - timeMin || 1;

        const chartW = w - pad.left - pad.right;
        const chartH = h - pad.top - pad.bottom;

        const toX = (t) => pad.left + ((t - timeMin) / timeRange) * chartW;
        const toY = (temp) => pad.top + chartH - ((temp - minT) / (maxT - minT)) * chartH;

        // Grid lines
        ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--border').trim() || 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        const gridSteps = 4;
        for (let i = 0; i <= gridSteps; i++) {
            const y = pad.top + (chartH / gridSteps) * i;
            ctx.beginPath();
            ctx.moveTo(pad.left, y);
            ctx.lineTo(w - pad.right, y);
            ctx.stroke();
        }

        // Y-axis labels
        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-2').trim() || '#666';
        ctx.font = '10px -apple-system, sans-serif';
        ctx.textAlign = 'right';
        for (let i = 0; i <= gridSteps; i++) {
            const y = pad.top + (chartH / gridSteps) * i;
            const tempVal = maxT - ((maxT - minT) / gridSteps) * i;
            ctx.fillText(Math.round(tempVal) + '°', pad.left - 4, y + 3);
        }

        // X-axis time labels
        ctx.textAlign = 'center';
        const xSteps = Math.min(4, ts.length);
        for (let i = 0; i < xSteps; i++) {
            const idx = Math.floor((ts.length - 1) * (i / (xSteps - 1)));
            const d = new Date(ts[idx]);
            const label = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
            ctx.fillText(label, toX(ts[idx]), h - pad.bottom + 16);
        }

        // Draw lines
        const drawLine = (data, color, lineWidth) => {
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.beginPath();
            let started = false;
            for (let i = 0; i < data.length; i++) {
                if (data[i] === null || data[i] === undefined) { started = false; continue; }
                const x = toX(ts[i]);
                const y = toY(data[i]);
                if (!started) { ctx.moveTo(x, y); started = true; }
                else { ctx.lineTo(x, y); }
            }
            ctx.stroke();
        };

        // Food 2 (back)
        drawLine(f2, '#ffc048', 1.5);
        // Food 1 (mid)
        drawLine(f1, '#26de81', 1.5);
        // Pit (front, thicker)
        drawLine(pit, '#ff6b35', 2.5);

        // Pit target line (dashed)
        if (this.currentData?.pitSet > 0) {
            const targetTemp = this.currentData.pitSet + 145;
            if (targetTemp >= minT && targetTemp <= maxT) {
                const ty = toY(targetTemp);
                ctx.strokeStyle = 'rgba(255, 107, 53, 0.3)';
                ctx.lineWidth = 1;
                ctx.setLineDash([6, 4]);
                ctx.beginPath();
                ctx.moveTo(pad.left, ty);
                ctx.lineTo(w - pad.right, ty);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
    }

    updateChart() {
        if (!this.chart) return;
        this.drawChart();
    }

    setGraphRange(minutes) {
        this.graphRange = minutes;
        this.drawChart();
        
        // Update active button
        document.querySelectorAll('.chart-range-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        if (event && event.target) event.target.classList.add('active');
    }

    updateFuelMonitor(data) {
        const now = Date.now();

        // Calculate fan duty cycle percentage
        let fanDutyPercent = 0;
        if (data.fanSpeed === 0) {
            // Auto mode - estimate from temperature differential
            if (data.pitTemp !== 999 && data.pitSet > 0) {
                const targetTemp = data.pitSet - 145;
                const diff = targetTemp - data.pitTemp;
                // Rough estimate: fan duty increases with temperature need
                fanDutyPercent = Math.max(0, Math.min(100, (diff / 50) * 100 + 30));
            }
        } else {
            // Manual mode
            fanDutyPercent = (data.fanSpeed / 7) * 100;
        }

        // Track fan duty history (last 30 minutes)
        this.fuelMonitor.fanDutyHistory.push({
            time: now,
            duty: fanDutyPercent
        });

        // Calculate temperature drop rate
        if (this.fuelMonitor.lastPitTemp !== null && 
            this.fuelMonitor.lastCheckTime !== null &&
            data.pitTemp !== 999) {
            
            const timeDiff = (now - this.fuelMonitor.lastCheckTime) / 1000 / 60; // minutes
            const tempDiff = data.pitTemp - this.fuelMonitor.lastPitTemp;
            const dropRate = tempDiff / timeDiff; // °F per minute

            this.fuelMonitor.tempDropHistory.push({
                time: now,
                rate: dropRate
            });
        }

        this.fuelMonitor.lastPitTemp = data.pitTemp;
        this.fuelMonitor.lastCheckTime = now;

        // Trim old data (keep last 30 minutes)
        const cutoff = now - (30 * 60 * 1000);
        this.fuelMonitor.fanDutyHistory = this.fuelMonitor.fanDutyHistory.filter(d => d.time >= cutoff);
        this.fuelMonitor.tempDropHistory = this.fuelMonitor.tempDropHistory.filter(d => d.time >= cutoff);

        // Calculate averages
        const avgFanDuty = this.fuelMonitor.fanDutyHistory.length > 0
            ? this.fuelMonitor.fanDutyHistory.reduce((sum, d) => sum + d.duty, 0) / this.fuelMonitor.fanDutyHistory.length
            : 0;

        const avgTempDrop = this.fuelMonitor.tempDropHistory.length > 0
            ? this.fuelMonitor.tempDropHistory.reduce((sum, d) => sum + d.rate, 0) / this.fuelMonitor.tempDropHistory.length
            : 0;

        // Update UI
        document.getElementById('avgFanDuty').textContent = `${avgFanDuty.toFixed(1)}%`;
        document.getElementById('tempDrop').textContent = `${avgTempDrop.toFixed(2)}°F/min`;

        // Fuel level estimation
        // High fan duty + dropping temp = low fuel
        let fuelLevel = 100;
        
        if (this.fuelMonitor.fanDutyHistory.length > 10 && this.fuelMonitor.tempDropHistory.length > 5) {
            // If fan is working hard (>60%) but temp is dropping (<-0.5°F/min), fuel is low
            if (avgFanDuty > 60 && avgTempDrop < -0.5) {
                fuelLevel = 20; // Critical
            } else if (avgFanDuty > 50 && avgTempDrop < -0.2) {
                fuelLevel = 40; // Low
            } else if (avgFanDuty > 40) {
                fuelLevel = 70; // Medium
            }
        }

        // Update fuel level display
        const fuelLevelEl = document.getElementById('fuelLevel');
        const fuelTextEl = document.getElementById('fuelText');
        
        fuelLevelEl.style.width = `${fuelLevel}%`;
        
        if (fuelLevel <= 20) {
            fuelLevelEl.style.backgroundColor = '#ff4757';
            fuelTextEl.textContent = '⚠️ Fuel Critical - Add more soon!';
            fuelTextEl.style.color = '#ff4757';
            
            // Send notification if not already alerted
            if (!this.fuelMonitor.lowFuelAlerted) {
                this.showNotification('Low Fuel Warning', 'BBQ fuel is running low. Consider adding more.');
                this.fuelMonitor.lowFuelAlerted = true;
            }
        } else if (fuelLevel <= 40) {
            fuelLevelEl.style.backgroundColor = '#ffa502';
            fuelTextEl.textContent = 'Fuel Low - Monitor closely';
            fuelTextEl.style.color = '#ffa502';
        } else {
            fuelLevelEl.style.backgroundColor = '#26de81';
            fuelTextEl.textContent = 'Fuel OK';
            fuelTextEl.style.color = '#26de81';
            this.fuelMonitor.lowFuelAlerted = false; // Reset alert
        }
    }

    checkAlarms(data) {
        // Check Food 1 alarm
        if (data.food1Alarm > 0 && data.food1Temp !== 999 && data.food1Temp >= data.food1Alarm) {
            this.showNotification('Food 1 Ready!', `Temperature reached ${data.food1Temp}°F`);
        }

        // Check Food 2 alarm
        if (data.food2Alarm > 0 && data.food2Temp !== 999 && data.food2Temp >= data.food2Alarm) {
            this.showNotification('Food 2 Ready!', `Temperature reached ${data.food2Temp}°F`);
        }

        // Check pit alarm (temperature drop)
        if (data.pitAlarm > 0 && data.pitTemp !== 999 && data.pitSet > 0) {
            const targetTemp = data.pitSet - 145;
            if (data.pitTemp < (targetTemp - data.pitAlarm)) {
                this.showNotification('Pit Temperature Low', `${data.pitTemp}°F is ${targetTemp - data.pitTemp}°F below target`);
            }
        }
    }

    updateConnectionStatus(state, message) {
        const statusBar = document.getElementById('connectionStatus');
        const statusText = document.querySelector('.status-text');
        const connectBtn = document.getElementById('connectBtn');

        statusBar.className = `conn-status ${state}`;
        statusText.textContent = message;

        // Update connect button text (preserve the dot span)
        const dot = connectBtn.querySelector('.connect-dot');
        if (state === 'connected') {
            connectBtn.classList.add('connected');
            Array.from(connectBtn.childNodes).forEach(n => { if (n.nodeType === 3) n.remove(); });
            if (dot) connectBtn.appendChild(document.createTextNode(' Disconnect'));
            else connectBtn.textContent = 'Disconnect';

            // Add glow to pit card
            const pitCard = document.querySelector('.temp-card.pit');
            if (pitCard) pitCard.classList.add('has-reading');
        } else {
            connectBtn.classList.remove('connected');
            Array.from(connectBtn.childNodes).forEach(n => { if (n.nodeType === 3) n.remove(); });
            if (dot) connectBtn.appendChild(document.createTextNode(' Connect'));
            else connectBtn.textContent = 'Connect';

            // Remove pit glow
            const pitCard = document.querySelector('.temp-card.pit');
            if (pitCard) pitCard.classList.remove('has-reading');
        }
    }

    async requestNotificationPermission() {
        if ('Notification' in window) {
            const permission = await Notification.requestPermission();
            this.notificationsEnabled = permission === 'granted';
        }
    }

    showNotification(title, body) {
        // Show toast always
        this.showToast(body, 'info', 5000);

        // Show system notification if enabled
        if (this.notificationsEnabled && 'Notification' in window) {
            new Notification(title, {
                body: body,
                icon: 'icon-192.png',
                badge: 'icon-192.png',
                vibrate: [200, 100, 200]
            });
        }
    }

    showToast(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        
        container.appendChild(toast);
        
        setTimeout(() => toast.classList.add('show'), 10);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => container.removeChild(toast), 300);
        }, duration);
    }

    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                await navigator.serviceWorker.register('service-worker.js');
                console.log('Service Worker registered');
            } catch (error) {
                console.error('Service Worker registration failed:', error);
            }
        }
    }
}

// Global wrapper functions for inline handlers (defined before DOMContentLoaded)
window.updateModalValue = function(value) {
    if (window.app) {
        window.app.updateModalValue(value);
    }
};
window.cancelModal = function() {
    if (window.app) {
        window.app.cancelModal();
    }
};
window.confirmModal = function() {
    if (window.app) {
        window.app.confirmModal();
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new BBQApp();
});

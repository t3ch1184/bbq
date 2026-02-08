// bluetooth.js - BLE Communication for iQE050 BBQ Controller

class BBQBluetooth {
    constructor() {
        this.device = null;
        this.server = null;
        this.service = null;
        this.telemetryChar = null;
        this.writeChar = null;
        this.connected = false;
        this.onDataCallback = null;
        this.onStatusCallback = null;
        this.onWriteEchoCallback = null;
        this.intentionalDisconnect = false;
        
        // GATT Service UUIDs
        this.SERVICE_UUID = '5fb70000-9c92-4489-ab95-5bc20bb36eab';
        this.TELEMETRY_UUID = '5fb70001-9c92-4489-ab95-5bc20bb36eab';
        this.WRITE_AUTH_UUID = '5fb70004-9c92-4489-ab95-5bc20bb36eab'; // Write with auth (requires pairing)
        this.WRITE_NOAUTH_UUID = '5fb70007-9c92-4489-ab95-5bc20bb36eab'; // Write without auth
        this.paired = false;
    }

    // Connect to BBQ controller
    async connect() {
        try {
            this.updateStatus('connecting', 'Scanning for devices...');
            
            // Request device
            this.device = await navigator.bluetooth.requestDevice({
                filters: [
                    { namePrefix: 'iQE' },
                    { services: [this.SERVICE_UUID] }
                ],
                optionalServices: [this.SERVICE_UUID]
            });

            this.device.addEventListener('gattserverdisconnected', () => {
                this.onDisconnected();
            });

            this.updateStatus('connecting', `Connecting to ${this.device.name}...`);

            // Connect to GATT server with retry logic
            let retries = 3;
            let lastError = null;
            
            while (retries > 0) {
                try {
                    this.server = await this.device.gatt.connect();
                    break; // Success, exit retry loop
                } catch (error) {
                    lastError = error;
                    retries--;
                    if (retries > 0) {
                        this.updateStatus('connecting', `Retrying... (${retries} left)`);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            }
            
            if (!this.server) {
                throw lastError || new Error('Failed to connect to GATT server');
            }
            
            // Get service
            this.service = await this.server.getPrimaryService(this.SERVICE_UUID);
            
            // Get characteristics
            this.telemetryChar = await this.service.getCharacteristic(this.TELEMETRY_UUID);
            
            // Get write characteristic - use 5fb70004 (write with auth)
            // This is the ONLY characteristic that actually changes device state
            // Per protocol testing, 5fb70007 accepts writes silently but doesn't change anything
            try {
                this.writeChar = await this.service.getCharacteristic(this.WRITE_AUTH_UUID);
                console.log('Got write-with-auth characteristic (5fb70004)');
                
                // Try to read the write characteristic to trigger pairing now
                // This way the pairing dialog appears during connection, not during first command
                try {
                    await this.writeChar.readValue();
                    this.paired = true;
                    console.log('Device is paired - write commands ready');
                } catch (pairErr) {
                    console.warn('Read from write char failed (may need pairing):', pairErr.message);
                    // On Chrome/Windows, this might trigger the pairing dialog
                    // If pairing succeeds, subsequent writes will work
                    // If it fails, the user may need to pair manually in Windows Settings
                }
            } catch (writeErr) {
                console.error('Write characteristic 5fb70004 not found:', writeErr);
                this.writeChar = null;
            }
            
            // Start notifications
            await this.telemetryChar.startNotifications();
            this.telemetryChar.addEventListener('characteristicvaluechanged', (event) => {
                this.handleTelemetry(event.target.value);
            });
            
            this.connected = true;
            this.updateStatus('connected', `Connected to ${this.device.name}`);
            
            return true;
        } catch (error) {
            console.error('Connection error:', error);
            
            // Provide helpful error messages for common issues
            let errorMsg = error.message;
            
            if (error.message.includes('GATT Server') || error.message.includes('disconnected')) {
                errorMsg = 'GATT Server Disconnected. Try:\n' +
                          '1. Disconnect device from phone Bluetooth\n' +
                          '2. Remove device from Windows Bluetooth settings\n' +
                          '3. Refresh page and try again';
            } else if (error.message.includes('User cancelled')) {
                errorMsg = 'Connection cancelled';
            } else if (error.message.includes('not found')) {
                errorMsg = 'Device not found. Make sure BBQ controller is on and in range.';
            }
            
            this.updateStatus('disconnected', errorMsg);
            return false;
        }
    }

    // Disconnect from device
    async disconnect() {
        this.intentionalDisconnect = true;
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
        this.connected = false;
        this.device = null;
        this.server = null;
        this.service = null;
        this.telemetryChar = null;
        this.writeChar = null;
        this.updateStatus('disconnected', 'Disconnected');
    }

    // Handle disconnection
    onDisconnected() {
        const wasConnected = this.connected;
        this.connected = false;
        this.server = null;
        this.service = null;
        this.telemetryChar = null;
        this.writeChar = null;
        this.updateStatus('disconnected', 'Disconnected');
        
        // Auto-reconnect if we were previously connected (unexpected disconnect)
        if (wasConnected && this.device && !this.intentionalDisconnect) {
            console.log('Unexpected disconnect - attempting auto-reconnect...');
            this.updateStatus('connecting', 'Reconnecting...');
            setTimeout(() => this.reconnect(), 2000);
        }
        this.intentionalDisconnect = false;
    }

    // Attempt to reconnect to a previously paired device
    async reconnect() {
        if (!this.device || !this.device.gatt) {
            this.updateStatus('disconnected', 'Device lost - please reconnect manually');
            return;
        }

        try {
            this.server = await this.device.gatt.connect();
            this.service = await this.server.getPrimaryService(this.SERVICE_UUID);
            this.telemetryChar = await this.service.getCharacteristic(this.TELEMETRY_UUID);
            
            try {
                this.writeChar = await this.service.getCharacteristic(this.WRITE_AUTH_UUID);
            } catch (e) {
                this.writeChar = null;
            }

            await this.telemetryChar.startNotifications();
            this.telemetryChar.addEventListener('characteristicvaluechanged', (event) => {
                this.handleTelemetry(event.target.value);
            });

            this.connected = true;
            this.updateStatus('connected', `Reconnected to ${this.device.name}`);
        } catch (error) {
            console.error('Reconnect failed:', error);
            this.updateStatus('disconnected', 'Reconnect failed - click Connect');
            this.device = null;
        }
    }

    // Parse 20-byte telemetry packet
    handleTelemetry(dataView) {
        if (dataView.byteLength !== 20) {
            console.warn('Invalid telemetry packet size:', dataView.byteLength);
            return;
        }

        const data = {
            // Byte 0: Pit Alarm (direct °F, 0 or 20-100)
            pitAlarm: dataView.getUint8(0),
            
            // Byte 1: Delay Time (value × 15 minutes, 0-96)
            delayTime: dataView.getUint8(1),
            
            // Byte 2: Delay Pit Set (value - 145, 0 or 150-400°F)
            delayPitSet: dataView.getUint8(2),
            
            // Bytes 3-4: Pit Temperature (16-bit big-endian °F, 999 = disconnected)
            pitTemp: dataView.getUint16(3, false),
            
            // Bytes 5-6: Food 1 Temperature (16-bit big-endian °F, 999 = disconnected)
            food1Temp: dataView.getUint16(5, false),
            
            // Bytes 7-8: Food 2 Temperature (16-bit big-endian °F, 999 = disconnected)
            food2Temp: dataView.getUint16(7, false),
            
            // Byte 9: Combined byte [uptime:4][lid:1][fan:3]
            byte9: dataView.getUint8(9),
            
            // Byte 10: Pit Set (value - 145, 150-400°F)
            pitSet: dataView.getUint8(10),
            
            // Byte 11: Food 1 Alarm (direct °F, 0 or 50-250)
            food1Alarm: dataView.getUint8(11),
            
            // Byte 12: Food 2 Alarm (direct °F, 0 or 50-250)
            food2Alarm: dataView.getUint8(12),
            
            // Byte 13: Fan Duty Cycle / Actual Speed (direct percentage 0-100)
            fanDuty: dataView.getUint8(13),
            
            // Byte 14: Heartbeat Clock & Status Flags [heartbeat_bit7:1][unknown:6][delay_enabled_bit0:1]
            byte14: dataView.getUint8(14),
            
            // Byte 15: Alarm Enable Flags (bit1=Food1, bit2=Food2)
            byte15: dataView.getUint8(15),
            
            // Byte 16: Food 1 Temp Trigger (direct °F, 0 or 50-250)
            food1TempTrigger: dataView.getUint8(16),
            
            // Byte 17: Food 1 Pit Set (value - 145, 0 or 150-400°F)
            food1PitSet: dataView.getUint8(17),
            
            // Byte 18: Food 2 Temp Trigger (direct °F, 0 or 50-250)
            food2TempTrigger: dataView.getUint8(18),
            
            // Byte 19: Food 2 Pit Set (value - 145, 0 or 150-400°F)
            food2PitSet: dataView.getUint8(19)
        };

        // Parse byte 9: [uptime_min:4][lid:1][fan:3]
        data.uptimeMin = (data.byte9 >> 4) & 0x0F;
        data.lidDetect = (data.byte9 >> 3) & 0x01;
        data.fanSpeed = data.byte9 & 0x07;

        // Parse byte 14: [heartbeat_bit7:1][unknown:6][delay_enabled_bit0:1]
        data.heartbeat = (data.byte14 >> 7) & 0x01;  // Bit 7: toggles every 5 seconds
        data.delayEnabled = data.byte14 & 0x01;      // Bit 0: delay pit set enabled

        // Parse byte 15: Alarm/Status Flags
        // bit7=LID  bit6=COLD  bit5=HOT  bit4=F2Done  bit3=F1Done  bit2=F2Cfg  bit1=F1Cfg  bit0=???
        data.flags = {
            unknown:       (data.byte15 & 0x01) !== 0,  // bit0: unknown
            food1Enabled:  (data.byte15 & 0x02) !== 0,  // bit1: FOOD1 alarm configured
            food2Enabled:  (data.byte15 & 0x04) !== 0,  // bit2: FOOD2 alarm configured
            food1Done:     (data.byte15 & 0x08) !== 0,  // bit3: FOOD1 alarm triggered
            food2Done:     (data.byte15 & 0x10) !== 0,  // bit4: FOOD2 alarm triggered
            pitHot:        (data.byte15 & 0x20) !== 0,  // bit5: PIT over-temperature
            pitCold:       (data.byte15 & 0x40) !== 0,  // bit6: PIT under-temperature
            lidOpen:       (data.byte15 & 0x80) !== 0   // bit7: LID open / notification
        };

        // Call callback with parsed data
        if (this.onDataCallback) {
            this.onDataCallback(data);
        }
    }

    // Send command to device
    async sendCommand(command, value) {
        if (!this.connected || !this.writeChar) {
            throw new Error('Not connected to device');
        }

        const data = new Uint8Array([command, value]);
        const cmdHex = `0x${command.toString(16).padStart(2, '0')}`;

        try {
            // 5fb70004 requires authentication/pairing
            // First write may trigger Windows pairing dialog - that's expected
            // After pairing once, subsequent writes work normally
            await this.writeChar.writeValueWithResponse(data);
            this.paired = true;
            console.log(`Sent command: ${cmdHex} = ${value}`);
            return true;
        } catch (error) {
            console.error(`Write error (${cmdHex}=${value}):`, error);
            
            // If we get a security/auth error, the device needs pairing
            // Chrome should show a pairing dialog automatically
            if (error.message && (error.message.includes('GATT') || error.message.includes('auth') || error.message.includes('Security'))) {
                console.log('Write failed - device may need pairing. If you see a Windows pairing dialog, accept it and try again.');
            }
            
            throw error;
        }
    }

    // Command shortcuts
    async setPitTemp(tempF) {
        // The device stores pit set as (value = temp - 145) in the telemetry mapping,
        // so to send a target temperature we must send (temp - 145).
        const clamped = Math.max(150, Math.min(400, tempF));
        const value = clamped - 145;
        return this.sendCommand(0x01, value);
    }

    async setFood1Alarm(tempF) {
        // Command 0x02, direct value (0 or 50-250)
        const value = tempF === 0 ? 0 : Math.max(50, Math.min(250, tempF));
        return this.sendCommand(0x02, value);
    }

    async setFood2Alarm(tempF) {
        // Command 0x03, direct value (0 or 50-250)
        const value = tempF === 0 ? 0 : Math.max(50, Math.min(250, tempF));
        return this.sendCommand(0x03, value);
    }

    async setPitAlarm(tempF) {
        // Command 0x04, direct value (0 or 20-100)
        const value = tempF === 0 ? 0 : Math.max(20, Math.min(100, tempF));
        return this.sendCommand(0x04, value);
    }

    async setLidDetect(enabled) {
        // Command 0x05, binary 0/1
        return this.sendCommand(0x05, enabled ? 1 : 0);
    }

    async setFanSpeed(speed) {
        // Command 0x06, 0=auto, device appears to accept 0-5 for manual speeds
        const value = Math.max(0, Math.min(5, speed));
        return this.sendCommand(0x06, value);
    }

    async setTempUnits(fahrenheit) {
        // Command 0x07, 0=°F, 1=°C
        return this.sendCommand(0x07, fahrenheit ? 0 : 1);
    }

    async setSoundLevel(level) {
        // Command 0x08, 0 or 1-5
        const value = Math.max(0, Math.min(5, level));
        return this.sendCommand(0x08, value);
    }

    async setDisplayBrightness(level) {
        // Command 0x09: device doesn't accept 0 (off) on some firmware — clamp to 1-3
        const value = Math.max(1, Math.min(3, level));
        if (level === 0) console.warn('Display brightness: device may ignore 0 (off); sending 1 instead');
        return this.sendCommand(0x09, value);
    }

    async setDelayTime(fifteenMinBlocks) {
        // Command 0x0A, value 0-96 (each unit = 15 min, max 24 hours)
        const value = Math.max(0, Math.min(96, fifteenMinBlocks));
        return this.sendCommand(0x0A, value);
    }

    async setDelayPitSet(tempF) {
        // Command 0x0B, value = temp - 145 (0=off, 150-400°F)
        if (tempF === 0) return this.sendCommand(0x0B, 0);
        const clamped = Math.max(150, Math.min(400, tempF));
        return this.sendCommand(0x0B, clamped - 145);
    }

    async setFood1TempTrigger(tempF) {
        // Command 0x0C, direct value (0=off, 50-250°F)
        const value = tempF === 0 ? 0 : Math.max(50, Math.min(250, tempF));
        return this.sendCommand(0x0C, value);
    }

    async setFood1PitSet(tempF) {
        // Command 0x0D, value = temp - 145 (0=off, 150-400°F)
        if (tempF === 0) return this.sendCommand(0x0D, 0);
        const clamped = Math.max(150, Math.min(400, tempF));
        return this.sendCommand(0x0D, clamped - 145);
    }

    async setFood2TempTrigger(tempF) {
        // Command 0x0E, direct value (0=off, 50-250°F)
        const value = tempF === 0 ? 0 : Math.max(50, Math.min(250, tempF));
        return this.sendCommand(0x0E, value);
    }

    async setFood2PitSet(tempF) {
        // Command 0x0F, value = temp - 145 (0=off, 150-400°F)
        if (tempF === 0) return this.sendCommand(0x0F, 0);
        const clamped = Math.max(150, Math.min(400, tempF));
        return this.sendCommand(0x0F, clamped - 145);
    }

    // Update connection status
    updateStatus(state, message) {
        if (this.onStatusCallback) {
            this.onStatusCallback(state, message);
        }
    }

    // Check if Web Bluetooth is supported
    static isSupported() {
        return navigator.bluetooth !== undefined;
    }
}

// Export for use in app
window.BBQBluetooth = BBQBluetooth;

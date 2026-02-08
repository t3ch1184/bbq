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
        
        // GATT Service UUIDs
        this.SERVICE_UUID = '5fb70000-9c92-4489-ab95-5bc20bb36eab';
        this.TELEMETRY_UUID = '5fb70001-9c92-4489-ab95-5bc20bb36eab';
        this.WRITE_UUID = '5fb70004-9c92-4489-ab95-5bc20bb36eab';
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

            // Connect to GATT server
            this.server = await this.device.gatt.connect();
            
            // Get service
            this.service = await this.server.getPrimaryService(this.SERVICE_UUID);
            
            // Get characteristics
            this.telemetryChar = await this.service.getCharacteristic(this.TELEMETRY_UUID);
            this.writeChar = await this.service.getCharacteristic(this.WRITE_UUID);
            
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
            this.updateStatus('disconnected', `Failed: ${error.message}`);
            return false;
        }
    }

    // Disconnect from device
    async disconnect() {
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
        this.onDisconnected();
    }

    // Handle disconnection
    onDisconnected() {
        this.connected = false;
        this.device = null;
        this.server = null;
        this.service = null;
        this.telemetryChar = null;
        this.writeChar = null;
        this.updateStatus('disconnected', 'Disconnected');
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
            
            // Byte 13: Unknown/reserved
            byte13: dataView.getUint8(13),
            
            // Byte 14: Combined byte [heartbeat:5][unknown:3]
            byte14: dataView.getUint8(14),
            
            // Byte 15: Alarm flags
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

        // Parse byte 14: [heartbeat:5][unknown:3]
        data.heartbeat = (data.byte14 >> 3) & 0x1F;

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

        try {
            const data = new Uint8Array([command, value]);
            await this.writeChar.writeValue(data);
            console.log(`Sent command: 0x${command.toString(16).padStart(2, '0')} = ${value}`);
            return true;
        } catch (error) {
            console.error('Write error:', error);
            throw error;
        }
    }

    // Command shortcuts
    async setPitTemp(tempF) {
        // Command 0x01, value = temp + 145
        const value = Math.max(150, Math.min(400, tempF)) + 145;
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
        // Command 0x06, 0=auto, 1-7=manual
        const value = Math.max(0, Math.min(7, speed));
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
        // Command 0x09, clamped to 0-3
        const value = Math.max(0, Math.min(3, level));
        return this.sendCommand(0x09, value);
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

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
        this.darkMode = true;
        
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

        // Setup UI event listeners
        this.setupEventListeners();

        // Setup Chart.js
        this.setupChart();

        // Request notification permission
        this.requestNotificationPermission();

        // Register service worker
        this.registerServiceWorker();

        // Load theme preference
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'light') {
            this.darkMode = false;
            document.body.classList.remove('dark-mode');
            document.getElementById('themeToggle').textContent = '☀️';
        }
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

        // Theme toggle
        document.getElementById('themeToggle').addEventListener('click', () => {
            this.toggleTheme();
        });

        // Control sliders
        document.getElementById('pitSetSlider').addEventListener('change', (e) => {
            const temp = parseInt(e.target.value);
            document.getElementById('pitSetValue').textContent = `${temp}°F`;
            if (this.bluetooth.connected) {
                this.bluetooth.setPitTemp(temp).catch(err => {
                    this.showToast('Failed to set pit temp', 'error');
                });
            }
        });

        document.getElementById('pitSetSlider').addEventListener('input', (e) => {
            document.getElementById('pitSetValue').textContent = `${e.target.value}°F`;
        });

        document.getElementById('food1AlarmSlider').addEventListener('change', (e) => {
            const temp = parseInt(e.target.value);
            const display = temp === 0 ? 'Off' : `${temp}°F`;
            document.getElementById('food1AlarmValue').textContent = display;
            if (this.bluetooth.connected) {
                this.bluetooth.setFood1Alarm(temp).catch(err => {
                    this.showToast('Failed to set Food 1 alarm', 'error');
                });
            }
        });

        document.getElementById('food1AlarmSlider').addEventListener('input', (e) => {
            const temp = parseInt(e.target.value);
            document.getElementById('food1AlarmValue').textContent = temp === 0 ? 'Off' : `${temp}°F`;
        });

        document.getElementById('food2AlarmSlider').addEventListener('change', (e) => {
            const temp = parseInt(e.target.value);
            const display = temp === 0 ? 'Off' : `${temp}°F`;
            document.getElementById('food2AlarmValue').textContent = display;
            if (this.bluetooth.connected) {
                this.bluetooth.setFood2Alarm(temp).catch(err => {
                    this.showToast('Failed to set Food 2 alarm', 'error');
                });
            }
        });

        document.getElementById('food2AlarmSlider').addEventListener('input', (e) => {
            const temp = parseInt(e.target.value);
            document.getElementById('food2AlarmValue').textContent = temp === 0 ? 'Off' : `${temp}°F`;
        });

        document.getElementById('soundSlider').addEventListener('change', (e) => {
            const level = parseInt(e.target.value);
            document.getElementById('soundValue').textContent = level === 0 ? 'Off' : level;
            if (this.bluetooth.connected) {
                this.bluetooth.setSoundLevel(level).catch(err => {
                    this.showToast('Failed to set sound level', 'error');
                });
            }
        });

        document.getElementById('soundSlider').addEventListener('input', (e) => {
            const level = parseInt(e.target.value);
            document.getElementById('soundValue').textContent = level === 0 ? 'Off' : level;
        });

        document.getElementById('displaySlider').addEventListener('change', (e) => {
            const level = parseInt(e.target.value);
            document.getElementById('displayValue').textContent = level === 0 ? 'Off' : level;
            if (this.bluetooth.connected) {
                this.bluetooth.setDisplayBrightness(level).catch(err => {
                    this.showToast('Failed to set display brightness', 'error');
                });
            }
        });

        document.getElementById('displaySlider').addEventListener('input', (e) => {
            const level = parseInt(e.target.value);
            document.getElementById('displayValue').textContent = level === 0 ? 'Off' : level;
        });

        // Fan speed buttons
        document.querySelectorAll('[data-fan]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const speed = parseInt(e.target.dataset.fan);
                if (this.bluetooth.connected) {
                    this.bluetooth.setFanSpeed(speed).then(() => {
                        document.querySelectorAll('[data-fan]').forEach(b => b.classList.remove('active'));
                        e.target.classList.add('active');
                    }).catch(err => {
                        this.showToast('Failed to set fan speed', 'error');
                    });
                }
            });
        });

        // Lid detect buttons
        document.querySelectorAll('[data-lid]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const enabled = parseInt(e.target.dataset.lid);
                if (this.bluetooth.connected) {
                    this.bluetooth.setLidDetect(enabled).then(() => {
                        document.querySelectorAll('[data-lid]').forEach(b => b.classList.remove('active'));
                        e.target.classList.add('active');
                    }).catch(err => {
                        this.showToast('Failed to set lid detect', 'error');
                    });
                }
            });
        });

        // Temperature units buttons
        document.querySelectorAll('[data-units]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const fahrenheit = parseInt(e.target.dataset.units) === 0;
                if (this.bluetooth.connected) {
                    this.bluetooth.setTempUnits(fahrenheit).then(() => {
                        document.querySelectorAll('[data-units]').forEach(b => b.classList.remove('active'));
                        e.target.classList.add('active');
                    }).catch(err => {
                        this.showToast('Failed to set temp units', 'error');
                    });
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

        // Update status indicators
        document.getElementById('fanSpeed').textContent = data.fanSpeed === 0 ? 'Auto' : data.fanSpeed;
        document.getElementById('lidDetect').textContent = data.lidDetect ? 'Enabled' : 'Disabled';
        document.getElementById('uptime').textContent = `${data.uptimeMin}m`;

        // Update temperature history and chart
        this.addToHistory(data);
        this.updateChart();

        // Update fuel monitor
        this.updateFuelMonitor(data);

        // Check for alarms
        this.checkAlarms(data);
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
                const diff = Math.abs(temp - (target - 145));
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
            const targetTemp = target > 0 ? target - 145 : 0;
            targetElement.textContent = `Target: ${targetTemp}°F`;
        } else {
            targetElement.textContent = target === 0 ? 'Alarm: Off' : `Alarm: ${target}°F`;
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
        const ctx = document.getElementById('tempChart').getContext('2d');
        
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Pit',
                        data: [],
                        borderColor: '#ff6b35',
                        backgroundColor: 'rgba(255, 107, 53, 0.1)',
                        borderWidth: 2,
                        tension: 0.4,
                        spanGaps: true
                    },
                    {
                        label: 'Food 1',
                        data: [],
                        borderColor: '#4ecdc4',
                        backgroundColor: 'rgba(78, 205, 196, 0.1)',
                        borderWidth: 2,
                        tension: 0.4,
                        spanGaps: true
                    },
                    {
                        label: 'Food 2',
                        data: [],
                        borderColor: '#ffe66d',
                        backgroundColor: 'rgba(255, 230, 109, 0.1)',
                        borderWidth: 2,
                        tension: 0.4,
                        spanGaps: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        labels: {
                            color: this.darkMode ? '#e0e0e0' : '#333'
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return `${context.dataset.label}: ${context.parsed.y}°F`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'minute',
                            displayFormats: {
                                minute: 'HH:mm'
                            }
                        },
                        grid: {
                            color: this.darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
                        },
                        ticks: {
                            color: this.darkMode ? '#e0e0e0' : '#333'
                        }
                    },
                    y: {
                        beginAtZero: false,
                        grid: {
                            color: this.darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
                        },
                        ticks: {
                            color: this.darkMode ? '#e0e0e0' : '#333',
                            callback: (value) => `${value}°F`
                        }
                    }
                }
            }
        });
    }

    updateChart() {
        if (!this.chart) return;

        // Filter data by time range
        const now = Date.now();
        const cutoff = now - (this.graphRange * 60 * 1000);
        
        const filteredData = {
            timestamps: [],
            pit: [],
            food1: [],
            food2: []
        };

        for (let i = 0; i < this.tempHistory.timestamps.length; i++) {
            if (this.tempHistory.timestamps[i] >= cutoff) {
                filteredData.timestamps.push(this.tempHistory.timestamps[i]);
                filteredData.pit.push(this.tempHistory.pit[i]);
                filteredData.food1.push(this.tempHistory.food1[i]);
                filteredData.food2.push(this.tempHistory.food2[i]);
            }
        }

        this.chart.data.labels = filteredData.timestamps;
        this.chart.data.datasets[0].data = filteredData.pit;
        this.chart.data.datasets[1].data = filteredData.food1;
        this.chart.data.datasets[2].data = filteredData.food2;
        this.chart.update('none'); // No animation for real-time updates
    }

    setGraphRange(minutes) {
        this.graphRange = minutes;
        this.updateChart();
        
        // Update active button
        document.querySelectorAll('.graph-controls .small-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        event.target.classList.add('active');
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

        statusBar.className = `status-bar ${state}`;
        statusText.textContent = message;

        if (state === 'connected') {
            connectBtn.textContent = 'Disconnect';
            connectBtn.classList.add('connected');
        } else {
            connectBtn.textContent = 'Connect';
            connectBtn.classList.remove('connected');
        }
    }

    toggleTheme() {
        this.darkMode = !this.darkMode;
        document.body.classList.toggle('dark-mode');
        
        const themeBtn = document.getElementById('themeToggle');
        themeBtn.textContent = this.darkMode ? '🌙' : '☀️';
        
        // Save preference
        localStorage.setItem('theme', this.darkMode ? 'dark' : 'light');

        // Update chart colors
        if (this.chart) {
            const textColor = this.darkMode ? '#e0e0e0' : '#333';
            const gridColor = this.darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
            
            this.chart.options.plugins.legend.labels.color = textColor;
            this.chart.options.scales.x.grid.color = gridColor;
            this.chart.options.scales.x.ticks.color = textColor;
            this.chart.options.scales.y.grid.color = gridColor;
            this.chart.options.scales.y.ticks.color = textColor;
            this.chart.update();
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

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new BBQApp();
});

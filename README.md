# BBQ Controller PWA

A Progressive Web App for controlling your iQE050 BBQ controller via Bluetooth.

## Features

- 🌡️ **Real-time Temperature Monitoring** - Track Pit, Food 1, and Food 2 probes
- 📊 **Temperature Graphs** - Visual history with adjustable time ranges (15m - 3h)
- 🎛️ **Full Device Control** - Set temperatures, alarms, fan speed, and all device settings
- ⛽ **Fuel Monitoring** - Smart alerts when fuel is running low based on fan duty and temp trends
- 🔔 **Notifications** - Get alerted when food reaches target temperature or fuel is low
- 🌙 **Dark Mode** - Easy on the eyes for nighttime cooking
- 📱 **Installable** - Add to home screen like a native app
- 💾 **Offline Ready** - Works without internet after first load

## How to Deploy

### Option 1: GitHub Pages (Recommended - FREE)

1. **Create a GitHub account** if you don't have one: https://github.com

2. **Create a new repository:**
   - Go to https://github.com/new
   - Name it something like `bbq-controller`
   - Make it Public
   - Click "Create repository"

3. **Upload the app files:**
   - Click "uploading an existing file"
   - Drag and drop ALL files from the `bbq-app` folder
   - Click "Commit changes"

4. **Enable GitHub Pages:**
   - Go to repository Settings
   - Scroll to "Pages" section
   - Under "Source", select "main" branch
   - Click Save
   - Wait 1-2 minutes for deployment

5. **Access your app:**
   - Your app will be at: `https://YOUR-USERNAME.github.io/bbq-controller/`
   - Open this URL on your Android phone in Chrome or Edge

### Option 2: Netlify (Alternative - Also FREE)

1. Go to https://www.netlify.com
2. Sign up for free account
3. Drag and drop the `bbq-app` folder onto Netlify
4. Get your app URL (like `https://random-name.netlify.app`)

### Option 3: Local Testing (Development Only)

For testing on your local network:

```powershell
# In the bbq-app folder, run a simple HTTP server
python -m http.server 8000
```

Then access from your phone at: `http://YOUR-COMPUTER-IP:8000`

**Note:** Web Bluetooth requires HTTPS in production, so this only works for testing!

## Installing on Your Phone

Once deployed to GitHub Pages or Netlify:

1. **Open in Chrome or Edge** (Safari doesn't support Web Bluetooth)
2. **Click "Connect"** and pair with your BBQ controller
3. **Install the app:**
   - Chrome: Tap the ⋮ menu → "Install app"
   - Edge: Tap the ⋮ menu → "Add to Home screen"
4. **Use like a regular app** from your home screen!

## Usage

### First Time Setup

1. Turn on your iQE050 BBQ controller
2. Open the app
3. Click "Connect" button
4. Select "iQE" device from the list
5. Pair if prompted

### Monitoring

- **Temperature Display** shows current temps for all probes
- **Graph** shows temperature history (tap time buttons to change range)
- **Status Section** shows fan speed, lid detect, uptime, etc.
- **Fuel Monitor** tracks fan activity and alerts when fuel is low

### Controls

- **Pit Temperature** - Set your target cooking temperature (150-400°F)
- **Food Alarms** - Set target temps for Food 1 and Food 2 probes
- **Fan Speed** - Auto or manual (1-7)
- **Lid Detect** - Enable/disable lid detection
- **Temperature Units** - Switch between °F and °C
- **Sound Level** - Adjust beep volume (0-5)
- **Display Brightness** - Adjust screen brightness (0-3)

### Fuel Monitoring

The app monitors your fuel level by analyzing:
- **Fan duty cycle** - How hard the fan is working
- **Temperature drop rate** - If temp is dropping despite high fan

When fuel gets low, you'll see:
- ⚠️ Warning on fuel monitor
- System notification
- Color-coded fuel bar (green → yellow → red)

## Troubleshooting

### "Web Bluetooth not supported"
- Use Chrome or Edge browser (not Safari or Firefox)
- Make sure you're on Android or desktop Chrome/Edge

### Can't connect to device
- Make sure BBQ controller is powered on
- Try turning Bluetooth off/on on your phone
- Move closer to the device
- Refresh the page and try again

### App doesn't update
- Refresh the page
- Clear browser cache
- If installed, uninstall and reinstall the app

### Notifications not working
- Make sure you allowed notifications when prompted
- Check phone's notification settings for the browser/app

## Technical Details

### Browser Compatibility

- ✅ Chrome on Android
- ✅ Edge on Android
- ✅ Chrome on Windows/Mac/Linux
- ✅ Edge on Windows/Mac
- ❌ Safari (no Web Bluetooth support)
- ❌ Firefox (limited Web Bluetooth support)

### Protocol

The app uses the Web Bluetooth API to communicate with the iQE050 controller:

- **Service UUID:** `5fb70000-9c92-4489-ab95-5bc20bb36eab`
- **Telemetry (Notify):** `5fb70001...` - 20-byte temperature/status data
- **Write:** `5fb70004...` - 2-byte commands [cmd, value]

See `bluetooth.js` for full protocol implementation.

### Data Storage

- Theme preference saved in localStorage
- Temperature history kept in memory (up to 2 hours)
- No personal data is collected or transmitted

## Support

Built for the iQE050 BBQ controller. Based on reverse-engineered BLE protocol.

For issues or questions, refer to the `PROTOCOL.md` file in the parent directory for detailed protocol documentation.

## Credits

- Built with vanilla JavaScript (no frameworks)
- Charts powered by Chart.js
- Icons from system emoji
- Reverse-engineered protocol documentation

Enjoy your BBQ! 🔥🍖

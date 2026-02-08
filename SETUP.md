# Quick Setup Guide

## 📱 For You and Your Daughter

### Step 1: Deploy the App (One Time)

**Easiest Method - GitHub Pages (FREE):**

1. Go to **https://github.com** and create a free account
2. Click the **+** button → **New repository**
3. Name it: `bbq-controller`
4. Make it **Public**
5. Click **Create repository**
6. Click **uploading an existing file**
7. **Drag and drop ALL files** from the `bbq-app` folder:
   - index.html
   - app.js
   - bluetooth.js
   - styles.css
   - manifest.json
   - service-worker.js
   - icon-192.png
   - icon-512.png
   - README.md
8. Click **Commit changes**
9. Go to **Settings** → scroll to **Pages** section
10. Under **Source**, select **main** branch → **Save**
11. Wait 1-2 minutes

Your app URL will be: `https://YOUR-USERNAME.github.io/bbq-controller/`

### Step 2: Install on Your Phones

1. **Open Chrome or Edge** on your Android phone (not Safari!)
2. Go to your app URL: `https://YOUR-USERNAME.github.io/bbq-controller/`
3. Tap the **⋮** menu (three dots)
4. Tap **"Install app"** or **"Add to Home screen"**
5. Confirm installation
6. Find the BBQ Controller icon on your home screen!

### Step 3: Connect and Use

1. **Turn on your BBQ controller**
2. **Open the app** from your home screen
3. Tap **"Connect"** button
4. Select **"iQE"** from the device list
5. Allow pairing if prompted
6. **You're connected!** 🎉

Now you can:
- 📊 Watch temperature graphs
- 🎛️ Set target temperatures
- 🔔 Get alerts when food is ready
- ⛽ Monitor fuel levels
- 🌙 Use dark mode at night

## Updating the App

If you make changes to the app files:
1. Go to your GitHub repository
2. Click on the file you want to update
3. Click the pencil icon (Edit)
4. Make your changes
5. Click "Commit changes"
6. Refresh the app on your phones

## Troubleshooting

**Can't find "Install app" option?**
- Make sure you're using Chrome or Edge (not Safari)
- Make sure you're on the GitHub Pages URL (https://)

**Can't connect to BBQ?**
- Make sure the controller is powered on
- Stand close to it
- Turn Bluetooth off/on on your phone
- Refresh the app page

**App doesn't update?**
- Close the app completely
- Clear browser cache
- Reopen the app

## Alternative: Testing Locally (No Internet Needed)

If you want to test before deploying:

1. Open PowerShell in the `bbq-app` folder
2. Run: `python -m http.server 8000`
3. Find your computer's IP address: `ipconfig`
4. On your phone, open Chrome and go to: `http://YOUR-COMPUTER-IP:8000`

**Note:** This only works on your local network and requires HTTPS for full functionality. Use GitHub Pages for the real thing!

---

**Need Help?** Check the full [README.md](README.md) for detailed instructions.

**Enjoy your BBQ!** 🔥🍖

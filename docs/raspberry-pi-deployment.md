# Raspberry Pi Deployment Guide

This guide prepares the dashboard for local Raspberry Pi use. It does not install anything automatically and does not assume the Pi is available right now.

## Recommended Approach

Use `systemd` to run the Node app at startup.

Why `systemd`:

- It is built into Raspberry Pi OS.
- It restarts the app if it crashes.
- It starts the app after reboot without another process manager.
- It has fewer moving parts than PM2 for a single local dashboard.

PM2 is also good, especially if you prefer Node-specific process tooling and logs. For this project, `systemd` is the simpler default because the Pi already has it.

## Required Software On The Pi

- Raspberry Pi OS
- Node.js 18 or newer
- npm
- Git, if cloning from a repository
- Chromium, for future kiosk mode

Check Node:

```bash
node --version
npm --version
```

## Copy Or Clone The Project

Using Git:

```bash
git clone <your-repo-url> ~/family-dashboard
cd ~/family-dashboard
```

Or copy the project folder to the Pi and open a terminal in that folder.

## Install Dependencies

```bash
npm install
```

## Create `.env`

```bash
cp .env.example .env
nano .env
```

Fill in only the integrations you want to use.

Never commit `.env`. It may contain OpenAI keys, Google tokens, and other private values.

## Build The Frontend

```bash
npm run build
```

`npm start` will serve `dist/` when this build exists. If `dist/` is missing, it falls back to the project root so local development stays forgiving.

## Start Manually

```bash
npm start
```

Open this on the Pi:

```text
http://localhost:4000
```

From another device on the same network, use the Pi hostname or IP address:

```text
http://raspberrypi.local:4000
http://192.168.1.50:4000
```

## Configure Allowed Origins

The dashboard allows localhost browser origins by default. If another device or hostname will open the dashboard, add it to `.env`:

```env
DASHBOARD_ALLOWED_ORIGINS=http://raspberrypi.local:4000,http://192.168.1.50:4000
```

Only add origins you trust.

## systemd Service

A sample service file is included at:

```text
docs/family-dashboard.service.example
```

To install it on the Pi:

```bash
sudo cp docs/family-dashboard.service.example /etc/systemd/system/family-dashboard.service
sudo nano /etc/systemd/system/family-dashboard.service
```

Edit these values:

- `User=pi`
- `WorkingDirectory=/home/pi/family-dashboard`
- `ExecStart=/usr/bin/npm start`

Then enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable family-dashboard
sudo systemctl start family-dashboard
sudo systemctl status family-dashboard
```

View logs:

```bash
journalctl -u family-dashboard -f
```

## Future Kiosk Mode Notes

Kiosk mode usually has four parts:

- Run the Node app at startup with `systemd`.
- Start Chromium in kiosk mode after login or boot.
- Open `http://localhost:4000`.
- Keep the screen awake.

Example Chromium command to research/test later:

```bash
chromium-browser --kiosk --app=http://localhost:4000
```

Screen power settings vary by Raspberry Pi OS version. Common approaches include disabling screen blanking in the desktop settings, using `xset`, or configuring Wayland/Labwc settings on newer systems.

Do the Node service first. Once reboot recovery is reliable, add Chromium kiosk launch separately.

## Quick Pi Smoke Test

```bash
npm run check
npm run build
npm start
```

Then open:

```text
http://localhost:4000/api/health
```

You should see `"success": true`.

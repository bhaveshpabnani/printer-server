# Astha HJB Canteen - Automatic Thermal Print Server

🖨️ Automatic thermal printer server that listens to new orders in real-time and prints them without any user interaction.

## Features

- ✅ **Fully Automatic** - No popups, no confirmation dialogs
- ✅ **Real-time** - Prints as soon as order is placed
- ✅ **Multiple Printer Support** - USB, Network (Ethernet), Windows printers
- ✅ **ESC/POS Commands** - Optimized for 80mm thermal printers
- ✅ **Sound Notifications** - Audio alert on new order
- ✅ **Error Recovery** - Automatic retry on print failures
- ✅ **Multiple Copies** - Print multiple receipts per order
- ✅ **Cash Drawer** - Optional automatic cash drawer opening

## System Requirements

- **Operating System**: Windows 10/11, macOS, or Linux
- **Node.js**: Version 16 or higher
- **Thermal Printer**: 80mm POS thermal printer (ESC/POS compatible)
- **Connection**: USB, Ethernet, or Windows printer driver

## Quick Start

### 1. Install Dependencies

Open PowerShell/Terminal in the `print-server` folder:

```powershell
cd print-server
npm install
```

### 2. Configure Printer

Copy `.env.example` to `.env` and configure your printer:

```powershell
copy .env.example .env
```

Edit `.env` file with your printer settings:

**For Windows Printers (Recommended):**
```env
PRINTER_TYPE=windows
PRINTER_NAME=POS-80
```

**For USB Printers:**
```env
PRINTER_TYPE=usb
PRINTER_VENDOR_ID=
PRINTER_PRODUCT_ID=
```

**For Network Printers:**
```env
PRINTER_TYPE=network
PRINTER_IP=192.168.1.100
PRINTER_PORT=9100
```

### 3. Test Printer

Before running the server, test your printer connection:

```powershell
npm run test-print
```

This will:
- ✅ Check printer connection
- ✅ Print a test page
- ✅ Print a sample order
- ✅ List available Windows printers

### 4. Start Auto-Print Server

```powershell
npm start
```

You should see:
```
╔═══════════════════════════════════════════════════╗
║   ASTHA HJB CANTEEN - Auto Print Server v1.0     ║
╚═══════════════════════════════════════════════════╝

🖨️  Printer Type: windows
📡 Supabase URL: https://your-project.supabase.co
✅ Connected to Supabase Realtime!
🎧 Listening for new orders...

🟢 SERVER RUNNING - Press Ctrl+C to stop
```

### 5. Test with Real Order

1. Keep the print server running
2. Open your restaurant app
3. Place a test order
4. Watch it print automatically! 🎉

## Finding Your Windows Printer Name

Run the test script to see all available printers:

```powershell
npm run test-print
```

Common printer names:
- `POS-80`
- `XP-80C`
- `TM-T82`
- `ZJ-58` 
- `TP-808`

Copy the exact name to your `.env` file.

## Configuration Options

### .env File Settings

| Variable | Description | Example |
|----------|-------------|---------|
| `PRINTER_TYPE` | Printer connection type | `windows`, `usb`, `network` |
| `PRINTER_NAME` | Windows printer name | `POS-80` |
| `PRINTER_IP` | Network printer IP | `192.168.1.100` |
| `PRINTER_PORT` | Network printer port | `9100` |
| `AUTO_PRINT_ENABLED` | Enable/disable auto-print | `true` / `false` |
| `PRINT_ON_STATUS` | Which order status to print | `placed`, `preparing` |
| `PRINT_COPIES` | Number of copies to print | `1`, `2`, `3` |
| `PLAY_SOUND` | Play sound on new order | `true` / `false` |
| `OPEN_CASH_DRAWER` | Auto-open cash drawer | `true` / `false` |

## USB Printer Setup (Advanced)

### Windows

1. Install [Zadig](https://zadig.akeo.ie/) driver tool
2. Connect your USB thermal printer
3. Open Zadig → Options → List All Devices
4. Select your printer → Replace Driver with WinUSB
5. Get Vendor ID and Product ID from Device Manager
6. Update `.env` file

### Linux

```bash
sudo usermod -a -G lp $USER
sudo chmod 666 /dev/usb/lp0
```

### macOS

Install libusb:
```bash
brew install libusb
```

## Network Printer Setup

1. Print a test page from the printer to get its IP address
2. Usually printed at the bottom of test page
3. Or check your router's DHCP client list
4. Ensure printer port is 9100 (standard)
5. Ping the printer to test: `ping 192.168.1.100`

## Running as Windows Startup Service

### Option 1: Task Scheduler (Recommended)

1. Open Task Scheduler
2. Create Basic Task → Name: "Astha Print Server"
3. Trigger: "When computer starts"
4. Action: "Start a program"
5. Program: `C:\Program Files\nodejs\node.exe`
6. Arguments: `C:\path\to\print-server\index.js`
7. Start in: `C:\path\to\print-server`

### Option 2: Build Standalone EXE

```powershell
npm run build
```

This creates `dist/astha-printer.exe` that you can:
- Run directly without Node.js
- Add to Windows Startup folder
- Install as a Windows Service

## Troubleshooting

### ❌ "Failed to connect to printer"

**USB Printer:**
- Check USB cable connection
- Try different USB port
- Run as Administrator
- Install Zadig driver (Windows)

**Network Printer:**
- Verify IP address with `ping`
- Check firewall settings
- Ensure printer is on same network
- Try port 9100 or 9101

**Windows Printer:**
- Verify exact printer name
- Check printer is "Ready" in Windows
- Install proper printer driver
- Set as default printer

### ❌ "Printed but paper doesn't cut"

Some thermal printers don't support auto-cut. You can:
1. Manually tear the paper
2. Change printer driver settings
3. Disable cut in code (edit `printer.js`)

### ❌ "Characters printing as �����"

Change character set in `printer.js`:
```javascript
characterSet: 'PC437_USA'  // or 'PC850_MULTILINGUAL'
```

### ❌ "Server stops after some time"

Windows might be sleeping. Disable:
- Power Settings → Sleep → Never
- USB Selective Suspend → Disabled

### ⚠️ "Print queue jammed"

Clear print queue:
```powershell
net stop spooler
del /Q /F /S "%systemroot%\System32\spool\PRINTERS\*"
net start spooler
```

## Development

### Run in Development Mode

With auto-restart on file changes:

```powershell
npm run dev
```

### Test Without Printer

Set `AUTO_PRINT_ENABLED=false` in `.env` to see order data without printing.

## Architecture

```
┌─────────────────┐
│   Web App       │
│  (Customer UI)  │
└────────┬────────┘
         │
         │ Order placed
         ▼
┌─────────────────┐
│    Supabase     │◄────────┐
│    Database     │         │
└────────┬────────┘         │
         │                  │
         │ Realtime         │ Subscribe
         │ Broadcast        │
         │                  │
         ▼                  │
┌─────────────────┐         │
│  Print Server   │─────────┘
│  (This App)     │
└────────┬────────┘
         │
         │ ESC/POS Commands
         ▼
┌─────────────────┐
│ Thermal Printer │
│    (80mm)       │
└─────────────────┘
```

## Production Deployment

### Dedicated Print PC

1. Use a dedicated Windows PC/laptop near the kitchen
2. Keep it always on with power backup
3. Install print server as startup service
4. Use Ethernet connection for reliability

### Raspberry Pi (Advanced)

For Linux users, run on Raspberry Pi:
```bash
sudo apt-get install libusb-1.0-0-dev
npm install
npm start
```

## Support & Issues

Common printer models tested:
- ✅ Epson TM-T82
- ✅ Star TSP143
- ✅ Xprinter XP-80C
- ✅ ZJ-58mm
- ✅ POS-80

Having issues? Check:
1. Printer is ESC/POS compatible
2. Driver installed correctly  
3. Paper loaded and cash drawer connected
4. Firewall not blocking connections

## License

MIT License - Feel free to modify for your needs!

---

**Made with ❤️ for Astha HJB Canteen**

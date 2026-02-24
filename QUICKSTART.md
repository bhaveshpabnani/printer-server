# 🖨️ Quick Start Guide - Thermal Auto-Print

## ⚡ 5-Minute Setup

### Step 1: Install
```powershell
cd print-server
npm install
```

### Step 2: Configure
Edit `.env` file:
```env
PRINTER_TYPE=windows
PRINTER_NAME=POS-80
```

### Step 3: Test
```powershell
npm run test-print
```

### Step 4: Run
```powershell
npm start
```

### Step 5: Test Order
Place an order from your app and watch it print automatically! 🎉

## Common Printer Names
- `POS-80`
- `ZJ-58`
- `XP-80C`
- `TM-T82`

Run `npm run test-print` to see YOUR available printers.

## Need Help?
See full [README.md](README.md) for detailed instructions.

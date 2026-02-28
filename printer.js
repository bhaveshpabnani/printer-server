/**
 * Thermal Printer Module
 * Handles printing to POS thermal printers using raw ESC/POS commands
 * via @alexssmusica/node-printer (Windows printer driver)
 */

const nodePrinter = require('@alexssmusica/node-printer');
const dotenv = require('dotenv');
const chalk = require('chalk');

dotenv.config();

// ─── ESC/POS Command Constants ───────────────────────────────────────────────
const ESC = 0x1B;
const GS  = 0x1D;
const LF  = 0x0A;

const CMD = {
  INIT:          [ESC, 0x40],
  ALIGN_LEFT:    [ESC, 0x61, 0x00],
  ALIGN_CENTER:  [ESC, 0x61, 0x01],
  ALIGN_RIGHT:   [ESC, 0x61, 0x02],
  BOLD_ON:       [ESC, 0x45, 0x01],
  BOLD_OFF:      [ESC, 0x45, 0x00],
  DOUBLE_HEIGHT: [GS,  0x21, 0x01],
  DOUBLE_SIZE:   [GS,  0x21, 0x11],
  NORMAL_SIZE:   [GS,  0x21, 0x00],
  CUT_FULL:      [GS,  0x56, 0x00],
  CUT_PARTIAL:   [GS,  0x56, 0x41, 0x00],
  CASH_DRAWER:   [ESC, 0x70, 0x00, 0x19, 0xFA],
  LINE_FEED:     [LF],
};

// ─── ESC/POS Builder ─────────────────────────────────────────────────────────
class EscPos {
  constructor() {
    this.bytes = [];
  }

  _add(arr)  { this.bytes.push(...arr); return this; }

  _text(str) {
    for (let i = 0; i < str.length; i++) {
      this.bytes.push(str.charCodeAt(i) & 0xFF);
    }
    return this;
  }

  init()         { return this._add(CMD.INIT); }
  alignLeft()    { return this._add(CMD.ALIGN_LEFT); }
  alignCenter()  { return this._add(CMD.ALIGN_CENTER); }
  alignRight()   { return this._add(CMD.ALIGN_RIGHT); }
  boldOn()       { return this._add(CMD.BOLD_ON); }
  boldOff()      { return this._add(CMD.BOLD_OFF); }
  normalSize()   { return this._add(CMD.NORMAL_SIZE); }
  doubleHeight() { return this._add(CMD.DOUBLE_HEIGHT); }
  doubleSize()   { return this._add(CMD.DOUBLE_SIZE); }
  feed(n = 1)    { for (let i = 0; i < n; i++) this._add(CMD.LINE_FEED); return this; }
  cutFull()      { return this._add(CMD.CUT_FULL); }
  cutPartial()   { return this._add(CMD.CUT_PARTIAL); }
  cashDrawer()   { return this._add(CMD.CASH_DRAWER); }

  println(str = '') {
    this._text(str);
    this._add(CMD.LINE_FEED);
    return this;
  }

  drawLine(char = '-', width = 48) {
    return this.println(char.repeat(width));
  }

  // Left text | Right text padded to `width` total chars
  leftRight(left, right, width = 48) {
    const l = String(left);
    const r = String(right);
    const spaces = Math.max(1, width - l.length - r.length);
    return this.println(l + ' '.repeat(spaces) + r);
  }

  toBuffer() {
    return Buffer.from(this.bytes);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateTime(dateString) {
  const date  = new Date(dateString);
  const day   = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year  = date.getFullYear();
  const hours = date.getHours();
  const mins  = String(date.getMinutes()).padStart(2, '0');
  const ampm  = hours >= 12 ? 'PM' : 'AM';
  const h12   = String(hours % 12 || 12).padStart(2, '0');
  return `${day}-${month}-${year} ${h12}:${mins} ${ampm}`;
}

function col(text, width, align = 'left') {
  const str = String(text || '').substring(0, width);
  if (align === 'right')  return str.padStart(width, ' ');
  if (align === 'center') {
    const pad = Math.floor((width - str.length) / 2);
    return ' '.repeat(pad) + str + ' '.repeat(width - pad - str.length);
  }
  return str.padEnd(width, ' ');
}

function getDefaultPrinterName() {
  return (process.env.DEFAULT_PRINTER || process.env.PRINTER_NAME || '80mm Series Printer').replace(/^"|"$/g, '');
}

/**
 * Resolve the printer name for a specific kitchen.
 * Lookup order:
 *   1. KITCHEN_{N}_PRINTER env var (e.g. KITCHEN_1_PRINTER)
 *   2. DEFAULT_PRINTER / PRINTER_NAME (backwards-compat fallback)
 *
 * @param {number|null} kitchenNumber
 * @returns {string} Windows printer name
 */
function getKitchenPrinterName(kitchenNumber) {
  if (kitchenNumber != null) {
    const specific = process.env[`KITCHEN_${kitchenNumber}_PRINTER`];
    if (specific) return specific.replace(/^"|"$/g, '');
  }
  return getDefaultPrinterName();
}

/**
 * Returns a map of { kitchenNumber → printerName } for all KITCHEN_N_PRINTER
 * env vars that are set, plus an entry for the default printer.
 * @returns {Map<number|null, string>}
 */
function getKitchenPrinterMap() {
  const map = new Map();
  // Scan env for KITCHEN_N_PRINTER keys
  for (const [key, value] of Object.entries(process.env)) {
    const match = key.match(/^KITCHEN_(\d+)_PRINTER$/);
    if (match && value) {
      map.set(parseInt(match[1], 10), value.replace(/^"|"$/g, ''));
    }
  }
  // Always include the default
  map.set(null, getDefaultPrinterName());
  return map;
}

function sendToPrinter(buffer, printerName) {
  const name = (printerName || getDefaultPrinterName());
  return new Promise((resolve, reject) => {
    nodePrinter.printDirect({
      data:    buffer,
      printer: name,
      type:    'RAW',
      success: (jobID) => {
        console.log(chalk.gray(`   Print job queued on "${name}" (ID: ${jobID})`));
        resolve(true);
      },
      error: (err) => reject(new Error(err))
    });
  });
}

/**
 * Get sorted unique kitchen numbers from a list of items.
 * Items without a kitchen_number (null/undefined) are grouped under kitchen null.
 */
function getUniqueKitchens(items) {
  const kitchens = new Set(items.map(i => i.kitchen_number ?? null));
  // Sort: numbered kitchens first (ascending), then null at end
  return [...kitchens].sort((a, b) => {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return a - b;
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Print one kitchen slip.
 *
 * @param {object}      order         - The order row from DB
 * @param {object[]}    items         - All order_items for this order
 * @param {number|null} kitchenNumber - Which kitchen to print for (null = unassigned)
 * @param {number}      kitchenIndex  - 1-based index among kitchens being printed
 * @param {number}      totalKitchens - Total number of kitchen slips for this order
 * @param {boolean}     openDrawer    - Whether to open cash drawer on this slip
 */
async function printKitchenSlip(order, items, kitchenNumber, kitchenIndex, totalKitchens, openDrawer = false) {
  try {
    // Filter items for this kitchen
    const kitchenItems = items.filter(i =>
      kitchenNumber === null
        ? (i.kitchen_number === null || i.kitchen_number === undefined)
        : i.kitchen_number === kitchenNumber
    );

    if (kitchenItems.length === 0) {
      console.log(chalk.yellow(`   ⚠️  No items for kitchen ${kitchenNumber ?? 'unassigned'}, skipping slip`));
      return true;
    }

    const doc = new EscPos();
    doc.init();

    // ── Header: Date | Receipt# ───────────────────────────────────────────
    doc.alignLeft().normalSize();
    doc.leftRight(formatDateTime(order.created_at), `Receipt #${order.order_number}`);
    doc.println('Store: 1');
    doc.feed();

    // ── Brand block ───────────────────────────────────────────────────────
    doc.alignCenter();
    doc.boldOn().println('ASTHA HJB Canteen').boldOff();
    doc.println('HJB Hall, IIT Kharagpur');
    doc.println('West Bengal');
    doc.println('+91-9333190224');
    doc.feed();

    // ── Kitchen banner ────────────────────────────────────────────────────
    doc.alignLeft().drawLine('─');
    doc.alignCenter();
    doc.boldOn();
    if (kitchenNumber !== null) {
      doc.println(`KITCHEN ${kitchenNumber}`);
    } else {
      doc.println('KITCHEN (UNASSIGNED)');
    }
    // Show slip counter if more than one kitchen
    if (totalKitchens > 1) {
      doc.println(`Slip ${kitchenIndex} of ${totalKitchens}`);
    }
    doc.boldOff();
    doc.alignLeft().drawLine('─');
    doc.feed();

    // ── Table number (dine-in) ────────────────────────────────────────────
    if (order.order_type !== 'delivery' && order.table_number) {
      doc.alignCenter().boldOn().println(`TABLE ${order.table_number}`).boldOff();
      doc.feed();
    }

    // ── Customer details ──────────────────────────────────────────────────
    doc.alignLeft();
    if (order.customer_name) {
      doc.leftRight('Customer:', order.customer_name);
    }
    if (order.customer_phone) {
      doc.leftRight('Phone:', order.customer_phone);
    }
    if (order.customer_name || order.customer_phone) {
      doc.feed();
    }

    // ── Items table header (48 chars: 21 + 7 + 10 + 10) ──────────────────
    doc.alignLeft();
    doc.boldOn();
    doc.println(
      col('Item Name', 21) +
      col('Qty',        7, 'right') +
      col('Price',     10, 'right') +
      col('Total',     10, 'right')
    );
    doc.boldOff();
    doc.drawLine('─');

    // ── Line items (only this kitchen's items) ────────────────────────────
    let kitchenSubtotal = 0;

    kitchenItems.forEach((item) => {
      const extPrice = item.item_price * item.quantity;
      kitchenSubtotal += extPrice;

      doc.boldOn();
      doc.println(
        col(item.item_name || 'Item', 21) +
        col(String(item.quantity),    7, 'right') +
        col(item.item_price.toFixed(2), 10, 'right') +
        col(extPrice.toFixed(2),      10, 'right')
      );
      doc.boldOff();

      // Overflow for long names
      if ((item.item_name || '').length > 21) {
        doc.boldOn();
        doc.println('  ' + item.item_name.substring(21));
        doc.boldOff();
      }
    });

    doc.feed();

    // ── Kitchen subtotal (only shown if multi-kitchen order) ──────────────
    if (totalKitchens > 1) {
      doc.alignLeft().drawLine('-');
      doc.leftRight(`Kitchen ${kitchenNumber ?? 'Unassigned'} subtotal:`, kitchenSubtotal.toFixed(2));
      doc.feed();
    }

    // ── Full order totals (printed on EVERY slip so each kitchen has context) ──
    doc.alignLeft().drawLine('─');

    const allSubtotal    = items.reduce((sum, i) => sum + (i.item_price * i.quantity), 0);
    const serviceCharge  = allSubtotal * 0.02;
    const grandTotal     = allSubtotal + serviceCharge;
    const payLabel       = order.payment_method === 'cash' ? 'Cash' : 'Online';

    doc.leftRight('Order Subtotal:', allSubtotal.toFixed(2));
    doc.leftRight('Service Charges (2%):', serviceCharge.toFixed(2));
    doc.boldOn();
    doc.leftRight(`${payLabel} (Total):`, grandTotal.toFixed(2));
    doc.boldOff();

    doc.feed();
    doc.alignLeft().drawLine('─');

    // ── Footer ────────────────────────────────────────────────────────────
    doc.alignCenter().feed();
    doc.println('Thanks for dining with us!');
    doc.feed();

    if (order.order_type === 'delivery') {
      doc.boldOn().println('DELIVERY ORDER').boldOff();
    }

    doc.feed(3);

    // ── Cut + optional cash drawer (only on first slip) ───────────────────
    doc.cutPartial();

    if (openDrawer) {
      doc.cashDrawer();
    }

    await sendToPrinter(doc.toBuffer(), getKitchenPrinterName(kitchenNumber));
    return true;

  } catch (error) {
    console.error(chalk.red(`❌ Print error (kitchen ${kitchenNumber ?? 'unassigned'}):`, error.message));
    _printTips(error.message, kitchenNumber);
    return false;
  }
}

/**
 * Main print entry point.
 * Splits items by kitchen_number and sends one slip per kitchen.
 *
 * @param {object}   order  - Order row from DB
 * @param {object[]} items  - All order_items rows for this order
 * @returns {{ success: boolean, kitchens: number[] }}
 */
async function printOrder(order, items) {
  const kitchens     = getUniqueKitchens(items);
  const totalKitchens = kitchens.length;

  console.log(chalk.blue(`   Kitchens in this order: [${kitchens.map(k => k ?? 'unassigned').join(', ')}]`));
  console.log(chalk.blue(`   Printing ${totalKitchens} slip(s)...`));

  let allSuccess = true;

  for (let i = 0; i < kitchens.length; i++) {
    const kitchenNumber = kitchens[i];
    const kitchenIndex  = i + 1;

    // Open cash drawer only on the first slip, and only if configured + cash payment
    const openDrawer = (
      process.env.OPEN_CASH_DRAWER === 'true' &&
      order.payment_method === 'cash' &&
      kitchenIndex === 1
    );

    console.log(chalk.gray(`   → Slip ${kitchenIndex}/${totalKitchens}: Kitchen ${kitchenNumber ?? 'unassigned'}`));

    const success = await printKitchenSlip(
      order,
      items,
      kitchenNumber,
      kitchenIndex,
      totalKitchens,
      openDrawer
    );

    if (success) {
      console.log(chalk.green(`     ✓ Kitchen ${kitchenNumber ?? 'unassigned'} slip sent`));
    } else {
      console.error(chalk.red(`     ✗ Kitchen ${kitchenNumber ?? 'unassigned'} slip failed`));
      allSuccess = false;
    }

    // Small gap between slips so printer doesn't choke
    if (i < kitchens.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return { success: allSuccess, kitchens };
}

/**
 * Print a connection test receipt to a specific printer.
 * If no printerName is given, uses the default printer.
 */
async function testPrinter(printerName) {
  const name = printerName || getDefaultPrinterName();
  try {
    const doc = new EscPos();
    doc.init();

    doc.alignLeft().normalSize();
    doc.println(formatDateTime(new Date().toISOString()));
    doc.println('Store: 1');
    doc.feed();

    doc.alignCenter();
    doc.boldOn().println('*** PRINTER TEST ***').boldOff();
    doc.feed();

    doc.boldOn().println('ASTHA HJB Canteen').boldOff();
    doc.println('HJB Hall, IIT Kharagpur');
    doc.println('West Bengal');
    doc.println('+91-9333190224');
    doc.feed();

    doc.alignLeft().drawLine('─');
    doc.feed();

    doc.println(`Printer Name : ${name}`);
    doc.println(`Connection   : SUCCESS`);
    doc.feed();

    doc.alignLeft().drawLine('─');
    doc.alignCenter();
    doc.boldOn().println('CONNECTION SUCCESS!').boldOff();
    doc.println('80mm Thermal  |  ESC/POS  |  RAW mode');
    doc.feed(3);
    doc.cutPartial();

    await sendToPrinter(doc.toBuffer(), name);
    return true;

  } catch (error) {
    console.error(chalk.red(`Printer test failed [${name}]:`), error.message);
    _printTips(error.message);
    return false;
  }
}

/**
 * Test every unique printer configured (all KITCHEN_N_PRINTER + default).
 * Returns true only if ALL printers pass.
 */
async function testAllPrinters() {
  const map    = getKitchenPrinterMap();
  // Deduplicate by printer name — no point sending two test pages to the same device
  const unique = new Map();
  for (const [kitchen, name] of map) {
    if (!unique.has(name)) unique.set(name, kitchen);
  }

  let allOk = true;
  for (const [name] of unique) {
    console.log(chalk.blue(`   Testing printer: "${name}"...`));
    const ok = await testPrinter(name);
    if (ok) {
      console.log(chalk.green(`   ✓ "${name}" OK`));
    } else {
      console.log(chalk.red(`   ✗ "${name}" FAILED — check PRINTER_NAME / KITCHEN_N_PRINTER in .env`));
      allOk = false;
    }
    // Small gap between test pages
    if (unique.size > 1) await new Promise(r => setTimeout(r, 600));
  }
  return allOk;
}

/**
 * List available Windows printers
 */
function listWindowsPrinters() {
  if (process.platform !== 'win32') {
    console.log(chalk.yellow('   (Windows printer listing only available on Windows)'));
    return;
  }
  try {
    const printers = nodePrinter.getPrinters();
    if (!printers || printers.length === 0) {
      console.log(chalk.yellow('   No printers found'));
    } else {
      printers.forEach((p, i) => {
        const mark = p.isDefault ? chalk.green(' ★ default') : '';
        console.log(chalk.white(`   ${i + 1}. ${p.name}${mark}`));
      });
    }
  } catch {
    try {
      const { execSync } = require('child_process');
      const output = execSync('wmic printer get name', { encoding: 'utf-8' });
      output.split('\n')
        .map(l => l.trim())
        .filter(l => l && l !== 'Name')
        .forEach((name, i) => console.log(chalk.white(`   ${i + 1}. ${name}`)));
    } catch (e) {
      console.error(chalk.red('   Error listing printers:'), e.message);
    }
  }
}

/**
 * Print a sample order (for testing kitchen-split logic)
 */
async function printSampleOrder() {
  const sampleOrder = {
    order_number:   101,
    table_number:   5,
    order_type:     'dine_in',
    status:         'placed',
    payment_method: 'cash',
    payment_status: 'paid',
    total_amount:   450.00,
    created_at:     new Date().toISOString()
  };

  // Items spread across 3 kitchens + one unassigned
  const sampleItems = [
    { item_name: 'Veg Biryani',          quantity: 2, item_price: 120.00, kitchen_number: 1 },
    { item_name: 'Paneer Butter Masala', quantity: 1, item_price: 150.00, kitchen_number: 1 },
    { item_name: 'Roti',                 quantity: 3, item_price:  15.00, kitchen_number: 2 },
    { item_name: 'Garlic Naan',          quantity: 2, item_price:  25.00, kitchen_number: 2 },
    { item_name: 'Cold Coffee',          quantity: 1, item_price:  60.00, kitchen_number: 3 },
    { item_name: 'Water Bottle',         quantity: 2, item_price:  20.00, kitchen_number: null },
  ];

  console.log(chalk.cyan('\n📄 Printing sample order (multi-kitchen)...\n'));
  const result = await printOrder(sampleOrder, sampleItems);

  if (result.success) {
    console.log(chalk.green(`\n✅ Sample order printed (${result.kitchens.length} kitchen slips)`));
  } else {
    console.log(chalk.red('\n❌ One or more kitchen slips failed'));
  }

  return result.success;
}

// ─── Internal ─────────────────────────────────────────────────────────────────
function _printTips(message = '', kitchenNumber = null) {
  if (message.toLowerCase().includes('printer') || message.toLowerCase().includes('cannot')) {
    const envKey = kitchenNumber != null ? `KITCHEN_${kitchenNumber}_PRINTER` : 'DEFAULT_PRINTER';
    const currentName = kitchenNumber != null ? getKitchenPrinterName(kitchenNumber) : getDefaultPrinterName();
    console.error(chalk.yellow('\n💡 Windows Printer Tip:'));
    console.error(chalk.yellow('   - Open "Devices & Printers" and copy the exact printer name'));
    console.error(chalk.yellow(`   - Set in .env: ${envKey}=<exact name>`));
    console.error(chalk.yellow(`   - Current value: "${currentName}"`))
    console.error(chalk.yellow('   - Run: npm run test-print to list available printers'));
  } else if (message.includes('ECONNREFUSED') || message.includes('ETIMEDOUT')) {
    console.error(chalk.yellow('\n💡 Network Tip:'));
    console.error(chalk.yellow('   - Check IP/port in .env'));
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  printOrder,
  testPrinter,
  testAllPrinters,
  listWindowsPrinters,
  printSampleOrder,
  getUniqueKitchens,
  getKitchenPrinterName,
  getKitchenPrinterMap,
};
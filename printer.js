/**
 * Thermal Printer Module
 * Handles printing to POS thermal printers using ESC/POS commands
 */

const { ThermalPrinter, PrinterTypes } = require('node-thermal-printer');
const dotenv = require('dotenv');
const chalk = require('chalk');

dotenv.config();

/**
 * Get printer configuration based on type
 */
function getPrinterConfig() {
  const type = process.env.PRINTER_TYPE || 'usb';
  
  const config = {
    type: PrinterTypes.EPSON,
    interface: type,
    characterSet: 'SLOVENIA',
    removeSpecialCharacters: false,
    lineCharacter: '─',
    options: {}
  };

  switch (type) {
    case 'usb':
      config.options = {
        vendorId: process.env.PRINTER_VENDOR_ID || undefined,
        productId: process.env.PRINTER_PRODUCT_ID || undefined
      };
      break;

    case 'network':
      config.interface = 'tcp';
      config.options = {
        host: process.env.PRINTER_IP,
        port: parseInt(process.env.PRINTER_PORT) || 9100
      };
      break;

    case 'windows':
      config.interface = 'printer';
      config.options = {
        printerName: process.env.PRINTER_NAME || 'POS-80'
      };
      break;

    default:
      throw new Error(`Unknown printer type: ${type}`);
  }

  return config;
}

/**
 * Create printer instance
 */
function createPrinterInstance() {
  try {
    const config = getPrinterConfig();
    const printer = new ThermalPrinter(config);
    return printer;
  } catch (error) {
    console.error(chalk.red('Error creating printer instance:'), error.message);
    return null;
  }
}

/**
 * Format date/time for print (DD-MM-YYYY HH:MM AM/PM)
 */
function formatDateTime(dateString) {
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  
  return `${day}-${month}-${year} ${String(displayHours).padStart(2, '0')}:${minutes} ${ampm}`;
}

/**
 * Format text to fit column width (truncate or pad)
 */
function formatColumn(text, width, align = 'left') {
  const str = String(text || '').substring(0, width);
  if (align === 'right') {
    return str.padStart(width, ' ');
  } else if (align === 'center') {
    const padding = Math.floor((width - str.length) / 2);
    return ' '.repeat(padding) + str + ' '.repeat(width - padding - str.length);
  }
  return str.padEnd(width, ' ');
}

/**
 * Create a two-column row for 48 character line (80mm printer)
 */
function createTwoColumnLine(left, right, totalWidth = 48) {
  const leftStr = String(left);
  const rightStr = String(right);
  const spaces = totalWidth - leftStr.length - rightStr.length;
  return leftStr + ' '.repeat(Math.max(0, spaces)) + rightStr;
}

/**
 * Print order to thermal printer (80mm format - 48 chars width)
 */
async function printOrder(order, items, copyNumber = 1, totalCopies = 1) {
  const printer = createPrinterInstance();
  
  if (!printer) {
    console.error(chalk.red('❌ Failed to create printer instance'));
    return false;
  }

  try {
    printer.clear();

    // Initialize printer
    printer.alignLeft();
    printer.setTextNormal();

    // TOP HEADER: Date and Sales Receipt on same line
    const dateTimeStr = formatDateTime(order.created_at);
    printer.leftRight(dateTimeStr, `Sales Receipt #${order.order_number}`);
    printer.println(`Store: 1`);
    printer.newLine();

    // BRAND SECTION (Centered & Bold)
    printer.alignCenter();
    
    // REPRINTED indicator (if this is a reprint/copy > 1)
    if (copyNumber > 1 || totalCopies > 1) {
      printer.bold(true);
      printer.println('REPRINTED');
      printer.bold(false);
    }
    
    // Store Name (Bold - matching web print)
    printer.bold(true);
    printer.println('ASTHA HJB Canteen');
    printer.bold(false);
    
    // Address
    printer.println('HJB Hall, IIT Kharagpur');
    printer.println('West Bengal');
    printer.println('+91-9333190224');
    printer.newLine();

    // Divider
    printer.drawLine();
    printer.newLine();

    // TABLE INFO (if dine-in)
    if (order.order_type !== 'delivery' && order.table_number) {
      printer.alignCenter();
      printer.bold(true);
      printer.println(`TABLE ${order.table_number}`);
      printer.bold(false);
      printer.newLine();
    }

    // ITEMS TABLE HEADER (48 char layout for 80mm: 21 + 7 + 10 + 10 = 48)
    // Matches web print: 45% 15% 20% 20%
    printer.alignLeft();
    const headerLine = formatColumn('Item Name', 21) + 
                       formatColumn('Qty', 7, 'right') + 
                       formatColumn('Price', 10, 'right') + 
                       formatColumn('Ext Price', 10, 'right');
    printer.println(headerLine);
    printer.drawLine();

    // ITEMS
    let subtotal = 0;
    items.forEach((item) => {
      const itemName = formatColumn(item.item_name || 'Item', 21);
      const qty = formatColumn(String(item.quantity), 7, 'right');
      const priceFormatted = item.item_price.toFixed(2).replace(/\.?0+$/, '');
      const price = formatColumn(priceFormatted, 10, 'right');
      const extPriceFormatted = (item.item_price * item.quantity).toFixed(2).replace(/\.?0+$/, '');
      const extPrice = formatColumn(extPriceFormatted, 10, 'right');
      
      const itemLine = `${itemName}${qty}${price}${extPrice}`;
      printer.println(itemLine);
      
      subtotal += (item.item_price * item.quantity);
    });

    printer.newLine();

    // TOTALS SECTION
    printer.alignLeft();
    const serviceCharges = subtotal * 0.02;
    const total = subtotal + serviceCharges;
    
    printer.println(createTwoColumnLine('Subtotal:', subtotal.toFixed(2)));
    printer.println(createTwoColumnLine('Service Charges 2%:', serviceCharges.toFixed(2)));
    
    // Payment method
    const paymentMethod = order.payment_method === 'cash' ? 'Cash' : 'Online';
    printer.println(createTwoColumnLine(`${paymentMethod}:`, total.toFixed(2)));
    
    printer.newLine();
    printer.drawLine();

    // FOOTER
    printer.alignCenter();
    printer.newLine();
    printer.println('Thanks for dining with us!');
    printer.newLine();

    // Order Type indicator at bottom
    printer.alignCenter();
    printer.setTextSize(0, 0);
    if (order.order_type === 'delivery') {
      printer.println('DELIVERY ORDER');
    }
    printer.newLine();

    // Add spacing before cut
    printer.newLine();
    printer.newLine();

    // Cut paper (partial cut)
    printer.cut();

    // Open cash drawer if enabled and payment is cash
    if (process.env.OPEN_CASH_DRAWER === 'true' && 
        order.payment_method === 'cash' && 
        copyNumber === 1) {
      printer.openCashDrawer();
    }

    // Execute print
    await printer.execute();
    
    return true;

  } catch (error) {
    console.error(chalk.red('❌ Print error:'), error.message);
    
    // Try to provide helpful error messages
    if (error.message.includes('LIBUSB')) {
      console.error(chalk.yellow('\n💡 USB Printer Tip:'));
      console.error(chalk.yellow('   - Make sure printer is connected via USB'));
      console.error(chalk.yellow('   - Check if printer is powered on'));
      console.error(chalk.yellow('   - Try running as Administrator'));
    } else if (error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT')) {
      console.error(chalk.yellow('\n💡 Network Printer Tip:'));
      console.error(chalk.yellow('   - Check IP address in .env file'));
      console.error(chalk.yellow('   - Ensure printer is on the same network'));
      console.error(chalk.yellow('   - Verify port number (usually 9100)'));
    } else if (error.message.includes('printer')) {
      console.error(chalk.yellow('\n💡 Windows Printer Tip:'));
      console.error(chalk.yellow('   - Check printer name matches exactly'));
      console.error(chalk.yellow('   - Run: npm run test-print to see available printers'));
    }
    
    return false;
  }
}

/**
 * Test printer connection
 */
async function testPrinter() {
  const printer = createPrinterInstance();
  
  if (!printer) {
    return false;
  }

  try {
    printer.clear();
    
    // Test receipt format
    printer.alignLeft();
    const dateTimeStr = formatDateTime(new Date().toISOString());
    printer.println(dateTimeStr);
    printer.println('Store: 1');
    printer.newLine();
    
    printer.alignRight();
    printer.bold(true);
    printer.println('PRINTER TEST');
    printer.bold(false);
    printer.newLine();
    
    printer.alignCenter();
    printer.bold(true);
    printer.setTextDoubleHeight();
    printer.println('ASTHA HJB Canteen');
    printer.setTextNormal();
    printer.bold(false);
    printer.println('HJB Hall, IIT Kharagpur');
    printer.println('West Bengal');
    printer.println('+91-9333190224');
    printer.newLine();
    
    printer.drawLine();
    printer.newLine();
    
    printer.alignLeft();
    printer.println(`Printer Type: ${process.env.PRINTER_TYPE}`);
    printer.println(`Connection: SUCCESS`);
    printer.newLine();
    
    printer.drawLine();
    printer.alignCenter();
    printer.bold(true);
    printer.println('CONNECTION SUCCESS!');
    printer.bold(false);
    printer.newLine();
    printer.println('58mm Thermal Printer');
    printer.println('ESC/POS Format');
    
    printer.newLine();
    printer.newLine();
    printer.cut();

    await printer.execute();
    return true;

  } catch (error) {
    console.error(chalk.red('Printer test failed:'), error.message);
    return false;
  }
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
    const { execSync } = require('child_process');
    const output = execSync('wmic printer get name', { encoding: 'utf-8' });
    const printers = output
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && line !== 'Name');
    
    if (printers.length === 0) {
      console.log(chalk.yellow('   No printers found'));
    } else {
      printers.forEach((printer, index) => {
        console.log(chalk.white(`   ${index + 1}. ${printer}`));
      });
    }
  } catch (error) {
    console.error(chalk.red('   Error listing printers:'), error.message);
  }
}

/**
 * Print a sample order (for testing)
 */
async function printSampleOrder() {
  const sampleOrder = {
    order_number: 101,
    table_number: 5,
    order_type: 'dine_in',
    status: 'placed',
    payment_status: 'paid',
    total_amount: 450.00,
    created_at: new Date().toISOString()
  };

  const sampleItems = [
    { item_name: 'Veg Biryani', quantity: 2, item_price: 120.00 },
    { item_name: 'Paneer Butter Masala', quantity: 1, item_price: 150.00 },
    { item_name: 'Roti', quantity: 3, item_price: 15.00 },
    { item_name: 'Cold Coffee', quantity: 1, item_price: 60.00 }
  ];

  console.log(chalk.cyan('\n📄 Printing sample order...\n'));
  const success = await printOrder(sampleOrder, sampleItems);
  
  if (success) {
    console.log(chalk.green('\n✅ Sample order printed successfully!'));
  } else {
    console.log(chalk.red('\n❌ Failed to print sample order'));
  }
  
  return success;
}

module.exports = {
  printOrder,
  testPrinter,
  listWindowsPrinters,
  printSampleOrder,
  createPrinterInstance
};

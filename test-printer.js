#!/usr/bin/env node

/**
 * Test script for thermal printer
 * Use this to verify printer connection and settings
 */

const dotenv = require('dotenv');
const chalk = require('chalk');
const { testPrinter, printSampleOrder, listWindowsPrinters } = require('./printer');

dotenv.config();

console.log(chalk.cyan.bold('\n╔═══════════════════════════════════════════════════╗'));
console.log(chalk.cyan.bold('║        Astha Thermal Printer Test Tool           ║'));
console.log(chalk.cyan.bold('╚═══════════════════════════════════════════════════╝\n'));

console.log(chalk.white('Current Configuration:'));
console.log(chalk.blue('  Printer Type:'), chalk.white(process.env.PRINTER_TYPE || 'Not set'));

if (process.env.PRINTER_TYPE === 'usb') {
  console.log(chalk.blue('  Vendor ID:'), chalk.white(process.env.PRINTER_VENDOR_ID || 'Auto-detect'));
  console.log(chalk.blue('  Product ID:'), chalk.white(process.env.PRINTER_PRODUCT_ID || 'Auto-detect'));
} else if (process.env.PRINTER_TYPE === 'network') {
  console.log(chalk.blue('  IP Address:'), chalk.white(process.env.PRINTER_IP));
  console.log(chalk.blue('  Port:'), chalk.white(process.env.PRINTER_PORT));
} else if (process.env.PRINTER_TYPE === 'windows') {
  console.log(chalk.blue('  Printer Name:'), chalk.white(process.env.PRINTER_NAME));
  console.log();
  console.log(chalk.cyan('Available Windows Printers:'));
  listWindowsPrinters();
}

console.log();
console.log(chalk.gray('─'.repeat(50)));

async function runTests() {
  // Test 1: Basic connection test
  console.log(chalk.cyan('\n🧪 Test 1: Basic Printer Connection'));
  console.log(chalk.gray('Testing if printer responds...\n'));
  
  const testResult = await testPrinter();
  
  if (!testResult) {
    console.log(chalk.red('\n❌ Basic connection test failed!'));
    console.log(chalk.yellow('\nTroubleshooting Tips:'));
    console.log(chalk.white('  1. Check if printer is powered on'));
    console.log(chalk.white('  2. Verify USB/Network cable is connected'));
    console.log(chalk.white('  3. Check printer name/IP in .env file'));
    console.log(chalk.white('  4. Try running as Administrator (Windows)'));
    console.log(chalk.white('  5. Install printer drivers if needed'));
    process.exit(1);
  }

  console.log(chalk.green('\n✅ Basic connection test passed!'));

  // Test 2: Sample order print
  console.log(chalk.cyan('\n🧪 Test 2: Sample Order Print'));
  console.log(chalk.gray('Printing a sample order with items...\n'));
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const sampleResult = await printSampleOrder();
  
  if (!sampleResult) {
    console.log(chalk.red('\n❌ Sample order print failed!'));
    process.exit(1);
  }

  console.log(chalk.green('\n✅ Sample order print successful!'));

  // All tests passed
  console.log(chalk.green.bold('\n╔═══════════════════════════════════════════════════╗'));
  console.log(chalk.green.bold('║          ALL TESTS PASSED! 🎉                     ║'));
  console.log(chalk.green.bold('╚═══════════════════════════════════════════════════╝'));
  console.log(chalk.white('\nYour printer is ready for automatic order printing!'));
  console.log(chalk.cyan('\nNext steps:'));
  console.log(chalk.white('  1. Run: npm start'));
  console.log(chalk.white('  2. Place a test order from your app'));
  console.log(chalk.white('  3. Watch it print automatically! ✨\n'));
}

// Run tests
runTests().catch(error => {
  console.error(chalk.red('\n❌ Test failed with error:'), error.message);
  console.error(error);
  process.exit(1);
});

#!/usr/bin/env node

/**
 * Astha HJB Canteen - Automatic Thermal Printer Server
 * 
 * This application listens to Supabase Realtime for new orders
 * and automatically prints them to a connected thermal printer.
 * 
 * Features:
 * - Real-time order detection via Supabase
 * - Automatic thermal printing (80mm)
 * - Support for USB, Network, and Windows printers
 * - Sound notifications
 * - Multiple copies support
 * - Error recovery and retry logic
 */

const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const chalk = require('chalk');
const notifier = require('node-notifier');
const { printOrder, testPrinter, listWindowsPrinters } = require('./printer');

// Load environment variables
dotenv.config();

// Configuration
const config = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_ANON_KEY,
  autoPrintEnabled: process.env.AUTO_PRINT_ENABLED === 'true',
  printOnStatus: process.env.PRINT_ON_STATUS || 'placed',
  printCopies: parseInt(process.env.PRINT_COPIES) || 1,
  playSound: process.env.PLAY_SOUND === 'true',
};

// Validate configuration
if (!config.supabaseUrl || !config.supabaseKey) {
  console.error(chalk.red('❌ Error: Missing Supabase configuration'));
  console.error(chalk.yellow('Please set SUPABASE_URL and SUPABASE_ANON_KEY in .env file'));
  process.exit(1);
}

// Initialize Supabase client with Realtime configuration
const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
  auth: { persistSession: false },
  realtime: {
    params: {
      eventsPerSecond: 10
    },
    timeout: 30000  // 30 seconds timeout
  }
});

// Track printed orders to avoid duplicates
const printedOrders = new Set();

// Print banner
console.log(chalk.cyan.bold('\n╔═══════════════════════════════════════════════════╗'));
console.log(chalk.cyan.bold('║   ASTHA HJB CANTEEN - Auto Print Server v1.0     ║'));
console.log(chalk.cyan.bold('╚═══════════════════════════════════════════════════╝\n'));

console.log(chalk.blue('🖨️  Printer Type:'), chalk.white(process.env.PRINTER_TYPE));
console.log(chalk.blue('📡 Supabase URL:'), chalk.white(config.supabaseUrl));
console.log(chalk.blue('🔊 Sound Alerts:'), config.playSound ? chalk.green('✓ Enabled') : chalk.red('✗ Disabled'));
console.log(chalk.blue('📋 Print Copies:'), chalk.white(config.printCopies));
console.log(chalk.blue('🎯 Auto-Print:'), config.autoPrintEnabled ? chalk.green('✓ Enabled') : chalk.red('✗ Disabled'));
console.log();

/**
 * Fetch order details with items
 */
async function fetchOrderDetails(orderId) {
  try {
    // Fetch order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError) throw orderError;
    if (!order) return null;

    // Fetch order items
    const { data: items, error: itemsError } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId);

    if (itemsError) throw itemsError;

    return {
      order,
      items: items || []
    };
  } catch (error) {
    console.error(chalk.red('❌ Error fetching order details:'), error.message);
    return null;
  }
}

/**
 * Handle new order and print
 */
async function handleNewOrder(payload) {
  try {
    const orderId = payload.new?.id;
    const orderStatus = payload.new?.status;
    const orderNumber = payload.new?.order_number;

    // Only print on specified status
    if (orderStatus !== config.printOnStatus) {
      return;
    }

    // Avoid duplicate prints
    if (printedOrders.has(orderId)) {
      console.log(chalk.yellow(`⚠️  Order #${orderNumber} already printed, skipping...`));
      return;
    }

    console.log(chalk.cyan(`\n📨 New Order Received: #${orderNumber}`));
    console.log(chalk.gray(`Order ID: ${orderId}`));
    console.log(chalk.gray(`Status: ${orderStatus}`));

    // Play notification sound
    if (config.playSound) {
      notifier.notify({
        title: '🔔 New Order',
        message: `Order #${orderNumber} received!`,
        sound: true,
        wait: false
      });
    }

    // Fetch complete order details
    console.log(chalk.blue('📥 Fetching order details...'));
    const orderData = await fetchOrderDetails(orderId);

    if (!orderData) {
      console.error(chalk.red('❌ Failed to fetch order details'));
      return;
    }

    // Auto-print if enabled
    if (config.autoPrintEnabled) {
      console.log(chalk.green(`🖨️  Printing order #${orderNumber}...`));
      
      // Print multiple copies if configured
      for (let copy = 1; copy <= config.printCopies; copy++) {
        if (config.printCopies > 1) {
          console.log(chalk.gray(`   Copy ${copy}/${config.printCopies}`));
        }
        
        const success = await printOrder(orderData.order, orderData.items, copy, config.printCopies);
        
        if (success) {
          console.log(chalk.green(`✓ Print successful (Copy ${copy}/${config.printCopies})`));
        } else {
          console.error(chalk.red(`✗ Print failed (Copy ${copy}/${config.printCopies})`));
        }

        // Small delay between copies
        if (copy < config.printCopies) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // Mark as printed
      printedOrders.add(orderId);
      console.log(chalk.green(`✅ Order #${orderNumber} printed successfully!\n`));
      
      // Clean up old printed orders (keep last 100)
      if (printedOrders.size > 100) {
        const oldest = Array.from(printedOrders)[0];
        printedOrders.delete(oldest);
      }
    } else {
      console.log(chalk.yellow('⚠️  Auto-print is disabled. Enable in .env file.'));
    }

  } catch (error) {
    console.error(chalk.red('❌ Error handling order:'), error.message);
    console.error(error);
  }
}

/**
 * Initialize printer and test
 */
async function initializePrinter() {
  console.log(chalk.blue('🔧 Initializing printer...\n'));

  // List available Windows printers if using Windows driver
  if (process.env.PRINTER_TYPE === 'windows') {
    console.log(chalk.cyan('📋 Available Windows Printers:'));
    listWindowsPrinters();
    console.log();
  }

  // Test printer connection
  console.log(chalk.blue('🧪 Testing printer connection...\n'));
  const testResult = await testPrinter();

  if (testResult) {
    console.log(chalk.green.bold('✅ Printer test successful!\n'));
    console.log(chalk.gray('─'.repeat(50)));
    return true;
  } else {
    console.log(chalk.red.bold('❌ Printer test failed!'));
    console.log(chalk.yellow('\n⚠️  Warning: Printer not responding, but server will continue.'));
    console.log(chalk.yellow('   Please check printer connection and settings in .env file.\n'));
    console.log(chalk.gray('─'.repeat(50)));
    return false;
  }
}

/**
 * Test Supabase connection
 */
async function testSupabaseConnection() {
  console.log(chalk.blue('🔍 Testing Supabase connection...'));
  
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('count')
      .limit(1);
    
    if (error) {
      console.error(chalk.red('❌ Supabase connection test failed:'), error.message);
      console.error(chalk.yellow('\n💡 Please check:'));
      console.error(chalk.yellow('   1. SUPABASE_URL is correct in .env'));
      console.error(chalk.yellow('   2. SUPABASE_ANON_KEY is correct in .env'));
      console.error(chalk.yellow('   3. "orders" table exists in your database'));
      console.error(chalk.yellow('   4. Your internet connection is working\n'));
      return false;
    }
    
    console.log(chalk.green('✅ Supabase connection successful!'));
    return true;
  } catch (error) {
    console.error(chalk.red('❌ Connection error:'), error.message);
    return false;
  }
}

/**
 * Poll for new orders (fallback when Realtime doesn't work)
 */
async function startPollingListener() {
  console.log(chalk.blue('\n📡 Starting polling listener (Realtime fallback)...'));
  console.log(chalk.yellow('⚠️  Using HTTP polling instead of WebSocket'));
  console.log(chalk.gray('   Checking for new orders every 3 seconds...\n'));
  
  let lastCheck = new Date().toISOString();
  
  async function pollOrders() {
    try {
      // Fetch orders created since last check
      const { data: orders, error } = await supabase
        .from('orders')
        .select('*')
        .gte('created_at', lastCheck)
        .eq('status', config.printOnStatus)
        .order('created_at', { ascending: true });
      
      if (error) {
        console.error(chalk.red('Poll error:'), error.message);
        return;
      }
      
      // Process new orders
      if (orders && orders.length > 0) {
        for (const order of orders) {
          if (!printedOrders.has(order.id)) {
            await handleNewOrder({ new: order });
          }
        }
      }
      
      // Update last check time
      lastCheck = new Date().toISOString();
      
    } catch (error) {
      console.error(chalk.red('Polling error:'), error.message);
    }
  }
  
  // Initial poll
  await pollOrders();
  
  // Poll every 3 seconds
  const interval = setInterval(pollOrders, 3000);
  
  console.log(chalk.green.bold('✅ Polling started!'));
  console.log(chalk.green('🎧 Checking for new orders every 3 seconds...\n'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(chalk.white.bold('\n🟢 SERVER RUNNING - Press Ctrl+C to stop\n'));
  console.log(chalk.gray('Waiting for new orders to print automatically...\n'));
  
  return interval;
}

/**
 * Subscribe to order changes
 */
async function startRealtimeListener() {
  console.log(chalk.gray('   Connecting to Supabase Realtime WebSocket...'));

  return new Promise((resolve, reject) => {
    const channel = supabase
      .channel('orders-channel')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders'
        },
        (payload) => {
          handleNewOrder(payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders'
        },
        (payload) => {
          // Handle status updates if needed
          const oldStatus = payload.old?.status;
          const newStatus = payload.new?.status;
          
          if (oldStatus !== newStatus && newStatus === config.printOnStatus) {
            handleNewOrder(payload);
          }
        }
      )
      .subscribe((status, err) => {
        console.log(chalk.gray(`   Status: ${status}`));
        
        if (err) {
          console.error(chalk.red(`   Error: ${err.message || err}`));
        }
        
        if (status === 'SUBSCRIBED') {
          console.log(chalk.green.bold('✅ Connected to Supabase Realtime!'));
          console.log(chalk.green('🎧 Listening for new orders via WebSocket...\n'));
          console.log(chalk.gray('─'.repeat(50)));
          console.log(chalk.white.bold('\n🟢 SERVER RUNNING - Press Ctrl+C to stop\n'));
          console.log(chalk.gray('Waiting for new orders to print automatically...\n'));
          resolve(channel);
        } else if (status === 'CHANNEL_ERROR') {
          reject(new Error('Realtime channel error'));
        } else if (status === 'TIMED_OUT') {
          reject(new Error('Realtime connection timed out'));
        } else if (status === 'CLOSED') {
          console.warn(chalk.yellow('⚠️  Connection closed'));
        }
      });
  });
}

/**
 * Main function
 */
async function main() {
  try {
    // Test Supabase connection first
    const connectionOk = await testSupabaseConnection();
    if (!connectionOk) {
      console.error(chalk.red('\n❌ Cannot proceed without Supabase connection'));
      process.exit(1);
    }
    
    console.log(chalk.gray('─'.repeat(50)));

    // Initialize printer
    await initializePrinter();

    // Try Realtime first, fallback to polling if it fails
    let listener;
    let isPolling = false;
    
    try {
      console.log(chalk.blue('\n🔄 Attempting Realtime connection...'));
      
      // Set a timeout for Realtime connection
      const realtimePromise = startRealtimeListener();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Realtime timeout')), 10000)
      );
      
      listener = await Promise.race([realtimePromise, timeoutPromise]);
      
    } catch (error) {
      console.log(chalk.yellow('\n⚠️  Realtime connection failed, switching to polling mode...'));
      console.log(chalk.gray('   This is a fallback method that works without WebSocket\n'));
      
      listener = await startPollingListener();
      isPolling = true;
    }

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log(chalk.yellow('\n\n🛑 Shutting down server...'));
      
      if (isPolling) {
        clearInterval(listener);
        console.log(chalk.green('✅ Polling stopped'));
      } else {
        await supabase.removeChannel(listener);
        console.log(chalk.green('✅ Realtime disconnected'));
      }
      
      console.log(chalk.green('✅ Server stopped successfully'));
      process.exit(0);
    });

  } catch (error) {
    console.error(chalk.red('❌ Fatal error:'), error.message);
    console.error(error);
    process.exit(1);
  }
}

// Start the server
main();

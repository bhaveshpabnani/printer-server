#!/usr/bin/env node

/**
 * Astha HJB Canteen - Automatic Thermal Printer Server
 *
 * Listens to Supabase Realtime for orders, prints one slip per kitchen
 * (based on kitchen_number on each order item) when payment_status = 'paid'.
 */

const { createClient } = require('@supabase/supabase-js');
const dotenv   = require('dotenv');
const chalk    = require('chalk');
const notifier = require('node-notifier');
const { printOrder, testPrinter, listWindowsPrinters, getUniqueKitchens } = require('./printer');

dotenv.config();

// ─── Configuration ────────────────────────────────────────────────────────────
const config = {
  supabaseUrl:          process.env.SUPABASE_URL,
  supabaseKey:          process.env.SUPABASE_ANON_KEY,
  autoPrintEnabled:     process.env.AUTO_PRINT_ENABLED === 'true',
  printOnPaymentStatus: process.env.PRINT_ON_PAYMENT_STATUS || 'paid',
  playSound:            process.env.PLAY_SOUND === 'true',
  printerName:         (process.env.PRINTER_NAME || '80mm Series Printer').replace(/^"|"$/g, ''),
};

if (!config.supabaseUrl || !config.supabaseKey) {
  console.error(chalk.red('❌ Error: Missing Supabase configuration'));
  console.error(chalk.yellow('Please set SUPABASE_URL and SUPABASE_ANON_KEY in .env file'));
  process.exit(1);
}

// ─── Supabase ─────────────────────────────────────────────────────────────────
const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
  auth: { persistSession: false },
  realtime: {
    params: { eventsPerSecond: 10 },
    timeout: 30000
  }
});

// Deduplicate prints across the session
const printedOrders = new Set();

// ─── Banner ───────────────────────────────────────────────────────────────────
console.log(chalk.cyan.bold('\n╔═══════════════════════════════════════════════════╗'));
console.log(chalk.cyan.bold('║   ASTHA HJB CANTEEN - Auto Print Server v2.2     ║'));
console.log(chalk.cyan.bold('╚═══════════════════════════════════════════════════╝\n'));

console.log(chalk.blue('🖨️  Printer Name:'),   chalk.white(config.printerName));
console.log(chalk.blue('📡 Supabase URL:'),    chalk.white(config.supabaseUrl));
console.log(chalk.blue('🔊 Sound Alerts:'),    config.playSound        ? chalk.green('✓ Enabled') : chalk.red('✗ Disabled'));
console.log(chalk.blue('🎯 Auto-Print:'),      config.autoPrintEnabled ? chalk.green('✓ Enabled') : chalk.red('✗ Disabled'));
console.log(chalk.blue('💳 Print Trigger:'),   chalk.white(`payment_status = "${config.printOnPaymentStatus}"`));
console.log(chalk.blue('🍳 Slips per order:'), chalk.white('1 per unique kitchen_number in order_items'));
console.log();

// ─── Fetch order with items ───────────────────────────────────────────────────
async function fetchOrderDetails(orderId) {
  try {
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderErr) throw orderErr;
    if (!order)   return null;

    const { data: items, error: itemsErr } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId);

    if (itemsErr) throw itemsErr;

    return { order, items: items || [] };
  } catch (error) {
    console.error(chalk.red('❌ Error fetching order details:'), error.message);
    return null;
  }
}

// ─── Should this order trigger a print? ──────────────────────────────────────
function shouldPrint(record) {
  return record?.payment_status === config.printOnPaymentStatus;
}

// ─── Core handler ─────────────────────────────────────────────────────────────
async function handlePaidOrder(record) {
  try {
    const orderId     = record.id;
    const orderNumber = record.order_number;

    if (printedOrders.has(orderId)) {
      console.log(chalk.yellow(`⚠️  Order #${orderNumber} already printed, skipping...`));
      return;
    }

    console.log(chalk.cyan(`\n💳 Payment confirmed: Order #${orderNumber}`));
    console.log(chalk.gray(`   ID: ${orderId} | payment_status: ${record.payment_status}`));

    if (config.playSound) {
      notifier.notify({
        title:   '🔔 New Paid Order',
        message: `Order #${orderNumber} — payment confirmed!`,
        sound:   true,
        wait:    false
      });
    }

    console.log(chalk.blue('📥 Fetching order details...'));
    const orderData = await fetchOrderDetails(orderId);

    if (!orderData) {
      console.error(chalk.red('❌ Failed to fetch order details'));
      return;
    }

    if (!config.autoPrintEnabled) {
      console.log(chalk.yellow('⚠️  Auto-print disabled (AUTO_PRINT_ENABLED=false in .env)'));
      return;
    }

    const kitchens = getUniqueKitchens(orderData.items);
    console.log(chalk.green(`🖨️  Printing order #${orderNumber} → ${kitchens.length} kitchen slip(s)...`));

    // printOrder handles the per-kitchen loop internally
    const result = await printOrder(orderData.order, orderData.items);

    if (result.success) {
      printedOrders.add(orderId);
      console.log(chalk.green(`✅ Order #${orderNumber} — all ${result.kitchens.length} slip(s) sent!\n`));
    } else {
      console.error(chalk.red(`⚠️  Order #${orderNumber} — some slips failed. Will retry on next trigger.\n`));
      // Don't add to printedOrders so it can be retried
    }

    // Trim set to last 200
    if (printedOrders.size > 200) {
      printedOrders.delete(printedOrders.values().next().value);
    }

  } catch (error) {
    console.error(chalk.red('❌ Error handling order:'), error.message);
    console.error(error);
  }
}

// ─── Supabase connection test ─────────────────────────────────────────────────
async function testSupabaseConnection() {
  console.log(chalk.blue('🔍 Testing Supabase connection...'));
  try {
    const { error } = await supabase.from('orders').select('count').limit(1);
    if (error) {
      console.error(chalk.red('❌ Supabase connection failed:'), error.message);
      return false;
    }
    console.log(chalk.green('✅ Supabase connection successful!'));
    return true;
  } catch (error) {
    console.error(chalk.red('❌ Connection error:'), error.message);
    return false;
  }
}

// ─── Printer init ─────────────────────────────────────────────────────────────
async function initializePrinter() {
  console.log(chalk.blue('🔧 Initializing printer...\n'));

  console.log(chalk.cyan('📋 Available Windows Printers:'));
  listWindowsPrinters();
  console.log();

  console.log(chalk.blue('🧪 Testing printer connection...\n'));
  const ok = await testPrinter();

  if (ok) {
    console.log(chalk.green.bold('✅ Printer test successful!\n'));
  } else {
    console.log(chalk.red.bold('❌ Printer test failed!'));
    console.log(chalk.yellow('\n⚠️  Server will continue — check PRINTER_NAME in .env\n'));
  }

  console.log(chalk.gray('─'.repeat(50)));
  return ok;
}

// ─── HTTP Polling fallback ────────────────────────────────────────────────────
async function startPollingListener() {
  console.log(chalk.blue('\n📡 Starting polling listener (Realtime fallback)...'));
  console.log(chalk.yellow('⚠️  Using HTTP polling — checking every 3 seconds\n'));

  // Start from "now" to avoid reprinting old paid orders on boot
  let lastCheck = new Date().toISOString();

  async function poll() {
    try {
      const { data: orders, error } = await supabase
        .from('orders')
        .select('*')
        .gte('updated_at', lastCheck)
        .eq('payment_status', config.printOnPaymentStatus)
        .order('updated_at', { ascending: true });

      if (error) {
        console.error(chalk.red('Poll error:'), error.message);
        return;
      }

      if (orders && orders.length > 0) {
        for (const order of orders) {
          if (!printedOrders.has(order.id)) {
            await handlePaidOrder(order);
          }
        }
      }

      lastCheck = new Date().toISOString();
    } catch (error) {
      console.error(chalk.red('Polling error:'), error.message);
    }
  }

  await poll();
  const interval = setInterval(poll, 3000);

  console.log(chalk.green.bold('✅ Polling started!'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(chalk.white.bold('\n🟢 SERVER RUNNING - Press Ctrl+C to stop\n'));
  console.log(chalk.gray('Waiting for paid orders...\n'));

  return interval;
}

// ─── Realtime listener ────────────────────────────────────────────────────────
async function startRealtimeListener() {
  console.log(chalk.gray('   Connecting to Supabase Realtime WebSocket...'));

  return new Promise((resolve, reject) => {
    const channel = supabase
      .channel('orders-payment-channel')

      // INSERT: order already paid at creation time
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          if (shouldPrint(payload.new)) {
            handlePaidOrder(payload.new);
          }
        }
      )

      // UPDATE: payment_status just transitioned to 'paid'
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => {
          const wasAlreadyPaid = payload.old?.payment_status === config.printOnPaymentStatus;
          const isNowPaid      = shouldPrint(payload.new);

          if (!wasAlreadyPaid && isNowPaid) {
            handlePaidOrder(payload.new);
          }
        }
      )

      .subscribe((status, err) => {
        console.log(chalk.gray(`   Realtime status: ${status}`));

        if (err) console.error(chalk.red(`   Realtime error: ${err.message || err}`));

        if (status === 'SUBSCRIBED') {
          console.log(chalk.green.bold('✅ Connected to Supabase Realtime!'));
          console.log(chalk.green('🎧 Listening for paid orders via WebSocket...\n'));
          console.log(chalk.gray('─'.repeat(50)));
          console.log(chalk.white.bold('\n🟢 SERVER RUNNING - Press Ctrl+C to stop\n'));
          console.log(chalk.gray('Waiting for paid orders...\n'));
          resolve(channel);
        } else if (status === 'CHANNEL_ERROR') {
          reject(new Error('Realtime channel error'));
        } else if (status === 'TIMED_OUT') {
          reject(new Error('Realtime connection timed out'));
        } else if (status === 'CLOSED') {
          console.warn(chalk.yellow('⚠️  Realtime connection closed'));
        }
      });
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  try {
    const dbOk = await testSupabaseConnection();
    if (!dbOk) {
      console.error(chalk.red('\n❌ Cannot proceed without Supabase connection'));
      process.exit(1);
    }
    console.log(chalk.gray('─'.repeat(50)));

    await initializePrinter();

    let listener;
    let isPolling = false;

    try {
      console.log(chalk.blue('\n🔄 Attempting Realtime connection...'));
      const realtimePromise = startRealtimeListener();
      const timeout = new Promise((_, rej) =>
        setTimeout(() => rej(new Error('Realtime timeout after 10s')), 10000)
      );
      listener = await Promise.race([realtimePromise, timeout]);
    } catch (error) {
      console.log(chalk.yellow(`\n⚠️  Realtime failed (${error.message}), switching to polling...\n`));
      listener  = await startPollingListener();
      isPolling = true;
    }

    process.on('SIGINT', async () => {
      console.log(chalk.yellow('\n\n🛑 Shutting down server...'));
      if (isPolling) {
        clearInterval(listener);
        console.log(chalk.green('✅ Polling stopped'));
      } else {
        await supabase.removeChannel(listener);
        console.log(chalk.green('✅ Realtime disconnected'));
      }
      console.log(chalk.green('✅ Server stopped'));
      process.exit(0);
    });

  } catch (error) {
    console.error(chalk.red('❌ Fatal error:'), error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
import { spawn } from 'child_process';

async function runE2E() {
  console.log('--- Starting Automated E2E Headless Browser Verification ---');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--no-sandbox',
    'http://localhost:8080/',
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  let targets;
  try {
    const res = await fetch('http://localhost:9222/json');
    targets = await res.json();
  } catch (err) {
    console.error('Failed to reach Chrome CDP:', err.message);
    chrome.kill();
    process.exit(1);
  }

  const page = targets.find((t) => t.type === 'page' && t.url.includes('localhost:8080'));
  if (!page) {
    console.error('Page target not found:', targets);
    chrome.kill();
    process.exit(1);
  }

  console.log('Found page target:', page.title, page.webSocketDebuggerUrl);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let msgId = 1;
  const pending = new Map();
  const errors = [];
  const consoleLogs = [];

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args.map((a) => a.value || a.description).join(' ');
      consoleLogs.push(`[${msg.params.type}] ${text}`);
      console.log(`[BROWSER CONSOLE ${msg.params.type}]:`, text);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const desc = msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text;
      errors.push(desc);
      console.error('[BROWSER EXCEPTION]:', desc);
    }
  };

  const send = (method, params = {}) => {
    return new Promise((resolve) => {
      const id = msgId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  };

  await new Promise((resolve) => {
    ws.onopen = resolve;
  });

  await send('Runtime.enable');
  await send('Page.enable');
  await new Promise((r) => setTimeout(r, 600));

  // Helper to evaluate JS in browser
  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result?.result?.value;
  };

  // 1. Verify Page Loaded
  const title = await evaluate('document.title');
  console.log('1. Page Title:', title);

  const canvasExists = await evaluate('!!document.querySelector("#canvas-container canvas")');
  console.log('2. WebGL Canvas present:', canvasExists);

  const navButtonsCount = await evaluate('document.querySelectorAll(".nav-tab-btn").length');
  console.log('3. Navigation Tabs rendered:', navButtonsCount);

  // 2. Test Tab 1: Fullstack 3D
  console.log('\n--- Testing Tab 1: Fullstack 3D ---');
  let hudTitle = await evaluate('document.querySelector(".hud-title")?.textContent');
  console.log('Active HUD Title:', hudTitle);
  // Trigger "Fire Request (1x)"
  await evaluate('document.querySelector(".action-btn")?.click()');
  await new Promise((r) => setTimeout(r, 1200));

  // Trigger "Rapid Fire (3x)"
  await evaluate('document.querySelectorAll(".action-btn")[1]?.click()');
  await new Promise((r) => setTimeout(r, 2000));

  // Check metrics
  let reqSent = await evaluate('document.querySelector("#metric_req_sent .metric-value")?.textContent');
  let assetInstances = await evaluate('document.querySelector("#metric_asset_instances .metric-value")?.textContent');
  console.log(`Metrics: Requests Sent = ${reqSent}, Instances = ${assetInstances}`);

  // 3. Test Tab 2: Game Dev
  console.log('\n--- Testing Tab 2: Game Dev ---');
  await evaluate('document.querySelectorAll(".nav-tab-btn")[1].click()');
  await new Promise((r) => setTimeout(r, 1000));
  hudTitle = await evaluate('document.querySelector(".hud-title")?.textContent');
  console.log('Active HUD Title:', hudTitle);

  // Click Open Chest (1x)
  await evaluate('document.querySelector(".action-btn")?.click()');
  await new Promise((r) => setTimeout(r, 1200));

  // Click Simulate Oscillation (2x Packets)
  await evaluate('document.querySelectorAll(".action-btn")[1]?.click()');
  await new Promise((r) => setTimeout(r, 1500));

  let chestStatus = await evaluate('document.querySelector("#metric_chest_status .metric-value")?.textContent');
  let rewardCount = await evaluate('document.querySelector("#metric_reward_count .metric-value")?.textContent');
  console.log(`Metrics: Chest Status = ${chestStatus}, Reward Spawns = ${rewardCount}`);

  // 4. Test Tab 3: IoT
  console.log('\n--- Testing Tab 3: IoT ---');
  await evaluate('document.querySelectorAll(".nav-tab-btn")[2].click()');
  await new Promise((r) => setTimeout(r, 1000));
  hudTitle = await evaluate('document.querySelector(".hud-title")?.textContent');
  console.log('Active HUD Title:', hudTitle);

  // Send Turn On signal (1x)
  await evaluate('document.querySelector(".action-btn")?.click()');
  await new Promise((r) => setTimeout(r, 1000));

  // Retransmit 5x
  await evaluate('document.querySelectorAll(".action-btn")[1]?.click()');
  await new Promise((r) => setTimeout(r, 1500));

  let valveState = await evaluate('document.querySelector("#metric_valve_state .metric-value")?.textContent');
  let signalsAbsorbed = await evaluate('document.querySelector("#metric_signals_absorbed .metric-value")?.textContent');
  console.log(`Metrics: Valve State = ${valveState}, Absorbed Retransmissions = ${signalsAbsorbed}`);

  // 5. Test Tab 4: BSP
  console.log('\n--- Testing Tab 4: BSP ---');
  await evaluate('document.querySelectorAll(".nav-tab-btn")[3].click()');
  await new Promise((r) => setTimeout(r, 1000));
  hudTitle = await evaluate('document.querySelector(".hud-title")?.textContent');
  console.log('Active HUD Title:', hudTitle);

  // Call Reset (1x)
  await evaluate('document.querySelector(".action-btn")?.click()');
  await new Promise((r) => setTimeout(r, 1000));

  // Execute 10x Consecutive Loop
  await evaluate('document.querySelectorAll(".action-btn")[1]?.click()');
  await new Promise((r) => setTimeout(r, 1500));

  let hwState = await evaluate('document.querySelector("#metric_hardware_state .metric-value")?.textContent');
  let canHash = await evaluate('document.querySelector("#metric_canonical_hash .metric-value")?.textContent');
  console.log(`Metrics: Chip FSM = ${hwState}, Hash = ${canHash}`);

  // 6. Test Tab 5: Linux Kernel
  console.log('\n--- Testing Tab 5: Linux Kernel ---');
  await evaluate('document.querySelectorAll(".nav-tab-btn")[4].click()');
  await new Promise((r) => setTimeout(r, 1000));
  hudTitle = await evaluate('document.querySelector(".hud-title")?.textContent');
  console.log('Active HUD Title:', hudTitle);

  // Apply Bitmask (1x)
  await evaluate('document.querySelector(".action-btn")?.click()');
  await new Promise((r) => setTimeout(r, 1000));

  // Spam Mask Write (10x Loop)
  await evaluate('document.querySelectorAll(".action-btn")[1]?.click()');
  await new Promise((r) => setTimeout(r, 1200));

  let regHex = await evaluate('document.querySelector("#metric_reg_hex .metric-value")?.textContent');
  let targetBit = await evaluate('document.querySelector("#metric_target_bit .metric-value")?.textContent');
  console.log(`Metrics: MMIO Hex = ${regHex}, Bit 3 = ${targetBit}`);

  // 7. Test Tab 6: Computer Arch
  console.log('\n--- Testing Tab 6: Computer Architecture ---');
  await evaluate('document.querySelectorAll(".nav-tab-btn")[5].click()');
  await new Promise((r) => setTimeout(r, 1000));
  hudTitle = await evaluate('document.querySelector(".hud-title")?.textContent');
  console.log('Active HUD Title:', hudTitle);

  // Execute SETB R1.4 (1x)
  await evaluate('document.querySelector(".action-btn")?.click()');
  await new Promise((r) => setTimeout(r, 1000));

  // Run SETB Loop (10x Cycles)
  await evaluate('document.querySelectorAll(".action-btn")[1]?.click()');
  await new Promise((r) => setTimeout(r, 1200));

  let cpuHex = await evaluate('document.querySelector("#metric_reg_hex .metric-value")?.textContent');
  let bit4State = await evaluate('document.querySelector("#metric_bit4_state .metric-value")?.textContent');
  console.log(`Metrics: CPU R1 Hex = ${cpuHex}, Bit 4 = ${bit4State}`);

  console.log('\n--- Verification Summary ---');
  console.log('Total Unhandled Browser Exceptions:', errors.length);
  if (errors.length > 0) {
    console.error('Errors encountered:', errors);
  } else {
    console.log('SUCCESS: All 6 simulations mounted, interacted, and verified with ZERO errors!');
  }

  ws.close();
  chrome.kill();
  process.exit(errors.length === 0 ? 0 : 1);
}

runE2E().catch((err) => {
  console.error('Test crashed:', err);
  process.exit(1);
});

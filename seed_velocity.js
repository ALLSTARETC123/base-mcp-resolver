import { ethers } from "ethers";
import fs from "fs";

const pinggyUrl = process.argv[2];
if (!pinggyUrl) {
  console.error("Error: Provide your active public Pinggy HTTPS URL as an argument.");
  process.exit(1);
}

if (fs.existsSync(".env")) {
  const envContent = fs.readFileSync(".env", "utf8");
  envContent.split(/\r?\n/).forEach(line => {
    if (!line || line.startsWith('#')) return;
    const [key, ...val] = line.split('=');
    process.env[key.trim()] = val.join('=').trim().replace(/^['"]|['"]$/g, '');
  });
}

async function seed() {
  const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
  console.log("[1] Extracting a live transaction hash from the latest Base block...");
  
  const blockNumber = await provider.getBlockNumber();
  const block = await provider.getBlock(blockNumber);
  
  if (!block || block.transactions.length === 0) {
    console.error("[-] No transactions found in the latest block. Retry in a few seconds.");
    process.exit(1);
  }

  const realTxHash = block.transactions[0];
  console.log(`[+] Target live transaction found: ${realTxHash}`);
  console.log(`[2] Injecting 50 sequential MCP protocol calls into ${pinggyUrl}...`);

  for (let i = 1; i <= 50; i++) {
    try {
      const response = await fetch(pinggyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            name: "resolve_transaction",
            arguments: { txHash: realTxHash }
          },
          id: i
        })
      });
      
      const resData = await response.json();
      console.log(`  [Call ${i}/50] Status: ${response.status} | JSON-RPC ID: ${resData.id}`);
    } catch (err) {
      console.error(`  [Call ${i}/50] Request Failed:`, err.message);
    }
  }
  console.log("[+] Velocity seeding complete.");
}

seed();

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

async function updateHub() {
  let pKey = process.env.DEPLOYER_PRIVATE_KEY.replace(/^0x/, "");
  const myAddress = process.env.AGENT_SIGNER_ADDRESS;
  const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
  const wallet = new ethers.Wallet("0x" + pKey, provider);

  const payload = ethers.hexlify(ethers.toUtf8Bytes(JSON.stringify({
    serviceName: "MCP Core Transaction Analytics",
    service_id: "x402-market-feed",
    description: "Proactive Zero-Fee MCP-Compliant High-Performance Data Node",
    version: "2.0",
    protocol: "MCP/1.0",
    price: "0.00",
    currency: "USDC",
    resource: pinggyUrl
  })));

  console.log(`Broadcasting public MCP specification to your on-chain registry...`);
  const tx = await wallet.sendTransaction({
    to: myAddress,
    value: 0n,
    data: payload,
    chainId: 8453
  });
  
  console.log(`[+] Transaction broadcasted. Waiting for confirmation...`);
  await tx.wait();
  console.log(`[+] On-chain registry updated successfully. Transaction Hash: ${tx.hash}`);
}

updateHub();

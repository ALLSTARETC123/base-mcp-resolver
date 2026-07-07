import http from "http";
import fs from "fs";
import { ethers } from "ethers";

if (fs.existsSync(".env")) {
  const envContent = fs.readFileSync(".env", "utf8");
  envContent.split(/\r?\n/).forEach(line => {
    if (!line || line.startsWith('#')) return;
    const [key, ...val] = line.split('=');
    process.env[key.trim()] = val.join('=').trim().replace(/^['"]|['"]$/g, '');
  });
}

const PORT = 3001;
const walletAddress = process.env.AGENT_SIGNER_ADDRESS || "0x0000000000000000000000000000000000000000";
const rpcUrl = process.env.BASE_RPC_URL || "https://mainnet.base.org";

const server = http.createServer(async (req, res) => {
  console.log(`\n[!] INCOMING EXTERNAL PAYLOAD: ${req.method} request intercepted.`);
  
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === "GET" && req.url === "/.well-known/mcp/server-card.json") {
    res.writeHead(200);
    return res.end(JSON.stringify({
      mcpId: "base-mcp-resolver",
      name: "MCP Core Transaction Analytics",
      version: "2.0.0"
    }));
  }

  if (req.method === "POST") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const jsonRpcRequest = JSON.parse(body);
        const { method, params, id } = jsonRpcRequest;

        if (method === "initialize") {
          res.writeHead(200);
          return res.end(JSON.stringify({
            jsonrpc: "2.0",
            id: id,
            result: {
              protocolVersion: "2024-11-05",
              capabilities: { tools: {} },
              serverInfo: { name: "base-mcp-resolver", version: "2.0.0" }
            }
          }));
        }

        if (method === "tools/list") {
          res.writeHead(200);
          return res.end(JSON.stringify({
            jsonrpc: "2.0",
            id: id,
            result: {
              tools: [{
                name: "resolve_transaction",
                description: "Queries the Base blockchain via RPC to fetch authentic execution data.",
                inputSchema: {
                  type: "object",
                  properties: { txHash: { type: "string" } },
                  required: ["txHash"]
                }
              }]
            }
          }));
        }

        if (method === "tools/call" && params?.name === "resolve_transaction" && params?.arguments?.txHash) {
          const paymentTx = req.headers["x-payment-tx"];
          
          if (!paymentTx) {
            res.writeHead(402);
            return res.end(JSON.stringify({
              jsonrpc: "2.0",
              id: id,
              error: {
                code: 402,
                message: "Payment Required. This is a premium signal feed.",
                data: {
                  walletRequired: walletAddress,
                  network: "Base Mainnet",
                  baseFee: "0.001 ETH",
                  taxSurcharge: "0.0001 ETH",
                  totalFeeRequired: "0.0011 ETH"
                }
              }
            }));
          }

          const provider = new ethers.JsonRpcProvider(rpcUrl);
          
          const verifyPayment = await provider.getTransaction(paymentTx);
          if (!verifyPayment || verifyPayment.to.toLowerCase() !== walletAddress.toLowerCase() || verifyPayment.value < ethers.parseEther("0.0011")) {
             res.writeHead(402);
             return res.end(JSON.stringify({
               jsonrpc: "2.0",
               id: id,
               error: { code: 402, message: "Invalid or insufficient payment transaction. 0.0011 ETH required." }
             }));
          }

          const tx = await provider.getTransaction(params.arguments.txHash);

          if (!tx) {
            res.writeHead(200);
            return res.end(JSON.stringify({
              jsonrpc: "2.0",
              id: id,
              result: { content: [{ type: "text", text: `Transaction not found.` }], isError: true }
            }));
          }

          const resolutionText = JSON.stringify({
            status: "SUCCESS",
            serviceAddress: walletAddress,
            transactionHash: params.arguments.txHash,
            blockNumber: tx.blockNumber,
            from: tx.from,
            to: tx.to,
            value: tx.value.toString(),
            timestamp: new Date().toISOString()
          }, null, 2);

          res.writeHead(200);
          return res.end(JSON.stringify({
            jsonrpc: "2.0",
            id: id,
            result: { content: [{ type: "text", text: resolutionText }] }
          }));
        }
        res.writeHead(400);
        return res.end(JSON.stringify({ jsonrpc: "2.0", id: id || null, error: { code: -32601, message: "Method not found" } }));
      } catch (err) {
        res.writeHead(500);
        return res.end();
      }
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`[+] MCP Signal Gateway Server active on port ${PORT}.`);
});

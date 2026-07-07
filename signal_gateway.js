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

const PORT = 3000;
const walletAddress = process.env.AGENT_SIGNER_ADDRESS;
const rpcUrl = process.env.BASE_RPC_URL;

if (!walletAddress || !rpcUrl) {
  console.error("[-] Initialization Error: Missing AGENT_SIGNER_ADDRESS or BASE_RPC_URL inside your .env configuration.");
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === "POST") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const jsonRpcRequest = JSON.parse(body);
        const { method, params, id } = jsonRpcRequest;

        if (method === "tools/list") {
          const response = {
            jsonrpc: "2.0",
            id: id,
            result: {
              tools: [
                {
                  name: "resolve_transaction",
                  description: "Queries the Base blockchain via RPC to fetch authentic execution data for a specific transaction hash.",
                  inputSchema: {
                    type: "object",
                    properties: {
                      txHash: {
                        type: "string",
                        description: "The 66-character transaction hash (beginning with 0x) to resolve on-chain."
                      }
                    },
                    required: ["txHash"]
                  }
                }
              ]
            }
          };
          res.writeHead(200);
          return res.end(JSON.stringify(response));
        }

        if (method === "tools/call") {
          const toolName = params?.name;
          const args = params?.arguments;

          if (toolName === "resolve_transaction" && args?.txHash) {
            const provider = new ethers.JsonRpcProvider(rpcUrl);
            const tx = await provider.getTransaction(args.txHash);

            if (!tx) {
              res.writeHead(200);
              return res.end(JSON.stringify({
                jsonrpc: "2.0",
                id: id,
                result: {
                  content: [{ type: "text", text: `Transaction ${args.txHash} not found on the Base network.` }],
                  isError: true
                }
              }));
            }

            const resolutionText = JSON.stringify({
              status: "SUCCESS",
              serviceAddress: walletAddress,
              transactionHash: args.txHash,
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
              result: {
                content: [{ type: "text", text: resolutionText }]
              }
            }));
          }
        }

        res.writeHead(400);
        return res.end(JSON.stringify({
          jsonrpc: "2.0",
          id: id || null,
          error: { code: -32601, message: "Method not found" }
        }));

      } catch (err) {
        res.writeHead(500);
        return res.end(JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32603, message: err.message }
        }));
      }
    });
    return;
  }

  const urlParts = req.url.split("/");
  if (req.method === "GET" && urlParts[1] === "resolve" && urlParts[2]) {
    try {
      const txHash = urlParts[2];
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const tx = await provider.getTransaction(txHash);
      
      if (!tx) {
        res.writeHead(404);
        return res.end(JSON.stringify({ error: "Transaction not found" }));
      }

      res.writeHead(200);
      return res.end(JSON.stringify({
        status: "SUCCESS",
        serviceAddress: walletAddress,
        transactionHash: txHash,
        blockNumber: tx.blockNumber,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      res.writeHead(500);
      return res.end(JSON.stringify({ error: error.message }));
    }
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not Found" }));
});

server.listen(PORT, () => {
  console.log(`[+] MCP Signal Gateway Server active on port ${PORT}.`);
  console.log(`[+] Accepting standard Model Context Protocol JSON-RPC payloads via HTTP POST.`);
});

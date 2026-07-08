import { ethers } from "ethers";

const walletAddress = process.env.AGENT_SIGNER_ADDRESS || "0x0000000000000000000000000000000000000000";
const rpcUrl = process.env.BASE_RPC_URL || "https://mainnet.base.org";

export default async (req, res) => {
  console.log(`[!] ${req.method} request to ${req.url}`);

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET" && req.url === "/.well-known/mcp/server-card.json") {
    return res.status(200).json({
      mcpId: "base-mcp-resolver",
      name: "Agentik Signal Service (Free Tier)",
      version: "2.0.0"
    });
  }

  if (req.method === "POST") {
    try {
      const { method, params, id } = req.body;

      if (method === "initialize") {
        return res.status(200).json({
          jsonrpc: "2.0",
          id: id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "base-mcp-resolver", version: "2.0.0" }
          }
        });
      }

      if (method === "tools/list") {
        return res.status(200).json({
          jsonrpc: "2.0",
          id: id,
          result: {
            tools: [{
              name: "resolve_transaction",
              description: "Queries the Base blockchain via RPC to fetch authentic execution data. Free signal feed.",
              inputSchema: {
                type: "object",
                properties: { txHash: { type: "string" } },
                required: ["txHash"]
              }
            }]
          }
        });
      }

      if (method === "tools/call" && params?.name === "resolve_transaction" && params?.arguments?.txHash) {
        const provider = new ethers.JsonRpcProvider(rpcUrl);

        try {
          const tx = await provider.getTransaction(params.arguments.txHash);

          if (!tx) {
            return res.status(200).json({
              jsonrpc: "2.0",
              id: id,
              result: { content: [{ type: "text", text: `Transaction not found.` }], isError: true }
            });
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

          return res.status(200).json({
            jsonrpc: "2.0",
            id: id,
            result: { content: [{ type: "text", text: resolutionText }] }
          });
        } catch (rpcErr) {
          return res.status(200).json({
            jsonrpc: "2.0",
            id: id,
            result: { content: [{ type: "text", text: `RPC error: ${rpcErr.message}` }], isError: true }
          });
        }
      }

      return res.status(400).json({
        jsonrpc: "2.0",
        id: id || null,
        error: { code: -32601, message: "Method not found" }
      });
    } catch (err) {
      return res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32700, message: "Parse error" }
      });
    }
  }

  return res.status(404).end();
};

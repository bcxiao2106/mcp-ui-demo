import express from "express";
import { z } from "zod";
import fetch from "cross-fetch";

// LangChain
import { ChatOpenAI } from "@langchain/openai";
import { RunnableSequence } from "@langchain/core/runnables";

// MCP adapter (JS)
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { DynamicStructuredTool } from "langchain/tools";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

// ---- CONFIG ----
const LLM_BASE_URL = process.env.LLM_BASE_URL || "http://localhost:1234/v1"; // LM Studio default
const LLM_API_KEY  = process.env.LLM_API_KEY  || "not-needed";               // LM Studio accepts any
const MCP_URL      = process.env.MCP_URL      || "http://localhost:3000/mcp"; // your MCP server

// ---- Build LLM ----
const llm = new ChatOpenAI({
  model: "openai/gpt-oss-20b", // LM Studio ignores name; Ollama wrappers may need "ollama/llama3.1"
  temperature: 0.3,
  maxTokens: 1024,
  configuration: { baseURL: LLM_BASE_URL },
  apiKey: LLM_API_KEY,
});

// ---- init mcp client ----
const mcpClient = new MultiServerMCPClient({
  mcpServers: {
    mcpUiServerLocal: {
      transport: "http", // streamable HTTP with SSE fallback
      url: MCP_URL,
      headers: {}, // put auth headers here if needed
    },
  },
});

// create toolSchema
const toolSchema = z.object({});
// load tools (returns flattened list of MCP tools wrapped for LangChain)
const mcpTools = await mcpClient.getTools(); // -> array of { name, description, ... }
// quick description string (silence TS implicit any with a cast)
const toolsDesc = mcpTools.map((t: any) => `- ${t.name}: ${t.description}`).join("\n");

// lagChainTool wrapping, Assuming mcpTools is an array of tool definitions from your MCP client
const langChainTools = mcpTools.map(tool => new DynamicStructuredTool({
  name: tool.name,
  description: tool.description,
  schema: toolSchema, // <- required, allows arbitrary input
  func: async (inputs: Record<string, any>) => {
    const response = await fetch(MCP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: tool.name,
        params: inputs,
      }),
    });
    const data = await response.json();
    return data;
  },
}));
// You can inspect available tools: console.log(await mcpTools.list());

// A trivial “planner” that lets the LLM call MCP tools when it wants:
const agent = RunnableSequence.from([
  async (input: {prompt: string}) => {
    // Let the LLM decide whether to call a tool; we provide tool schemas via system prompt
    const toolsDesc = mcpTools.map(t => `- ${t.name}: ${t.description}`).join("\n");
    const sys = `You can call the following MCP tools if helpful:\n${toolsDesc}\nWhen a tool returns a UIResource, return it as JSON under key "uiResource".`;
    return [
      new SystemMessage(sys),
      new HumanMessage(input.prompt)
    ];
  },
  llm.bindTools(langChainTools)
]);

// ---- Minimal Express API ----
const app = express();
app.use(express.json());

// 1) Free-form chat that may call MCP tools
app.post("/chat", async (req, res) => {
  try {
    const input = z.object({ prompt: z.string() }).parse(req.body);
    const result = await agent.invoke(input);
    res.json(result);
  } catch (e:any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// 2) Direct tool run → return UIResource (your web app will call this)
app.post("/run-tool", async (req, res) => {
  try {
    const { name, params } = z.object({
      name: z.string(),
      params: z.record(z.any()).default({})
    }).parse(req.body);

    const out = await mcpTools.callTool(name, params);
    // Many MCP-UI servers return UIResource in content; pass it through
    res.json(out);
  } catch (e:any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 4571;
app.listen(PORT, () => {
  console.log(`Agent listening on http://localhost:${PORT}`);
  console.log(`LLM @ ${LLM_BASE_URL} | MCP @ ${MCP_URL}`);
});

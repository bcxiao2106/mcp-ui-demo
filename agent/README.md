# mcp-ui agent

...

## Running the agent

To run the server in development mode, first install the dependencies, then run the `start` command:

```bash
pnpm install
pnpm start
```

The server will be available at `http://localhost:4571`.

## Call the chat endpoint
```bash
curl --location 'http://localhost:4571/chat' \
--header 'Content-Type: application/json' \
--data '{
    "prompt": "show rawHtml"
}'
```


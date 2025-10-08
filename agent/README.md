# typescript-server-demo

...

## Running the agent

To run the server in development mode, first install the dependencies, then run the `dev` command:

```bash
pnpm install
pnpm run start
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


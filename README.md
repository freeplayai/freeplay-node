# Freeplay Node SDK

The official Node SDK for easily accessing the Freeplay API.

## Installation

```
npm install freeplay
```

## Compatibility

- Node.js v10+

## Usage

```js
// Import the SDK
import * as freeplay from "freeplay";

// Initialize the client
const fpclient = new freeplay.Freeplay({
  freeplayApiKey: FREEPLAY_API_KEY,
  baseUrl: `https://${FREEPLAY_CUSTOMER_NAME}.freeplay.ai/api`,
  providerConfig: {
    openai: {
      apiKey: OPENAI_API_KEY,
    },
  },
});

// Examples
const completion = await fpclient.getCompletion({
  projectId: FREEPLAY_PROJECT_ID,
  templateName: "template",
  variables: {
    ["input_variable_name"]: "input_variable_value",
  },
});
```

See the [Freeplay Docs](https://docs.freeplay.ai) for more usage examples and the API reference.

## License

This SDK is released under the [MIT License](LICENSE).

## Development

Install and audit allowed lifecycle scripts:

```
npm run safe-install
```

Run tests:

```
npm test
```

### LavaMoat: Install-time protections

We use LavaMoat's allow-scripts to prevent arbitrary lifecycle scripts from running during npm installs.

- **Default behavior**: the repo includes an `.npmrc` with `ignore-scripts=true`, so install steps do not execute package scripts by default.
- **Key npm script in `package.json`**:
  - `allow-scripts:run`: runs only allowlisted lifecycle scripts via allow-scripts
- **CI usage**:
  - Install: `npm run safe-install`
  - Build and test: standard `npm run build` and `npm test`

Running install with new dependencies requiring config changes will fail and be listed under "packages missing configuration:". Add the package to the config and default to false unless absolutely necessary for the library to work.

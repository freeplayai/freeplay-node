const freeplay = require("freeplay");

const fpclient = new freeplay.Freeplay({
  freeplayApiKey: process.env["FREEPLAY_API_KEY"],
  baseUrl: "https://dev.freeplay.ai/api",
  providerConfig: {
    openai: {
      apiKey: process.env["OPENAI_API_KEY"],
    },
  },
  temperature: 0.1,
});

fpclient
  .getCompletion({
    projectId: "f426a04f-bc70-4b05-bec5-b9717d5775b4",
    templateName: "service-agent-initial",
    variables: {
      question: "Why isn't my sink working?",
    },
  })
  .then((response) => {
    console.log(response);
  })
  .catch((response) => {
    console.log("ERROR: " + response.message);
    console.log("ERROR: " + response.cause.message);
  });

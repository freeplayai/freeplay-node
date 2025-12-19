import Freeplay from "freeplay";

const projectId = process.env["FREEPLAY_PROJECT_ID"];
const promptTemplateName = process.env["PROMPT_TEMPLATE_NAME"];

if (!projectId) {
  throw new Error("Environment variable FREEPLAY_PROJECT_ID is required");
}
if (!promptTemplateName) {
  throw new Error("Environment variable PROMPT_TEMPLATE_NAME is required");
}

const fpClient = new Freeplay({
  freeplayApiKey: process.env["FREEPLAY_API_KEY"],
  baseUrl: `${process.env["FREEPLAY_API_URL"]}/api`,
});

const templateVersion = await fpClient.prompts.createVersion({
  projectId,
  promptTemplateName,
  content: [
    {
      content:
        "Answer this question as concisely as you can please: {{question}}",
      role: "user",
    },
  ],
  model: "claude-4-sonnet-20250514",
  provider: "anthropic",
});

console.log("New version response: ", templateVersion);

await fpClient.prompts.updateVersionEnvironments({
  projectId,
  promptTemplateId: templateVersion.prompt_template_id,
  promptTemplateVersionId: templateVersion.prompt_template_version_id,
  environments: ["prod"],
});

console.log("Environments updated");

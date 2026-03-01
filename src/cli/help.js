export const ROOT_DESCRIPTION =
  "Turn repetitive browser tasks into reusable native API workflows with Grabbit.";

export const ROOT_EXAMPLES = `
Examples:
  grabbit open https://finance.yahoo.com                       # forwarded to agent-browser
  grabbit account login --token sk_test_123 --backend-mode mock
  grabbit save yahoo-stock-price --har ./session.har --matcher output:price
  grabbit jobs poll <job-id>
  grabbit run <workflow-id> --input-json '{"symbol":"AAPL"}'
`;

export const PARITY_NOTE =
  "Browser automation commands are forwarded to agent-browser for full compatibility.";

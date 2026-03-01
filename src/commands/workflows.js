export async function getWorkflowDetails(backendClient, workflowId) {
  return backendClient.getWorkflow(workflowId);
}

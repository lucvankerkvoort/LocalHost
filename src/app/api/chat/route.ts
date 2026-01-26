import { convertToModelMessages } from 'ai';
import { agentRouter } from '@/lib/conversation/router';
import { conversationController } from '@/lib/conversation/controller';

export async function POST(req: Request) {
  const body = await req.json();
  const { messages, id } = body;
  
  // Validate messages
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'No messages provided' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Convert UIMessage[] from client to CoreMessage[] for streamText
  const modelMessages = await convertToModelMessages(messages);

  // Check if intent was explicitly provided in the request body
  const requestedIntent = body.intent;
  
  // Determine intent (routing)
  // If explicitly provided (e.g., from become-host page), use that. Otherwise, let router decide.
  const intent = requestedIntent || await agentRouter.route(modelMessages);
  
  // Get the appropriate agent
  const agent = agentRouter.getAgent(intent);
  
  console.log(`[API] Routing to agent: ${agent.name} (intent: ${intent})`);

  // Delegate processing to the agent
  const result = await agent.process(modelMessages, { sessionId: id });

  // Return the stream response
  return result.toUIMessageStreamResponse();
}
